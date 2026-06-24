import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FolderOpen, Plus, Trash2, Download, FileText, Activity,
  ChevronRight, Package, StickyNote, CircuitBoard, FileImage,
  PenLine, Check, X, AlertCircle,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

const API = 'http://127.0.0.1:8080';

interface ProjectInfo {
  name:         string;
  description:  string;
  version:      string;
  created_at:   string;
  updated_at:   string;
  measurements: string[];
  reports:      string[];
  models:       string[];
  notes:        string[];
  images:       string[];
  _path:        string;
  _size_bytes:  number;
  _files:       string[];
}

interface LibraryItem {
  name:           string;
  relative_path?: string;
  component_type?: string | null;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; accept: string }> = {
  measurements: { label: 'Medidas',   icon: Activity,      accept: '.s1p,.s2p,.snp' },
  reports:      { label: 'Informes',  icon: FileText,      accept: '.pdf,.html' },
  models:       { label: 'Modelos',   icon: CircuitBoard,  accept: '.cir,.net,.asc' },
  notes:        { label: 'Notas',     icon: StickyNote,    accept: '.txt,.md' },
  images:       { label: 'Imágenes',  icon: FileImage,     accept: '.png,.jpg,.jpeg' },
};

function fmtBytes(b: number): string {
  if (b < 1024)        return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return iso; }
}

