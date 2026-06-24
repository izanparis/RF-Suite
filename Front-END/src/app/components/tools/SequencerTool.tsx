import React, { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { cn } from '../ui/utils';
import {
  Play, Square, Plus, Trash2, ChevronUp, ChevronDown,
  CheckCircle2, XCircle, Loader2, Clock, FileText,
  ChevronRight, Settings2, Terminal,
} from 'lucide-react';

const API = 'http://localhost:8080';

// ── Step type definitions ─────────────────────────────────────────────────────

const STEP_TYPES: Record<string, { label: string; color: string; params: StepParamDef[] }> = {
  load_file:       { label: 'Cargar archivo',      color: 'text-blue-400',   params: [{ key: 'path', label: 'Ruta relativa (Biblioteca/...)', type: 'text' }] },
  quick_extract:   { label: 'Extracción rápida C/L', color: 'text-yellow-400', params: [{ key: 'component_type', label: 'Tipo', type: 'select', options: ['capacitor','inductor',''] }] },
  compact_model:   { label: 'Modelo compacto',     color: 'text-purple-400', params: [
    { key: 'method',         label: 'Método',     type: 'select', options: ['physical','vf'] },
    { key: 'component_type', label: 'Tipo',       type: 'select', options: ['capacitor','inductor'] },
    { key: 'topology',       label: 'Topología',  type: 'select', options: ['shunt','series','oneport'] },
    { key: 'z0',             label: 'Z0 (Ω)',     type: 'text', default: '50' },
  ]},
  detect_markers:  { label: 'Detectar marcadores', color: 'text-cyan-400',   params: [
    { key: 'component_type', label: 'Tipo',       type: 'select', options: ['capacitor','inductor',''] },
    { key: 'topology',       label: 'Topología',  type: 'select', options: ['shunt','series','oneport'] },
  ]},
  evaluate_mask:   { label: 'Evaluar Pass/Fail',   color: 'text-orange-400', params: [] },
  save_to_db:      { label: 'Guardar en BD',        color: 'text-green-400',  params: [
    { key: 'component_type', label: 'Tipo',   type: 'text', default: '' },
    { key: 'device',         label: 'Device', type: 'text', default: '' },
  ]},
  generate_report: { label: 'Generar informe',     color: 'text-pink-400',   params: [
    { key: 'device',         label: 'Dispositivo',    type: 'text', default: '' },
    { key: 'component_type', label: 'Tipo componente', type: 'text', default: '' },
  ]},
  wait:            { label: 'Esperar',              color: 'text-slate-400',  params: [{ key: 'seconds', label: 'Segundos', type: 'text', default: '2' }] },
  note:            { label: 'Nota',                 color: 'text-slate-400',  params: [{ key: 'message', label: 'Mensaje', type: 'text', default: '' }] },
};

interface StepParamDef {
  key: string; label: string; type: 'text' | 'select'; options?: string[]; default?: string;
}

interface Step {
  id:     string;
  type:   string;
  label:  string;
  params: Record<string, string>;
}

interface LogEntry {
  event:  string;
  idx?:   number;
  type?:  string;
  label?: string;
  result?: any;
  error?: string;
  summary?: any;
  ts?: number;
}

// ── Default recipes ───────────────────────────────────────────────────────────

const PRESET_RECIPES: Record<string, Step[]> = {
  'QC rápido de capacitor': [
    { id: uid(), type: 'load_file',     label: 'Cargar medida',    params: { path: '' } },
    { id: uid(), type: 'quick_extract', label: 'Extracción rápida', params: { component_type: 'capacitor' } },
    { id: uid(), type: 'detect_markers',label: 'Detectar markers',  params: { component_type: 'capacitor', topology: 'shunt' } },
    { id: uid(), type: 'evaluate_mask', label: 'Evaluar mask',      params: {} },
    { id: uid(), type: 'save_to_db',    label: 'Guardar en BD',     params: { component_type: 'capacitor', device: '' } },
  ],
  'Modelo compacto completo': [
    { id: uid(), type: 'load_file',      label: 'Cargar medida',     params: { path: '' } },
    { id: uid(), type: 'quick_extract',  label: 'Extracción rápida', params: { component_type: 'capacitor' } },
    { id: uid(), type: 'compact_model',  label: 'Modelo compacto',   params: { method: 'physical', component_type: 'capacitor', topology: 'shunt', z0: '50' } },
    { id: uid(), type: 'detect_markers', label: 'Detectar markers',  params: { component_type: 'capacitor', topology: 'shunt' } },
    { id: uid(), type: 'save_to_db',     label: 'Guardar en BD',     params: { component_type: 'capacitor', device: '' } },
    { id: uid(), type: 'generate_report',label: 'Generar informe',   params: { device: '', component_type: 'capacitor' } },
  ],
};

function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Component ──────────────────────────────────────────────────────────────────

export function SequencerTool() {
  const [steps, setSteps]           = useState<Step[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [running, setRunning]       = useState(false);
  const [log, setLog]               = useState<LogEntry[]>([]);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [done, setDone]             = useState(false);
  const abortRef                    = useRef<boolean>(false);
  const logEndRef                   = useRef<HTMLDivElement>(null);

  const addLog = useCallback((entry: LogEntry) => {
    setLog(prev => [...prev, entry]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  // ── Recipe manipulation ───────────────────────────────────────────────────

  function addStep(type: string) {
    const def = STEP_TYPES[type];
    const params: Record<string, string> = {};
    def.params.forEach(p => { params[p.key] = p.default ?? (p.options?.[0] ?? ''); });
    const step: Step = { id: uid(), type, label: def.label, params };
    setSteps(prev => [...prev, step]);
    setSelectedIdx(steps.length);
  }

  function removeStep(idx: number) {
    setSteps(prev => prev.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  }

  function moveStep(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= steps.length) return;
    const arr = [...steps];
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    setSteps(arr);
    setSelectedIdx(next);
  }

  function updateParam(idx: number, key: string, value: string) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, params: { ...s.params, [key]: value } } : s));
  }

  function loadPreset(name: string) {
    const recipe = PRESET_RECIPES[name];
    if (!recipe) return;
    setSteps(recipe.map(s => ({ ...s, id: uid() })));
    setSelectedIdx(null);
    setLog([]);
    setDone(false);
  }

  // ── Run sequence via SSE ──────────────────────────────────────────────────

  async function runSequence() {
    if (steps.length === 0) { toast.error('Añade al menos un paso'); return; }
    setRunning(true); setLog([]); setDone(false); setCurrentStep(-1);
    abortRef.current = false;

    const payload = {
      steps: steps.map(s => ({ type: s.type, label: s.label, params: s.params })),
    };

    try {
      const res = await fetch(`${API}/api/sequencer/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || 'Error iniciando secuenciador');

      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf = '';

      while (!abortRef.current) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          try {
            const entry: LogEntry = JSON.parse(line.slice(5).trim());
            addLog(entry);
            if (entry.event === 'step_start') setCurrentStep(entry.idx ?? -1);
            if (entry.event === 'done' || entry.event === 'abort') setDone(true);
          } catch {}
        }
      }
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setRunning(false);
      setCurrentStep(-1);
    }
  }

  function stopSequence() {
    abortRef.current = true;
    setRunning(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const selectedStep = selectedIdx !== null ? steps[selectedIdx] : null;
  const hasError = log.some(l => l.event === 'step_error' || l.event === 'abort');
  const isDone   = log.some(l => l.event === 'done');

  return (
    <ToolShell
      title="Secuenciador de Pruebas"
      description="Automatiza flujos de medida RF: carga, extracción, marcadores, BD e informes."
    >
      <div className="max-w-6xl mx-auto px-4 pb-8 space-y-4">

        {/* ── Toolbar ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset loader */}
          <Select onValueChange={loadPreset}>
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue placeholder="Cargar preset..." />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(PRESET_RECIPES).map(name => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Add step */}
          <Select onValueChange={addStep}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue placeholder="Añadir paso..." />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STEP_TYPES).map(([type, def]) => (
                <SelectItem key={type} value={type}>{def.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto flex gap-2">
            {running ? (
              <Button variant="destructive" size="sm" className="h-8 text-xs gap-1.5" onClick={stopSequence}>
                <Square className="w-3.5 h-3.5" /> Detener
              </Button>
            ) : (
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={runSequence} disabled={steps.length === 0}>
                <Play className="w-3.5 h-3.5" /> Ejecutar ({steps.length} pasos)
              </Button>
            )}
          </div>
        </div>

        {/* ── Main layout ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">

          {/* Left: recipe + config ─────────────────────────────────────────── */}
          <div className="space-y-3">
            {/* Step list */}
            <Card>
              <CardHeader className="py-2.5 px-4 border-b border-border">
                <CardTitle className="text-sm">Receta ({steps.length} pasos)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {steps.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-xs">
                    <Settings2 className="w-8 h-8 mb-2 opacity-20" />
                    Carga un preset o añade pasos con el selector de arriba
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {steps.map((step, idx) => {
                      const def = STEP_TYPES[step.type];
                      const isRunning = running && currentStep === idx;
                      const logEntry = log.find(l => l.event === 'step_done' && l.idx === idx);
                      const errEntry = log.find(l => l.event === 'step_error' && l.idx === idx);
                      return (
                        <div
                          key={step.id}
                          className={cn(
                            'flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors',
                            selectedIdx === idx && 'bg-primary/5',
                          )}
                          onClick={() => setSelectedIdx(idx)}
                        >
                          {/* Status icon */}
                          <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                            {isRunning ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> :
                             logEntry   ? <CheckCircle2 className="w-4 h-4 text-green-500" /> :
                             errEntry   ? <XCircle className="w-4 h-4 text-destructive" /> :
                             <span className="text-[10px] font-mono text-muted-foreground">{idx + 1}</span>}
                          </div>

                          {/* Type dot */}
                          <div className={cn('shrink-0 text-[10px] font-bold uppercase tracking-wide', def?.color ?? 'text-muted-foreground')}>
                            {step.type.replace('_', ' ')}
                          </div>

                          {/* Label */}
                          <div className="flex-1 min-w-0 text-xs truncate">{step.label}</div>

                          {/* Mini result */}
                          {logEntry?.result && (
                            <div className="text-[10px] font-mono text-muted-foreground hidden sm:block">
                              {logEntry.result.nominal_value != null
                                ? `${logEntry.result.nominal_value?.toFixed(3)} ${logEntry.result.unit ?? ''}`
                                : logEntry.result.nrms != null
                                ? `NRMS=${(logEntry.result.nrms * 100).toFixed(1)}%`
                                : logEntry.result.result ?? logEntry.result.waited_s != null ? `${logEntry.result.waited_s}s` : ''}
                            </div>
                          )}

                          {/* Controls */}
                          <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                            <button className="p-1 hover:bg-muted rounded" onClick={() => moveStep(idx, -1)} disabled={idx === 0 || running}>
                              <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                            <button className="p-1 hover:bg-muted rounded" onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1 || running}>
                              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                            <button className="p-1 hover:bg-muted rounded hover:text-destructive" onClick={() => removeStep(idx)} disabled={running}>
                              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step config panel */}
            {selectedStep && (
              <Card>
                <CardHeader className="py-2.5 px-4 border-b border-border">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                    Config: {selectedStep.label}
                    <span className="text-[10px] text-muted-foreground ml-1">paso {(selectedIdx ?? 0) + 1}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  {/* Custom label */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-muted-foreground uppercase font-semibold">Etiqueta</label>
                    <Input
                      value={selectedStep.label}
                      onChange={e => setSteps(prev => prev.map((s, i) => i === selectedIdx ? { ...s, label: e.target.value } : s))}
                      className="h-7 text-xs"
                    />
                  </div>
                  {/* Params */}
                  {STEP_TYPES[selectedStep.type]?.params.map(paramDef => (
                    <div key={paramDef.key} className="space-y-1">
                      <label className="text-[10px] text-muted-foreground uppercase font-semibold">{paramDef.label}</label>
                      {paramDef.type === 'select' ? (
                        <Select
                          value={selectedStep.params[paramDef.key] ?? ''}
                          onValueChange={v => updateParam(selectedIdx!, paramDef.key, v)}
                        >
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {paramDef.options?.map(opt => (
                              <SelectItem key={opt} value={opt}>{opt || '(auto)'}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={selectedStep.params[paramDef.key] ?? ''}
                          onChange={e => updateParam(selectedIdx!, paramDef.key, e.target.value)}
                          className="h-7 text-xs font-mono"
                          placeholder={paramDef.default ?? ''}
                        />
                      )}
                    </div>
                  ))}
                  {STEP_TYPES[selectedStep.type]?.params.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">Este paso no tiene parámetros configurables.</p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right: log ─────────────────────────────────────────────────────── */}
          <Card className="flex flex-col">
            <CardHeader className="py-2.5 px-4 border-b border-border flex flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
                Log de ejecución
              </CardTitle>
              {(isDone || hasError) && (
                <span className={cn(
                  'text-[10px] font-bold uppercase px-2 py-0.5 rounded-full',
                  hasError ? 'bg-destructive/15 text-destructive' : 'bg-green-500/15 text-green-500'
                )}>
                  {hasError ? 'ERROR' : 'OK'}
                </span>
              )}
            </CardHeader>
            <CardContent className="p-2 flex-1 overflow-y-auto min-h-[300px] max-h-[520px] font-mono text-[11px] custom-scrollbar">
              {log.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40 text-xs">
                  <Clock className="w-6 h-6 mb-1" />
                  En espera
                </div>
              ) : (
                <div className="space-y-0.5">
                  {log.map((entry, i) => <LogLine key={i} entry={entry} totalSteps={steps.length} />)}
                  <div ref={logEndRef} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ToolShell>
  );
}

// ── LogLine sub-component ─────────────────────────────────────────────────────

function LogLine({ entry, totalSteps }: { entry: LogEntry; totalSteps: number }) {
  const [expanded, setExpanded] = useState(false);

  if (entry.event === 'start') {
    return (
      <div className="text-muted-foreground py-0.5">
        ▶ Iniciando secuencia — {totalSteps} pasos
      </div>
    );
  }
  if (entry.event === 'step_start') {
    return (
      <div className="text-primary/80 py-0.5 flex items-center gap-1.5">
        <Loader2 className="w-3 h-3 animate-spin" />
        [{(entry.idx ?? 0) + 1}/{totalSteps}] {entry.label}…
      </div>
    );
  }
  if (entry.event === 'step_done') {
    const r = entry.result ?? {};
    const detail = r.nominal_value != null ? ` → ${r.nominal_value?.toFixed(3)} ${r.unit ?? ''}`
                 : r.nrms != null          ? ` → NRMS ${(r.nrms * 100).toFixed(1)}%`
                 : r.result                ? ` → ${r.result}`
                 : r.db_id != null         ? ` → ID=${r.db_id}`
                 : r.size_kb != null       ? ` → ${r.size_kb} KB`
                 : r.waited_s != null      ? ` → ${r.waited_s}s`
                 : '';
    return (
      <div className="py-0.5">
        <div
          className="text-green-400 flex items-center gap-1.5 cursor-pointer hover:text-green-300"
          onClick={() => setExpanded(v => !v)}
        >
          <CheckCircle2 className="w-3 h-3 shrink-0" />
          [{(entry.idx ?? 0) + 1}] {entry.label}{detail}
          {Object.keys(r).length > 0 && <ChevronRight className={cn('w-3 h-3 ml-auto transition-transform', expanded && 'rotate-90')} />}
        </div>
        {expanded && (
          <pre className="ml-5 mt-0.5 text-[10px] text-muted-foreground bg-muted/20 rounded px-2 py-1 overflow-x-auto">
            {JSON.stringify(r, null, 2)}
          </pre>
        )}
      </div>
    );
  }
  if (entry.event === 'step_error') {
    return (
      <div className="text-destructive py-0.5">
        <div className="flex items-center gap-1.5">
          <XCircle className="w-3 h-3 shrink-0" />
          [{(entry.idx ?? 0) + 1}] {entry.label}: {entry.error}
        </div>
      </div>
    );
  }
  if (entry.event === 'abort') {
    return <div className="text-destructive py-0.5">✕ Secuencia abortada: {entry.error}</div>;
  }
  if (entry.event === 'done') {
    const s = entry.summary ?? {};
    return (
      <div className="text-green-500 py-0.5 border-t border-green-500/20 mt-1 pt-1">
        ✓ Secuencia completada — {s.file_path ?? ''}{s.quality ? ` | calidad: ${s.quality}` : ''}
      </div>
    );
  }
  return null;
}
