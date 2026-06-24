"""SQLite persistence layer for RF Tool Suite.

Tables: measurements, projects, calibration_sessions.
Call init_db(path) once at startup before using any helper.
"""
from __future__ import annotations

import os
from contextlib import contextmanager
from datetime import datetime, date
from typing import Any, Dict, List, Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text,
    create_engine, func,
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker, Session

Base = declarative_base()

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class Project(Base):
    __tablename__ = "projects"
    id          = Column(Integer, primary_key=True)
    name        = Column(String(200), nullable=False)
    description = Column(Text)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow)
    measurements = relationship("Measurement", back_populates="project")

    def to_dict(self) -> Dict:
        return {
            "id":          self.id,
            "name":        self.name,
            "description": self.description,
            "created_at":  self.created_at.isoformat() if self.created_at else None,
            "updated_at":  self.updated_at.isoformat() if self.updated_at else None,
        }


class CalibrationSession(Base):
    __tablename__ = "calibration_sessions"
    id         = Column(Integer, primary_key=True)
    name       = Column(String(200))
    kit_name   = Column(String(100))
    cal_type   = Column(String(50))   # SOLT, OSM, TRL
    vna_device = Column(String(100))
    operator   = Column(String(100))
    filepath   = Column(String(500))
    is_active  = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    measurements = relationship("Measurement", back_populates="calibration")

    def to_dict(self) -> Dict:
        return {
            "id":         self.id,
            "name":       self.name,
            "kit_name":   self.kit_name,
            "cal_type":   self.cal_type,
            "vna_device": self.vna_device,
            "operator":   self.operator,
            "filepath":   self.filepath,
            "is_active":  self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Measurement(Base):
    __tablename__ = "measurements"
    id               = Column(Integer, primary_key=True)
    project_id       = Column(Integer, ForeignKey("projects.id"), nullable=True)
    calibration_id   = Column(Integer, ForeignKey("calibration_sessions.id"), nullable=True)
    filename         = Column(String(300), nullable=False)
    filepath         = Column(String(500))
    component_type   = Column(String(50))   # capacitor, inductor, resistor
    device_name      = Column(String(100))  # NanoVNA-Izan, VNA-E5071C, …
    vna_device       = Column(String(100))
    operator         = Column(String(100))
    # Extracted metrics
    nominal_value    = Column(Float,   nullable=True)
    nominal_unit     = Column(String(10), nullable=True)   # F, H, Ω
    srf_hz           = Column(Float,   nullable=True)
    esr              = Column(Float,   nullable=True)
    q_factor         = Column(Float,   nullable=True)
    quality          = Column(String(20), nullable=True)   # good, fair, poor, bad
    markers          = Column(JSON,    nullable=True)
    # Network metadata
    nports           = Column(Integer, nullable=True)
    n_points         = Column(Integer, nullable=True)
    freq_start_hz    = Column(Float,   nullable=True)
    freq_stop_hz     = Column(Float,   nullable=True)
    # Misc
    created_at       = Column(DateTime, default=datetime.utcnow)
    tags             = Column(JSON,    nullable=True)
    notes            = Column(Text,    nullable=True)
    project          = relationship("Project",             back_populates="measurements")
    calibration      = relationship("CalibrationSession",  back_populates="measurements")

    def to_dict(self) -> Dict:
        return {
            "id":             self.id,
            "project_id":     self.project_id,
            "calibration_id": self.calibration_id,
            "filename":       self.filename,
            "filepath":       self.filepath,
            "component_type": self.component_type,
            "device_name":    self.device_name,
            "vna_device":     self.vna_device,
            "operator":       self.operator,
            "nominal_value":  self.nominal_value,
            "nominal_unit":   self.nominal_unit,
            "srf_hz":         self.srf_hz,
            "esr":            self.esr,
            "q_factor":       self.q_factor,
            "quality":        self.quality,
            "markers":        self.markers,
            "nports":         self.nports,
            "n_points":       self.n_points,
            "freq_start_hz":  self.freq_start_hz,
            "freq_stop_hz":   self.freq_stop_hz,
            "created_at":     self.created_at.isoformat() if self.created_at else None,
            "tags":           self.tags,
            "notes":          self.notes,
        }


# ---------------------------------------------------------------------------
# Engine / Session
# ---------------------------------------------------------------------------

_engine       = None
_SessionLocal = None


def init_db(db_path: str) -> None:
    global _engine, _SessionLocal
    _engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        echo=False,
    )
    Base.metadata.create_all(_engine)
    _SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)


@contextmanager
def _session() -> Session:
    if _SessionLocal is None:
        raise RuntimeError("DB not initialised — call init_db() first")
    s = _SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


# ---------------------------------------------------------------------------
# CRUD — Measurements
# ---------------------------------------------------------------------------