export function ProjectTool() {
  const [projects, setProjects]       = useState<ProjectInfo[]>([]);
  const [active, setActive]           = useState<ProjectInfo | null>(null);
  const [creating, setCreating]       = useState(false);
  const [newName, setNewName]         = useState('');
  const [newDesc, setNewDesc]         = useState('');
  const [saving, setSaving]           = useState(false);
  const [tab, setTab]                 = useState('measurements');
  const [measurements, setMeasurements] = useState<LibraryItem[]>([]);
  const [addingFrom, setAddingFrom]   = useState<string | null>(null);  // category being populated
  const [msg, setMsg]                 = useState<{ text: string; ok: boolean } | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [editName, setEditName]       = useState('');
  const [editDesc, setEditDesc]       = useState('');

  const flash = (text: string, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3000);
  };

  const loadProjects = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/project/list`);
      if (r.ok) {
        const list: ProjectInfo[] = await r.json();
        setProjects(list);
        if (active) {
          const updated = list.find(p => p._path === active._path);
          if (updated) setActive(updated);
        }
      }
    } catch {}
  }, [active]);

  useEffect(() => {
    loadProjects();
    fetch(`${API}/api/library/all`)
      .then(r => r.json())
      .then(d => setMeasurements(d.measurements ?? []))
      .catch(() => {});
  }, []);

  // ── Create project ─────────────────────────────────────────────────────────

  const createProject = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/project/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim(), save_path: '' }),
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json();
      flash(`Proyecto "${newName}" creado`);
      setCreating(false);
      setNewName('');
      setNewDesc('');
      await loadProjects();
      setActive(d.info);
    } catch (e: any) {
      flash(e.message ?? 'Error al crear proyecto', false);
    } finally {
      setSaving(false);
    }
  };

  // ── Add measurement from library ───────────────────────────────────────────

  const addMeasurement = async (relPath: string) => {
    if (!active) return;
    try {
      const r = await fetch(`${API}/api/project/add-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_path: active._path,
          file_relative_path: relPath,
          category: addingFrom ?? 'measurements',
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      flash('Archivo añadido al proyecto');
      await loadProjects();
    } catch (e: any) {
      flash(e.message ?? 'Error al añadir archivo', false);
    }
  };

  // ── Remove file ────────────────────────────────────────────────────────────

  const removeFile = async (internalPath: string) => {
    if (!active) return;
    try {
      await fetch(`${API}/api/project/remove-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: active._path, internal_path: internalPath }),
      });
      await loadProjects();
    } catch {}
  };

  // ── Update metadata ────────────────────────────────────────────────────────

  const saveMeta = async () => {
    if (!active) return;
    await fetch(`${API}/api/project/update-meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_path: active._path, name: editName, description: editDesc }),
    });
    setEditingMeta(false);
    await loadProjects();
  };

  // ── Download .rfproject ────────────────────────────────────────────────────

  const download = () => {
    if (!active) return;
    window.open(`${API}/api/project/download?path=${encodeURIComponent(active._path)}`);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-5 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            Gestor de Proyectos
          </h1>
          <p className="text-muted-foreground mt-1">
            Agrupa medidas, modelos e informes en proyectos portables <span className="font-mono text-xs">.rfproject</span>.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Nuevo proyecto
        </Button>
      </div>

      {/* Flash message */}
      {msg && (
        <div className={`flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium ${msg.ok ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
          {msg.ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {/* Create project form */}
      {creating && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold">Nuevo proyecto</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Nombre *</label>
                <Input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Filtro_LPF_2GHz_v3"
                  className="h-9"
                  onKeyDown={e => e.key === 'Enter' && createProject()}
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Descripción</label>
                <Input
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Descripción del proyecto"
                  className="h-9"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={createProject} disabled={!newName.trim() || saving} size="sm" className="gap-1.5">
                {saving ? 'Creando…' : <><Check className="w-3.5 h-3.5" />Crear</>}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setCreating(false); setNewName(''); setNewDesc(''); }}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">

        {/* ── Project list ──────────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
            Proyectos ({projects.length})
          </p>
          {projects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Package className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Sin proyectos. Crea el primero.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {projects.map(p => (
                <button
                  key={p._path}
                  onClick={() => { setActive(p); setAddingFrom(null); }}
                  className={`w-full text-left rounded-lg border p-3 transition-all hover:border-primary/50 ${active?._path === p._path ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
                >
                  <div className="flex items-center gap-2">
                    <Package className={`w-4 h-4 shrink-0 ${active?._path === p._path ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-semibold truncate flex-1">{p.name}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground pl-6">
                    <span>{p.measurements?.length ?? 0} medidas</span>
                    <span>·</span>
                    <span>{fmtBytes(p._size_bytes ?? 0)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Project detail ─────────────────────────────────────────────── */}
        {active ? (
          <div className="space-y-4">
            {/* Project header */}
            <Card className="border-border/50 bg-card/50">
              <CardContent className="p-4">
                {editingMeta ? (
                  <div className="space-y-3">
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-8 text-sm font-semibold" />
                    <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} className="h-8 text-sm" placeholder="Descripción" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveMeta} className="gap-1 h-7 text-xs"><Check className="w-3 h-3" />Guardar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingMeta(false)} className="h-7 text-xs"><X className="w-3 h-3" /></Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-foreground">{active.name}</h2>
                      {active.description && <p className="text-sm text-muted-foreground mt-0.5">{active.description}</p>}
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                        <span>Creado {fmtDate(active.created_at)}</span>
                        <span>·</span>
                        <span>Actualizado {fmtDate(active.updated_at)}</span>
                        <span>·</span>
                        <span>{fmtBytes(active._size_bytes)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditName(active.name); setEditDesc(active.description); setEditingMeta(true); }}>
                        <PenLine className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={download} className="gap-1.5 h-7 text-xs">
                        <Download className="w-3.5 h-3.5" />
                        .rfproject
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs value={tab} onValueChange={t => { setTab(t); setAddingFrom(null); }}>
              <TabsList className="h-8">
                {Object.entries(CATEGORY_META).map(([cat, meta]) => {
                  const count = (active[cat as keyof ProjectInfo] as string[])?.length ?? 0;
                  return (
                    <TabsTrigger key={cat} value={cat} className="text-xs gap-1.5 h-7">
                      <meta.icon className="w-3.5 h-3.5" />
                      {meta.label}
                      {count > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">{count}</Badge>}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {Object.entries(CATEGORY_META).map(([cat, meta]) => {
                const files: string[] = (active[cat as keyof ProjectInfo] as string[]) ?? [];
                const isAdding = addingFrom === cat;

                return (
                  <TabsContent key={cat} value={cat} className="mt-3 space-y-3">
                    {/* File list */}
                    {files.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-border p-8 text-center">
                        <meta.icon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Sin {meta.label.toLowerCase()} en el proyecto.</p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border/50 divide-y divide-border/30">
                        {files.map((f, i) => (
                          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                            <meta.icon className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-sm flex-1 truncate font-medium" title={f}>{f}</span>
                            <button
                              onClick={() => removeFile(`${cat}/${f}`)}
                              className="text-muted-foreground/50 hover:text-destructive transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add from library (for measurements) */}
                    {cat === 'measurements' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs h-8"
                          onClick={() => setAddingFrom(isAdding ? null : cat)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {isAdding ? 'Cerrar selector' : 'Añadir desde biblioteca'}
                        </Button>

                        {isAdding && (
                          <Card className="border-border/50">
                            <CardContent className="p-3">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                Biblioteca — haz clic para añadir
                              </p>
                              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                                {measurements
                                  .filter(m => (m.relative_path || m.name).match(/\.(s1p|s2p)$/i))
                                  .map((m, i) => {
                                    const inProject = files.includes(m.name);
                                    return (
                                      <button
                                        key={i}
                                        onClick={() => !inProject && addMeasurement(m.relative_path || m.name)}
                                        disabled={inProject}
                                        className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${inProject ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted/50'}`}
                                      >
                                        <Activity className="w-3 h-3 shrink-0 text-primary" />
                                        <span className="truncate">{m.name}</span>
                                        {inProject && <span className="ml-auto text-[9px] text-muted-foreground">ya incluido</span>}
                                      </button>
                                    );
                                  })}
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-border h-64">
            <div className="text-center">
              <FolderOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Selecciona un proyecto de la lista</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
