import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { cn } from '../ui/utils';
import {
  BarChart2, Loader2, Download, CheckSquare, Square,
  TrendingUp, Minus, Plus, Search
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine
} from 'recharts';

const API = 'http://localhost:8080';
const PALETTE = ['#38bdf8','#f87171','#34d399','#fbbf24','#a78bfa','#fb923c','#e879f9','#86efac'];

interface Measurement { name: string; relative_path: string; device?: string; component_type?: string; }
interface TraceResult  { label: string; path: string; values: number[]; }
interface CompareResult {
  freq_ghz:  number[];
  traces:    TraceResult[];
  stats:     { mean: number[]; std: number[]; min_env: number[]; max_env: number[] };
  summary:   any[];
  param:     string; metric: string; n_loaded: number;
}

const PARAM_OPTIONS  = ['S11','S21','S12','S22'];
const METRIC_OPTIONS = [
  { value:'db',    label:'Magnitud (dB)' },
  { value:'phase', label:'Fase (°)' },
  { value:'mag',   label:'Magnitud lineal' },
];

export function ComparisonTool() {
  const [allMeas,    setAllMeas]    = useState<Measurement[]>([]);
  const [filtered,   setFiltered]   = useState<Measurement[]>([]);
  const [search,     setSearch]     = useState('');
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const [param,      setParam]      = useState('S11');
  const [metric,     setMetric]     = useState('db');
  const [showMean,   setShowMean]   = useState(true);
  const [showEnv,    setShowEnv]    = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<CompareResult | null>(null);

  useEffect(() => {
    fetch(`${API}/api/library`)
      .then(r => r.json())
      .then(d => {
        const list: Measurement[] = Object.values(d.measurements || {}) as Measurement[];
        setAllMeas(list); setFiltered(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(q ? allMeas.filter(m =>
      m.name?.toLowerCase().includes(q) || m.device?.toLowerCase().includes(q)
    ) : allMeas);
  }, [search, allMeas]);

  function toggle(path: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  async function compare() {
    if (selected.size < 1) { toast.error('Selecciona al menos un archivo'); return; }
    setLoading(true); setResult(null);
    try {
      const res = await fetch(`${API}/api/compare/compute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: Array.from(selected), param, metric }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      setResult(await res.json());
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally { setLoading(false); }
  }

  function exportCsv() {
    if (!result) return;
    const cols = ['freq_ghz', ...result.traces.map(t => t.label), 'mean', 'std', 'min_env', 'max_env'];
    const header = cols.join(',');
    const rows = result.freq_ghz.map((f, i) => [
      f.toFixed(6),
      ...result.traces.map(t => t.values[i]?.toFixed(4) ?? ''),
      result.stats.mean[i]?.toFixed(4) ?? '',
      result.stats.std[i]?.toFixed(4) ?? '',
      result.stats.min_env[i]?.toFixed(4) ?? '',
      result.stats.max_env[i]?.toFixed(4) ?? '',
    ].join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a'); a.href = url;
    a.download = `comparison_${param}_${metric}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // Build chart data
  const chartData = result ? result.freq_ghz.map((f, i) => {
    const pt: Record<string, number> = { f };
    result.traces.forEach(t => { pt[t.label] = t.values[i]; });
    if (showMean) { pt['__mean'] = result.stats.mean[i]; }
    if (showEnv)  { pt['__min'] = result.stats.min_env[i]; pt['__max'] = result.stats.max_env[i]; }
    return pt;
  }) : [];

  const yLabel = metric === 'db' ? `${param} (dB)` : metric === 'phase' ? `${param} (°)` : `|${param}|`;

  return (
    <ToolShell
      title="Comparación de prototipos"
      description="Superpone y analiza estadísticamente múltiples medidas S-parameter."
    >
      <div className="max-w-6xl mx-auto px-4 pb-8 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">

          {/* ── Selector ─────────────────────────────────────────────── */}
          <div className="space-y-3">
            <Card>
              <CardHeader className="py-3 px-4 border-b border-border">
                <CardTitle className="text-sm flex items-center justify-between">
                  Medidas ({selected.size} sel.)
                  <div className="flex gap-1">
                    <button onClick={() => setSelected(new Set(filtered.map(m => m.relative_path)))} className="text-[10px] text-primary hover:underline">Todo</button>
                    <span className="text-muted-foreground">·</span>
                    <button onClick={() => setSelected(new Set())} className="text-[10px] text-muted-foreground hover:text-foreground">Ninguno</button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                </div>
                <div className="max-h-60 overflow-y-auto space-y-0.5">
                  {filtered.map((m, i) => {
                    const path = m.relative_path;
                    const checked = selected.has(path);
                    return (
                      <button
                        key={i}
                        onClick={() => toggle(path)}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted/40 transition-colors text-left",
                          checked && "bg-primary/5"
                        )}
                      >
                        {checked
                          ? <CheckSquare className="w-3.5 h-3.5 text-primary shrink-0" />
                          : <Square className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                        <span className="truncate">{m.name}</span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-3 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Parámetro</label>
                  <Select value={param} onValueChange={setParam}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PARAM_OPTIONS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Métrica</label>
                  <Select value={metric} onValueChange={setMetric}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METRIC_OPTIONS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={showMean} onChange={e => setShowMean(e.target.checked)} className="w-3 h-3" />
                    Media
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={showEnv} onChange={e => setShowEnv(e.target.checked)} className="w-3 h-3" />
                    Min/Max
                  </label>
                </div>
                <Button onClick={compare} disabled={loading || selected.size === 0} className="w-full h-8 text-xs">
                  {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <BarChart2 className="w-3.5 h-3.5 mr-1.5" />}
                  Comparar ({selected.size})
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* ── Chart ────────────────────────────────────────────────── */}
          <div className="space-y-4">
            {result ? (
              <>
                {/* Chart card */}
                <Card>
                  <CardHeader className="py-3 px-4 border-b border-border flex flex-row items-center justify-between">
                    <CardTitle className="text-sm">{param} — {METRIC_OPTIONS.find(m=>m.value===metric)?.label}</CardTitle>
                    <Button variant="outline" size="sm" onClick={exportCsv} className="h-7 text-xs gap-1">
                      <Download className="w-3.5 h-3.5" /> CSV
                    </Button>
                  </CardHeader>
                  <CardContent className="px-4 py-4">
                    <ResponsiveContainer width="100%" height={340}>
                      <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 20, left: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.4} />
                        <XAxis
                          dataKey="f"
                          type="number"
                          domain={['auto','auto']}
                          tickFormatter={v => v >= 1 ? `${v.toFixed(1)}G` : `${(v*1000).toFixed(0)}M`}
                          label={{ value: 'Frecuencia (GHz)', position: 'insideBottom', offset: -12, fontSize: 11 }}
                          tick={{ fontSize: 10 }}
                        />
                        <YAxis
                          label={{ value: yLabel, angle: -90, position: 'insideLeft', fontSize: 11 }}
                          tick={{ fontSize: 10 }}
                          width={55}
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 11 }}
                          labelFormatter={l => `${parseFloat(l).toFixed(4)} GHz`}
                        />
                        <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />

                        {/* Individual traces */}
                        {result.traces.map((t, i) => (
                          <Line
                            key={t.label}
                            type="monotone"
                            dataKey={t.label}
                            stroke={PALETTE[i % PALETTE.length]}
                            dot={false}
                            strokeWidth={1.2}
                          />
                        ))}
                        {/* Mean */}
                        {showMean && (
                          <Line
                            type="monotone"
                            dataKey="__mean"
                            name="Media"
                            stroke="#ffffff"
                            dot={false}
                            strokeWidth={2.5}
                            strokeDasharray="6 2"
                          />
                        )}
                        {/* Envelope */}
                        {showEnv && (<>
                          <Line type="monotone" dataKey="__min" name="Min" stroke="#94a3b8" dot={false} strokeWidth={1} strokeDasharray="3 3" />
                          <Line type="monotone" dataKey="__max" name="Max" stroke="#94a3b8" dot={false} strokeWidth={1} strokeDasharray="3 3" />
                        </>)}
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Stats summary */}
                <Card>
                  <CardHeader className="py-3 px-4 border-b border-border">
                    <CardTitle className="text-sm">Estadísticas por archivo ({result.n_loaded} cargados)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/30">
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Archivo</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">F mín (GHz)</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">F máx (GHz)</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Pico (dB)</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Valle (dB)</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">Media (dB)</th>
                            <th className="text-right px-3 py-2 font-medium text-muted-foreground">SRF (GHz)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {result.summary.map((row: any, i: number) => (
                            <tr key={i} className="hover:bg-muted/20">
                              <td className="px-4 py-2 font-medium truncate max-w-[200px]" title={row.label}>{row.label}</td>
                              <td className="px-3 py-2 text-right font-mono">{row.fmin_ghz?.toFixed(3)}</td>
                              <td className="px-3 py-2 text-right font-mono">{row.fmax_ghz?.toFixed(3)}</td>
                              <td className="px-3 py-2 text-right font-mono">{row.peak_db?.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-mono">{row.valley_db?.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-mono">{row.mean_db?.toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-mono">{row.srf_ghz?.toFixed(4) ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                        {result.summary.length > 1 && (() => {
                          const means   = result.summary.map((r: any) => r.mean_db).filter((v:any) => v != null);
                          const overall = means.reduce((a: number,b: number) => a+b, 0) / means.length;
                          const std     = Math.sqrt(means.reduce((a: number,b: number) => a + (b-overall)**2, 0) / means.length);
                          return (
                            <tfoot>
                              <tr className="border-t border-border bg-muted/40 font-semibold">
                                <td className="px-4 py-2 text-muted-foreground text-[11px]">Estadísticas</td>
                                <td colSpan={4} />
                                <td className="px-3 py-2 text-right font-mono text-xs">
                                  {overall.toFixed(2)} ± {std.toFixed(2)}
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          );
                        })()}
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-72 text-center text-muted-foreground">
                <BarChart2 className="w-12 h-12 mb-3 opacity-20" />
                <p className="text-sm">Selecciona archivos y pulsa <strong>Comparar</strong></p>
                <p className="text-xs mt-1 opacity-60">Soporta cualquier combinación de .s1p y .s2p</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ToolShell>
  );
}