def register_measurement(
    filename:       str,
    filepath:       str,
    component_type: Optional[str]  = None,
    device_name:    Optional[str]  = None,
    vna_device:     Optional[str]  = None,
    operator:       Optional[str]  = None,
    nominal_value:  Optional[float] = None,
    nominal_unit:   Optional[str]  = None,
    srf_hz:         Optional[float] = None,
    esr:            Optional[float] = None,
    q_factor:       Optional[float] = None,
    quality:        Optional[str]  = None,
    markers:        Optional[Dict] = None,
    nports:         Optional[int]  = None,
    n_points:       Optional[int]  = None,
    freq_start_hz:  Optional[float] = None,
    freq_stop_hz:   Optional[float] = None,
    tags:           Optional[List[str]] = None,
    project_id:     Optional[int]  = None,
    calibration_id: Optional[int]  = None,
) -> int:
    """Register or update a measurement. Returns the row id."""
    with _session() as s:
        existing = s.query(Measurement).filter_by(filepath=filepath).first()
        if existing:
            existing.nominal_value  = nominal_value  if nominal_value  is not None else existing.nominal_value
            existing.nominal_unit   = nominal_unit   if nominal_unit   is not None else existing.nominal_unit
            existing.srf_hz         = srf_hz         if srf_hz         is not None else existing.srf_hz
            existing.esr            = esr            if esr            is not None else existing.esr
            existing.q_factor       = q_factor       if q_factor       is not None else existing.q_factor
            existing.quality        = quality        if quality        is not None else existing.quality
            existing.markers        = markers        if markers        is not None else existing.markers
            return existing.id

        m = Measurement(
            filename=filename, filepath=filepath,
            component_type=component_type, device_name=device_name,
            vna_device=vna_device, operator=operator,
            nominal_value=nominal_value, nominal_unit=nominal_unit,
            srf_hz=srf_hz, esr=esr, q_factor=q_factor, quality=quality,
            markers=markers, nports=nports, n_points=n_points,
            freq_start_hz=freq_start_hz, freq_stop_hz=freq_stop_hz,
            tags=tags, project_id=project_id, calibration_id=calibration_id,
            created_at=datetime.utcnow(),
        )
        s.add(m)
        s.flush()
        return m.id


def get_recent_measurements(n: int = 10) -> List[Dict]:
    with _session() as s:
        rows = (
            s.query(Measurement)
            .order_by(Measurement.created_at.desc())
            .limit(n)
            .all()
        )
        return [r.to_dict() for r in rows]


def search_measurements(
    query:          str           = "",
    component_type: Optional[str] = None,
    quality:        Optional[str] = None,
    limit:          int           = 50,
    offset:         int           = 0,
) -> List[Dict]:
    with _session() as s:
        q = s.query(Measurement)
        if query:
            q = q.filter(Measurement.filename.ilike(f"%{query}%"))
        if component_type:
            q = q.filter(Measurement.component_type == component_type)
        if quality:
            q = q.filter(Measurement.quality == quality)
        rows = (
            q.order_by(Measurement.created_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )
        return [r.to_dict() for r in rows]


def delete_measurement(measurement_id: int) -> bool:
    with _session() as s:
        m = s.query(Measurement).filter_by(id=measurement_id).first()
        if not m:
            return False
        s.delete(m)
        return True


# ---------------------------------------------------------------------------
# CRUD — Projects
# ---------------------------------------------------------------------------

def create_project(name: str, description: str = "") -> Dict:
    with _session() as s:
        p = Project(name=name, description=description, created_at=datetime.utcnow(), updated_at=datetime.utcnow())
        s.add(p)
        s.flush()
        return p.to_dict()


def list_projects() -> List[Dict]:
    with _session() as s:
        rows = s.query(Project).order_by(Project.updated_at.desc()).all()
        return [r.to_dict() for r in rows]


def assign_measurement_to_project(measurement_id: int, project_id: int) -> bool:
    with _session() as s:
        m = s.query(Measurement).filter_by(id=measurement_id).first()
        if not m:
            return False
        m.project_id = project_id
        proj = s.query(Project).filter_by(id=project_id).first()
        if proj:
            proj.updated_at = datetime.utcnow()
        return True


# ---------------------------------------------------------------------------
# CRUD — Calibration Sessions
# ---------------------------------------------------------------------------

def register_calibration(
    name:       str,
    kit_name:   str  = "",
    cal_type:   str  = "SOLT",
    vna_device: str  = "",
    operator:   str  = "",
    filepath:   str  = "",
    is_active:  bool = False,
) -> int:
    with _session() as s:
        if is_active:
            s.query(CalibrationSession).filter_by(is_active=True).update({"is_active": False})
        c = CalibrationSession(
            name=name, kit_name=kit_name, cal_type=cal_type,
            vna_device=vna_device, operator=operator,
            filepath=filepath, is_active=is_active,
            created_at=datetime.utcnow(),
        )
        s.add(c)
        s.flush()
        return c.id


def get_active_calibration() -> Optional[Dict]:
    with _session() as s:
        c = s.query(CalibrationSession).filter_by(is_active=True).order_by(CalibrationSession.created_at.desc()).first()
        return c.to_dict() if c else None


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

def get_stats() -> Dict[str, Any]:
    with _session() as s:
        total         = s.query(func.count(Measurement.id)).scalar() or 0
        today_str     = date.today().isoformat()
        today_count   = (
            s.query(func.count(Measurement.id))
            .filter(func.date(Measurement.created_at) == today_str)
            .scalar() or 0
        )
        total_projects = s.query(func.count(Project.id)).scalar() or 0
        total_cals     = s.query(func.count(CalibrationSession.id)).scalar() or 0

        quality_rows = (
            s.query(Measurement.quality, func.count(Measurement.id))
            .group_by(Measurement.quality)
            .all()
        )
        quality = {q or "unknown": cnt for q, cnt in quality_rows}

        type_rows = (
            s.query(Measurement.component_type, func.count(Measurement.id))
            .group_by(Measurement.component_type)
            .all()
        )
        component_types = {t or "unknown": cnt for t, cnt in type_rows}

        return {
            "total_measurements":  total,
            "measurements_today":  today_count,
            "total_projects":      total_projects,
            "total_calibrations":  total_cals,
            "quality":             quality,
            "component_types":     component_types,
        }
