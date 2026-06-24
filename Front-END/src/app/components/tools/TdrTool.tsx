import React, { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { cn } from '../ui/utils';
import {
  Upload, FileCheck, Loader2, Activity, Zap, AlertTriangle, Info,
  Download
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';

const WINDOWS = [
  { value: 'kaiser6',      label: 'Kaiser (β=6) — recomendado' },
  { value: 'kaiser8',      label: 'Kaiser (β=8) — mayor rechazo' },
  { value: 'kaiser14',     label: 'Kaiser (β=14) — máximo rechazo' },
  { value: 'blackman',     label: 'Blackman' },
  { value: 'hanning',      label: 'Hanning' },
  { value: 'hamming',      label: 'Hamming' },
  { value: 'rectangular',  label: 'Rectangular (sin ventana)' },
];

const DISC_COLORS: Record<string, string> = {
  open:        '#f87171',
  short:       '#60a5fa',
  inductive:   '#fbbf24',
  capacitive:  '#34d399',
  mismatch:    '#a78bfa',
  matched:     '#94a3b8',
};

interface TdrResult {
  time_ns:       number[];
  distance_m:    number[];
  impedance_ohm: number[];
  reflection:    number[];
  freq_ghz:      number[];
  s11_db:        number[];
  meta: {
    fmin_ghz: number; fmax_ghz: number; n_points: number;
    vf: number; window: string; z0: number; dt_ps: number; z_range_m: number;
  };
  discontinuities: {
    time_ns: number; distance_m: number; impedance_ohm: number;
    gamma: number; type: string; delta_gamma: number;
  }[];
}

type XAxis = 'time' | 'distance';

export function TdrTool() {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [window_, setWindow] = useState('kaiser6');
  const [vf, setVf] = useState('0.66');
  const [z0, setZ0] = useState('50');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TdrResult | null>(null);
  const [xAxis, setXAxis] = useState<XAxis>('distance');
  const [showImpedance, setShowImpedance] = useState(true);
  const [showReflection, setShowReflection] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  }, []);

  async function compute() {
    if (!file) return;
    setLoading(true);
    setResult(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('window', window_);
    fd.append('vf', vf);
    fd.append('z0', z0);
    fd.append('zero_pad_factor', '4');
    try {
      const res = await fetch('http://localhost:8080/api/tdr/compute', {
        method: 'POST', body: fd
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Error');
      const data: TdrResult = await res.json();
      setResult(data);
    } catch (e: any) {
      toast.error('Error TDR: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!result) return;
    const rows = ['Time (ns),Distance (m),Impedance (Ω),Gamma'];
    for (let i = 0; i < result.time_ns.length; i++) {
      rows.push(`${result.time_ns[i].toFixed(4)},${result.distance_m[i].toFixed(4)},${result.impedance_ohm[i].toFixed(2)},${result.reflection[i].toFixed(4)}`);
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tdr_${file?.name ?? 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Build chart data
  const chartData = result ? result.time_ns.map((t, i) => ({
    x:    xAxis === 'time' ? t : parseFloat((result.distance_m[i] * 100).toFixed(2)),  // cm
    z:    parseFloat(result.impedance_ohm[i].toFixed(2)),
    g:    parseFloat(result.reflection[i].toFixed(4)),
  })) : [];

  const xLabel = xAxis === 'time' ? 'Tiempo (ns)' : 'Distancia (cm)';

  return (
    <ToolShell
      title="TDR — Análisis en Dominio Temporal"
      description="Detecta discontinuidades de impedancia a lo largo de una línea de transmisión."
    >
      <div className="max-w-5xl mx-auto px-4 pb-8 space-y-5">

        {/* Upload + Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* File drop */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Archivo S-parameter</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
                  dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
                  file && "border-emerald-500/50 bg-emerald-500/5"
                )}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
              >
                {file
                  ? <><FileCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" /><p className="text-sm font-medium text-emerald-600">{file.name}</p></>
                  : <><Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">Arrastra un .s1p o .s2p aquí</p></>
                }
                <input ref={inputRef} type="file" accept=".s1p,.s2p,.s3p,.snp" className="hidden"
                  onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
              </div>
            </CardContent>
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Parámetros</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Ventana de ponderación</Label>
                <Select value={window_} onValueChange={setWindow}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WINDOWS.map(w => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Factor de velocidad Vf</Label>
                  <Input value={vf} onChange={e => setVf(e.target.value)} className="h-9 text-sm" placeholder="0.66" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Z₀ (Ω)</Label>
                  <Input value={z0} onChange={e => setZ0(e.target.value)} className="h-9 text-sm" placeholder="50" />
                </div>
              </div>
              <Button onClick={compute} disabled={!file || loading} className="w-full mt-1">
                {loading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Calculando…</>
                  : <><Activity className="w-4 h-4 mr-2" /> Calcular TDR</>}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        {result && (
          <>
            {/* Meta pills */}
            <div className="flex flex-wrap gap-2 text-xs">
              {[
                ['Rango', `${result.meta.fmin_ghz.toFixed(3)} – ${result.meta.fmax_ghz.toFixed(3)} GHz`],
                ['Puntos', result.meta.n_points],
                ['Δt', `${result.meta.dt_ps.toFixed(2)} ps`],
                ['Alcance', `${(result.meta.z_range_m * 100).toFixed(1)} cm`],
                ['Vf', result.meta.vf],
                ['Z₀', `${result.meta.z0} Ω`],
              ].map(([k, v]) => (
                <span key={k as string} className="bg-muted/50 border border-border rounded px-2 py-1">
                  <span className="text-muted-foreground">{k}: </span>
                  <span className="font-medium">{v}</span>
                </span>
              ))}
            </div>

            {/* Chart controls */}
            <Card>
              <CardHeader className="py-3 px-4 border-b border-border flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Traza TDR</CardTitle>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-md overflow-hidden border border-border text-xs">
                    {(['distance','time'] as XAxis[]).map(a => (
                      <button
                        key={a}
                        onClick={() => setXAxis(a)}
                        className={cn(
                          "px-3 py-1 transition-colors",
                          xAxis === a ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                        )}
                      >
                        {a === 'distance' ? 'Distancia' : 'Tiempo'}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setShowImpedance(!showImpedance); }}
                    className={cn("text-xs px-2 py-1 rounded border", showImpedance ? "border-primary bg-primary/10 text-primary" : "border-border")}
                  >Z (Ω)</button>
                  <button
                    onClick={() => setShowReflection(!showReflection)}
                    className={cn("text-xs px-2 py-1 rounded border", showReflection ? "border-amber-500 bg-amber-500/10 text-amber-500" : "border-border")}
                  >Γ</button>
                  <Button variant="outline" size="sm" onClick={exportCsv}>
                    <Download className="w-3.5 h-3.5 mr-1" /> CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-4 py-4">
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
                    <XAxis
                      dataKey="x"
                      type="number"
                      domain={['auto', 'auto']}
                      label={{ value: xLabel, position: 'insideBottom', offset: -2, fontSize: 11 }}
                      tick={{ fontSize: 10 }}
                    />
                    {showImpedance && (
                      <YAxis
                        yAxisId="z"
                        domain={['auto', 'auto']}
                        label={{ value: 'Z (Ω)', angle: -90, position: 'insideLeft', fontSize: 11 }}
                        tick={{ fontSize: 10 }}
                      />
                    )}
                    {showReflection && (
                      <YAxis
                        yAxisId="g"
                        orientation="right"
                        domain={[-1, 1]}
                        label={{ value: 'Γ', angle: 90, position: 'insideRight', fontSize: 11 }}
                        tick={{ fontSize: 10 }}
                      />
                    )}
                    <Tooltip
                      contentStyle={{ fontSize: 11 }}
                      formatter={(v: number, name: string) =>
                        name === 'z' ? [`${v.toFixed(1)} Ω`, 'Impedancia'] : [`${v.toFixed(4)}`, 'Γ (reflexión)']
                      }
                      labelFormatter={(l: number) => `${xLabel}: ${l}`}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {showImpedance && (
                      <Line
                        yAxisId="z"
                        type="monotone"
                        dataKey="z"
                        stroke="#38bdf8"
                        dot={false}
                        strokeWidth={1.5}
                        name="Impedancia"
                      />
                    )}
                    {showReflection && (
                      <Line
                        yAxisId="g"
                        type="monotone"
                        dataKey="g"
                        stroke="#fbbf24"
                        dot={false}
                        strokeWidth={1.5}
                        name="Reflexión Γ"
                      />
                    )}
                    {/* Reference line at Z0 */}
                    {showImpedance && (
                      <ReferenceLine yAxisId="z" y={parseFloat(z0)} stroke="#94a3b8" strokeDasharray="4 2" label={{ value: `Z₀=${z0}Ω`, fontSize: 10, fill: '#94a3b8' }} />
                    )}
                    {/* Discontinuity markers */}
                    {result.discontinuities.map((d, i) => (
                      <ReferenceLine
                        key={i}
                        yAxisId={showImpedance ? "z" : "g"}
                        x={xAxis === 'time' ? d.time_ns : parseFloat((d.distance_m * 100).toFixed(2))}
                        stroke={DISC_COLORS[d.type] || '#a78bfa'}
                        strokeDasharray="3 3"
                        strokeWidth={1.5}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Discontinuities table */}
            {result.discontinuities.length > 0 && (
              <Card>
                <CardHeader className="py-3 px-4 border-b border-border">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Discontinuidades detectadas ({result.discontinuities.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tipo</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">Tiempo (ns)</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">Distancia (cm)</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">Z (Ω)</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground">Γ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {result.discontinuities.map((d, i) => (
                          <tr key={i} className="hover:bg-muted/20">
                            <td className="px-4 py-2">
                              <span
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
                                style={{
                                  background: (DISC_COLORS[d.type] || '#a78bfa') + '22',
                                  color: DISC_COLORS[d.type] || '#a78bfa',
                                  border: `1px solid ${(DISC_COLORS[d.type] || '#a78bfa')}55`
                                }}
                              >
                                {d.type}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right font-mono">{d.time_ns.toFixed(3)}</td>
                            <td className="px-4 py-2 text-right font-mono">{(d.distance_m * 100).toFixed(2)}</td>
                            <td className="px-4 py-2 text-right font-mono">{d.impedance_ohm.toFixed(1)}</td>
                            <td className="px-4 py-2 text-right font-mono">{d.gamma.toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {result.discontinuities.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded-lg px-4 py-3">
                <Info className="w-4 h-4 shrink-0" />
                No se detectaron discontinuidades significativas. La línea parece bien adaptada.
              </div>
            )}
          </>
        )}

        {!result && !loading && (
          <div className="text-center py-16 text-muted-foreground">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Carga un archivo S-parameter y pulsa <strong>Calcular TDR</strong></p>
            <p className="text-xs mt-1 opacity-60">Compatible con .s1p y .s2p — usa S11 para el análisis</p>
          </div>
        )}
      </div>
    </ToolShell>
  );
}
