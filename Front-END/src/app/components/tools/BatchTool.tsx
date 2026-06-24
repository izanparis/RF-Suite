import React, { useState, useEffect, useRef } from 'react';
import {
  Layers, Play, Square, Download, CheckSquare, Square as SquareIcon,
  CheckCircle2, XCircle, Clock, AlertCircle, Filter, BarChart2, Database
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '../ui/table';

const API = 'http://127.0.0.1:8080';

interface LibraryItem {
  name: string;
  relative_path?: string;
  device?: string;
  component_type?: string | null;
}

interface BatchResult {
  file: string;
  path: string;
  value_disp?: string;
  nominal_value?: number;
  unit?: string;
  srf_hz?: number | null;
  esr?: number | null;
  q_factor?: number | null;
  nrms?: number | null;
  quality?: string;
  quality_score?: number;
  error?: string;
}

function formatSRF(hz?: number | null) {
  if (!hz) return '—';
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(3)} GHz`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(2)} MHz`;
  return `${(hz / 1e3).toFixed(1)} kHz`;
}

function qualityColor(q?: string) {
  if (q === 'good')  return 'text-emerald-600 dark:text-emerald-400';
  if (q === 'fair')  return 'text-amber-600 dark:text-amber-400';
  if (q === 'poor')  return 'text-red-500 dark:text-red-400';
  return 'text-muted-foreground';
}

interface BatchStats {
  count:     number;
  errors:    number;
  mean:      number | null;
  std:       number | null;
  min:       number | null;
  max:       number | null;
  unit:      string;
  yield_pct: number;
  good:      number;
  fair:      number;
  poor:      number;
}

function computeStats(results: BatchResult[]): BatchStats {
  const valid = results.filter(r => !r.error && r.nominal_value != null && r.nominal_value > 0);
  const vals  = valid.map(r => r.nominal_value as number);
  const unit  = valid[0]?.unit ?? '';
  const good  = results.filter(r => r.quality === 'good').length;
  const fair  = results.filter(r => r.quality === 'fair').length;
  const poor  = results.filter(r => r.quality === 'poor').length;

  let mean: number | null = null;
  let std:  number | null = null;
  let min:  number | null = null;
  let max:  number | null = null;

  if (vals.length > 0) {
    mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    std  = vals.length > 1
      ? Math.sqrt(vals.reduce((a, b) => a + (b - mean!) ** 2, 0) / (vals.length - 1))
      : 0;
    min  = Math.min(...vals);
    max  = Math.max(...vals);
  }

  const yield_pct = results.length > 0
    ? Math.round((good / results.length) * 100)
    : 0;

  return { count: results.length, errors: results.filter(r => !!r.error).length,
           mean, std, min, max, unit, yield_pct, good, fair, poor };
}

function fmtSIValue(v: number | null, unit: string): string {
  if (v == null) return '—';
  if (unit === 'F') {
    if (v >= 1e-6) return `${(v * 1e6).toPrecision(4)} µF`;
    if (v >= 1e-9) return `${(v * 1e9).toPrecision(4)} nF`;
    return `${(v * 1e12).toPrecision(4)} pF`;
  }
  if (unit === 'H') {
    if (v >= 1e-3) return `${(v * 1e3).toPrecision(4)} mH`;
    if (v >= 1e-6) return `${(v * 1e6).toPrecision(4)} µH`;
    return `${(v * 1e9).toPrecision(4)} nH`;
  }
  return `${v.toPrecision(4)} ${unit}`;
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-mono font-semibold text-foreground mt-0.5">{value}</div>
    </div>
  );
}

