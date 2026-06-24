"""RF Tool Suite — .rfproject file manager.

A .rfproject is a ZIP archive with the following internal structure:
  project.json          — manifest (name, description, file lists)
  measurements/         — Touchstone (.s1p/.s2p) files
  reports/              — PDF / HTML reports
  models/               — SPICE / netlist files
  notes/                — text / markdown notes
  images/               — setup photos or screenshots

All public functions work on the filesystem path of the .rfproject file.
"""
from __future__ import annotations

import json
import os
import shutil
import tempfile
import zipfile
from datetime import datetime
from typing import Dict, List, Optional

MANIFEST_NAME = "project.json"
CATEGORIES    = ("measurements", "reports", "models", "notes", "images")


# ---------------------------------------------------------------------------
# Create / open
# ---------------------------------------------------------------------------

def create_project(path: str, name: str, description: str = "") -> str:
    """Create a new .rfproject file.  Returns the final path (with extension)."""
    if not path.endswith(".rfproject"):
        path += ".rfproject"

    manifest = {
        "name":        name,
        "description": description,
        "version":     "1.0",
        "created_at":  _now(),
        "updated_at":  _now(),
        "measurements": [],
        "reports":      [],
        "models":       [],
        "notes":        [],
        "images":       [],
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(MANIFEST_NAME, json.dumps(manifest, indent=2, ensure_ascii=False))
        for cat in CATEGORIES:
            zf.writestr(f"{cat}/.keep", "")
    return path


def get_manifest(path: str) -> Dict:
    """Return the project manifest dict."""
    with zipfile.ZipFile(path, "r") as zf:
        return json.loads(zf.read(MANIFEST_NAME))


def get_project_info(path: str) -> Dict:
    """Return manifest plus full file listing."""
    with zipfile.ZipFile(path, "r") as zf:
        manifest = json.loads(zf.read(MANIFEST_NAME))
        names = [
            n for n in zf.namelist()
            if not n.endswith("/") and not n.endswith(".keep") and n != MANIFEST_NAME
        ]
        manifest["_files"]    = names
        manifest["_size_bytes"] = os.path.getsize(path)
    return manifest


# ---------------------------------------------------------------------------
# Add / remove files
# ---------------------------------------------------------------------------

def add_file(
    project_path: str,
    src_path:     str,
    category:     str = "measurements",
    alias:        Optional[str] = None,
) -> str:
    """Copy *src_path* into the project under *category/*.  Returns internal path."""
    if category not in CATEGORIES:
        raise ValueError(f"Categoría inválida: {category}. Opciones: {CATEGORIES}")

    basename    = alias or os.path.basename(src_path)
    internal    = f"{category}/{basename}"

    # Read manifest, add file, rebuild ZIP
    manifest = get_manifest(project_path)
    if basename not in manifest.get(category, []):
        manifest.setdefault(category, []).append(basename)
    manifest["updated_at"] = _now()

    _rebuild_zip(project_path, manifest, {internal: src_path})
    return internal


def add_content(
    project_path: str,
    content:      bytes,
    internal_path: str,
    category:     str = "notes",
) -> str:
    """Add raw bytes as a file inside the project."""
    if category not in CATEGORIES:
        raise ValueError(f"Categoría inválida: {category}")

    basename = os.path.basename(internal_path)
    manifest = get_manifest(project_path)
    if basename not in manifest.get(category, []):
        manifest.setdefault(category, []).append(basename)
    manifest["updated_at"] = _now()

    _rebuild_zip(project_path, manifest, {internal_path: None}, extra_bytes={internal_path: content})
    return internal_path


def remove_file(project_path: str, internal_path: str) -> bool:
    """Remove a file from the project.  Returns True if found and removed."""
    manifest = get_manifest(project_path)
    parts = internal_path.split("/", 1)
    if len(parts) == 2:
        cat, name = parts
        lst = manifest.get(cat, [])
        if name in lst:
            lst.remove(name)
            manifest["updated_at"] = _now()
            _rebuild_zip(project_path, manifest, {}, remove={internal_path})
            return True
    return False


def extract_file(project_path: str, internal_path: str, output_dir: str) -> str:
    """Extract one file to *output_dir*.  Returns the output path."""
    os.makedirs(output_dir, exist_ok=True)
    with zipfile.ZipFile(project_path, "r") as zf:
        zf.extract(internal_path, output_dir)
    return os.path.join(output_dir, internal_path)


def read_file(project_path: str, internal_path: str) -> bytes:
    """Return the raw bytes of a file inside the project."""
    with zipfile.ZipFile(project_path, "r") as zf:
        return zf.read(internal_path)


# ---------------------------------------------------------------------------
# Listing helpers
# ---------------------------------------------------------------------------

def list_files(project_path: str, category: Optional[str] = None) -> List[str]:
    """Return internal paths for all files (optionally filtered by category)."""
    with zipfile.ZipFile(project_path, "r") as zf:
        names = [
            n for n in zf.namelist()
            if not n.endswith("/") and not n.endswith(".keep") and n != MANIFEST_NAME
        ]
    if category:
        names = [n for n in names if n.startswith(f"{category}/")]
    return names


def update_metadata(project_path: str, name: Optional[str] = None, description: Optional[str] = None) -> None:
    """Update project name / description."""
    manifest = get_manifest(project_path)
    if name is not None:
        manifest["name"] = name
    if description is not None:
        manifest["description"] = description
    manifest["updated_at"] = _now()
    _rebuild_zip(project_path, manifest, {})


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _now() -> str:
    return datetime.utcnow().isoformat()


def _rebuild_zip(
    path:        str,
    manifest:    Dict,
    add_files:   Dict[str, Optional[str]],   # internal_path → src_path (None = use extra_bytes)
    extra_bytes: Dict[str, bytes] = None,    # internal_path → bytes
    remove:      set = None,
) -> None:
    """
    Rebuild the ZIP: copy existing entries (minus *remove*), add *add_files*,
    and update the manifest.
    """
    if extra_bytes is None:
        extra_bytes = {}
    if remove is None:
        remove = set()

    tmp = path + ".tmp"
    try:
        with zipfile.ZipFile(path, "r") as zin:
            with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
                # Write updated manifest first
                zout.writestr(MANIFEST_NAME, json.dumps(manifest, indent=2, ensure_ascii=False))
                # Copy existing entries (skip manifest and removed files)
                for item in zin.infolist():
                    if item.filename == MANIFEST_NAME:
                        continue
                    if item.filename in remove:
                        continue
                    if item.filename in add_files:
                        continue  # will be written below
                    zout.writestr(item, zin.read(item.filename))
                # Add new external files
                for internal, src in add_files.items():
                    if src is None:
                        zout.writestr(internal, extra_bytes.get(internal, b""))
                    else:
                        zout.write(src, internal)
                # Add raw-bytes entries
                for internal, data in extra_bytes.items():
                    if internal not in add_files:
                        zout.writestr(internal, data)

        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