export function BatchTool() {
  const [measurements, setMeasurements] = useState<LibraryItem[]>([]);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [componentType, setComponentType] = useState('capacitor');
  const [method, setMethod]               = useState('nominal');
  const [topology, setTopology]           = useState('shunt');
  const [typeFilter, setTypeFilter]       = useState('all');
  const [running, setRunning]             = useState(false);
  const [progress, setProgress]           = useState(0);
  const [total, setTotal]                 = useState(0);
  const [results, setResults]             = useState<BatchResult[]>([]);
  const [currentFile, setCurrentFile]     = useState('');
  const [saving, setSaving]               = useState(false);
  const [savedCount, setSavedCount]       = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch(`${API}/api/library/all`)
      .then(r => r.json())
      .then(d => setMeasurements(d.measurements ?? []))
      .catch(() => {});
  }, []);

  const filtered = measurements.filter(m =>
    typeFilter === 'all' || m.component_type === typeFilter
  );

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(m => m.relative_path || m.name)));
    }
  };

  const toggle = (key: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const run = async () => {
    const paths = Array.from(selected);
    if (!paths.length) return;
    setRunning(true);
    setResults([]);
    setProgress(0);
    setTotal(paths.length);
    setCurrentFile('');
    abortRef.current = new AbortController();

    try {
      const response = await fetch(`${API}/api/batch/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, component_type: componentType, method, topology }),
        signal: abortRef.current.signal,
      });
      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === 'result') {
              setProgress(ev.idx + 1);
              setCurrentFile(ev.file);
              setResults(prev => [...prev, { file: ev.file, path: ev.path, value_disp: ev.value_disp,
                nominal_value: ev.nominal_value, unit: ev.unit, srf_hz: ev.srf_hz, esr: ev.esr,
                q_factor: ev.q_factor, nrms: ev.nrms, quality: ev.quality, quality_score: ev.quality_score }]);
            } else if (ev.type === 'error') {
              setProgress(ev.idx + 1);
              setCurrentFile(ev.file);
              setResults(prev => [...prev, { file: ev.file, path: ev.path, error: ev.message, quality: 'error' }]);
            } else if (ev.type === 'done') {
              setProgress(ev.total);
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') console.error('Batch error:', err);
    } finally {
      setRunning(false);
      setCurrentFile('');
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const saveToDb = async () => {
    const valid = results.filter(r => !r.error);
    if (!valid.length) return;
    setSaving(true);
    setSavedCount(null);
    let count = 0;
    for (const r of valid) {
      try {
        const res = await fetch(`${API}/api/db/measurements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename:       r.file,
            filepath:       r.path,
            component_type: componentType,
            nominal_value:  r.nominal_value ?? null,
            nominal_unit:   r.unit ?? null,
            srf_hz:         r.srf_hz ?? null,
            esr:            r.esr ?? null,
            q_factor:       r.q_factor ?? null,
            quality:        r.quality ?? null,
          }),
        });
        if (res.ok) count++;
      } catch { /* continue */ }
    }
    setSavedCount(count);
    setSaving(false);
  };

  const exportCSV = () => {
    const header = ['Archivo', 'Valor nominal', 'SRF', 'ESR (Ω)', 'Q', 'NRMS', 'Calidad'];
    const rows = results.map(r => [
      r.file,
      r.value_disp ?? '—',
      formatSRF(r.srf_hz),
      r.esr != null ? r.esr.toFixed(4) : '—',
      r.q_factor != null ? r.q_factor.toFixed(1) : '—',
      r.nrms != null ? (r.nrms * 100).toFixed(1) + '%' : '—',
      r.quality ?? '—',
    ]);
    const csv = [header, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'batch_results.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Layers className="w-8 h-8 text-primary" />
          Procesamiento en Lote
        </h1>
        <p className="text-muted-foreground mt-1">
          Extrae valores nominales o modelos compactos de múltiples medidas simultáneamente.
        </p>
      </div>

      {/* Options */}
      <Card className="border-border/50 bg-card/50">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipo de componente</label>
              <Select value={componentType} onValueChange={setComponentType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="capacitor">Condensador</SelectItem>
                  <SelectItem value="inductor">Bobina</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Método</label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nominal">Extracción rápida (nominal)</SelectItem>
                  <SelectItem value="physical">Modelo físico Foster</SelectItem>
                  <SelectItem value="vf">Vector Fitting</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Topología</label>
              <Select value={topology} onValueChange={setTopology}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shunt">Shunt-through (2-port)</SelectItem>
                  <SelectItem value="series">Series (2-port)</SelectItem>
                  <SelectItem value="oneport">1-port</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* File selector */}
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <button onClick={toggleAll} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                  {selected.size === filtered.length && filtered.length > 0
                    ? <CheckSquare className="w-4 h-4 text-primary" />
                    : <SquareIcon className="w-4 h-4" />}
                  <span>{selected.size} / {filtered.length} seleccionados</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="h-7 text-xs w-36 border-0 bg-transparent focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="capacitor">Condensadores</SelectItem>
                    <SelectItem value="inductor">Bobinas</SelectItem>
                    <SelectItem value="resistor">Resistencias</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                  No hay medidas en la biblioteca
                </div>
              ) : filtered.map((m, i) => {
                const key = m.relative_path || m.name;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors border-b border-border/20 last:border-0 ${selected.has(key) ? 'bg-primary/5' : ''}`}
                    onClick={() => toggle(key)}
                  >
                    <Checkbox checked={selected.has(key)} onCheckedChange={() => toggle(key)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate" title={m.name}>{m.name}</p>
                      {m.device && <p className="text-[10px] text-muted-foreground">{m.device}</p>}
                    </div>
                    {m.component_type && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {m.component_type === 'capacitor' ? 'Cap' : m.component_type === 'inductor' ? 'Ind' : 'Res'}
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="space-y-4">
          {/* Actions + progress */}
          <div className="flex items-center gap-3">
            {!running ? (
              <Button onClick={run} disabled={selected.size === 0} className="gap-2">
                <Play className="w-4 h-4" />
                Procesar {selected.size > 0 ? `(${selected.size})` : ''}
              </Button>
            ) : (
              <Button onClick={stop} variant="destructive" className="gap-2">
                <Square className="w-4 h-4" />
                Detener
              </Button>
            )}
            {results.length > 0 && !running && (
              <>
                <Button variant="outline" onClick={exportCSV} className="gap-2">
                  <Download className="w-4 h-4" />
                  Exportar CSV
                </Button>
                <Button variant="outline" onClick={saveToDb} disabled={saving} className="gap-2">
                  <Database className="w-4 h-4" />
                  {saving ? 'Guardando…' : savedCount !== null ? `✓ ${savedCount} guardadas` : 'Guardar en BD'}
                </Button>
              </>
            )}
          </div>

          {(running || progress > 0) && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{running ? `Procesando: ${currentFile}` : 'Completado'}</span>
                <span>{progress} / {total}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}

          {/* Results table */}
          {results.length > 0 && (
            <Card className="border-border/50 bg-card/50 overflow-hidden">
              <div className="max-h-80 overflow-y-auto">
                <Table>
                  <TableHeader className="bg-muted/30 sticky top-0">
                    <TableRow>
                      <TableHead className="text-xs">Archivo</TableHead>
                      <TableHead className="text-xs">Valor</TableHead>
                      <TableHead className="text-xs">SRF</TableHead>
                      <TableHead className="text-xs">Calidad</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((r, i) => (
                      <TableRow key={i} className="text-xs">
                        <TableCell className="font-medium max-w-[140px] truncate" title={r.file}>
                          <div className="flex items-center gap-1.5">
                            {r.error
                              ? <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                              : r.quality === 'good'
                                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                : r.quality === 'fair'
                                  ? <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  : <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                            <span className="truncate">{r.file}</span>
                          </div>
                        </TableCell>
                        <TableCell className={`font-mono ${r.error ? 'text-muted-foreground italic' : ''}`}>
                          {r.error ? 'Error' : r.value_disp ?? '—'}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {r.error ? (
                            <span className="text-red-500 text-[10px]" title={r.error}>
                              {r.error.slice(0, 30)}{r.error.length > 30 ? '…' : ''}
                            </span>
                          ) : formatSRF(r.srf_hz)}
                        </TableCell>
                        <TableCell className={`font-semibold ${qualityColor(r.quality)}`}>
                          {r.nrms != null
                            ? `${(r.nrms * 100).toFixed(1)}%`
                            : r.quality ?? '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="px-4 py-2 border-t border-border/30 bg-muted/10 text-xs text-muted-foreground flex justify-between">
                <span>{results.filter(r => !r.error).length} correctos · {results.filter(r => !!r.error).length} errores</span>
                <span>{results.filter(r => r.quality === 'good').length} buena calidad</span>
              </div>
            </Card>
          )}

          {/* Stats panel — shown after batch completes */}
          {results.length > 0 && !running && (() => {
            const s = computeStats(results);
            return (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <BarChart2 className="w-4 h-4 text-primary" />
                    Estadísticas del lote
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <StatCell label="Media"  value={fmtSIValue(s.mean, s.unit)} />
                    <StatCell label="σ"      value={fmtSIValue(s.std,  s.unit)} />
                    <StatCell label="Mín"    value={fmtSIValue(s.min,  s.unit)} />
                    <StatCell label="Máx"    value={fmtSIValue(s.max,  s.unit)} />
                  </div>
                  {/* Yield bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Yield</span>
                      <span className={s.yield_pct >= 80 ? 'text-emerald-500 font-semibold' : s.yield_pct >= 50 ? 'text-amber-500 font-semibold' : 'text-red-500 font-semibold'}>
                        {s.yield_pct}%
                      </span>
                    </div>
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className="bg-emerald-500 h-full" style={{ width: `${(s.good / s.count) * 100}%` }} />
                      <div className="bg-amber-400  h-full" style={{ width: `${(s.fair / s.count) * 100}%` }} />
                      <div className="bg-red-400    h-full" style={{ width: `${(s.poor / s.count) * 100}%` }} />
                    </div>
                    <div className="flex gap-3 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{s.good} buena</span>
                      <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />{s.fair} regular</span>
                      <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-red-400" />{s.poor} pobre</span>
                      {s.errors > 0 && <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-500" />{s.errors} error</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
