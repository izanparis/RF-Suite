import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CircleDot, Download, Plus, Trash2, Activity,
  ChevronDown, Info, Wrench, Loader2, Copy, CheckCheck
} from 'lucide-react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const API = 'http://127.0.0.1:8080';

// ─── Constants ───────────────────────────────────────────────────────────────

const R_VALUES = [0, 0.2, 0.5, 1, 2, 5, 10, 20];
const X_VALUES = [0.2, 0.5, 1, 2, 5, 10, 20];

const TRACE_PALETTE = [
  '#38bdf8', // sky
  '#f87171', // red
  '#34d399', // emerald
  '#fbbf24', // amber
  '#a78bfa', // violet
  '#fb923c', // orange
];

// ─── Types ───────────────────────────────────────────────────────────────────

interface TraceData {
  id:      string;
  label:   string;
  freq:    number[];
  gammaRe: number[];
  gammaIm: number[];
  zRe:     number[];
  zIm:     number[];
  s11Db:   number[];
  meta:    { filename: string; nports: number; f_start: number; f_stop: number; n_points: number };
  color:   string;
  visible: boolean;
}

interface Cursor {
  idx:        number;
  traceId:    string;
  freq:       number;
  gammaRe:    number;
  gammaIm:    number;
  gammaMag:   number;
  gammaPhaseDeg: number;
  zRe:        number;
  zIm:        number;
  vswr:       number;
  rl_db:      number;
  canvasX:    number;
  canvasY:    number;
}

interface LibraryItem {
  name: string;
  relative_path?: string;
  component_type?: string | null;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtHz(hz: number): string {
  if (hz >= 1e9) return `${(hz / 1e9).toPrecision(5)} GHz`;
  if (hz >= 1e6) return `${(hz / 1e6).toPrecision(5)} MHz`;
  if (hz >= 1e3) return `${(hz / 1e3).toPrecision(5)} kHz`;
  return `${hz.toPrecision(4)} Hz`;
}

function fmtZ(re: number, im: number): string {
  const sign = im >= 0 ? '+' : '-';
  return `${re.toFixed(2)} ${sign} j${Math.abs(im).toFixed(2)} Ω`;
}

// ─── Smith Chart drawing ──────────────────────────────────────────────────────

function drawGrid(
  ctx:    CanvasRenderingContext2D,
  cx:     number,
  cy:     number,
  r:      number,
  isDark: boolean,
) {
  const gridA   = isDark ? 'rgba(148,163,184,0.20)' : 'rgba(100,116,139,0.18)';
  const gridB   = isDark ? 'rgba(148,163,184,0.40)' : 'rgba(100,116,139,0.35)';
  const txtCol  = isDark ? 'rgba(148,163,184,0.75)' : 'rgba(71,85,105,0.8)';
  const bg      = isDark ? '#0b0f1a'                 : '#f8fafc';

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Clip everything to the unit circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.clip();

  ctx.lineWidth = 0.6;

  // Constant-R circles: center (R/(R+1), 0), radius 1/(R+1)
  ctx.strokeStyle = gridA;
  for (const rv of R_VALUES) {
    const ccx = cx + r * rv / (rv + 1);
    const cr  = r / (rv + 1);
    ctx.beginPath();
    ctx.arc(ccx, cy, cr, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // Constant-X arcs: center (1, ±1/X), radius 1/|X|
  for (const xv of X_VALUES) {
    for (const sign of [1, -1]) {
      const arcCX = cx + r;              // Γ_re = 1
      const arcCY = cy - sign * r / xv; // Γ_im = ±1/X
      const arcR  = r / xv;
      ctx.beginPath();
      ctx.arc(arcCX, arcCY, arcR, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }

  // Real axis
  ctx.strokeStyle = gridB;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.stroke();

  ctx.restore(); // end clip

  // Unit circle outline
  ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.55)' : 'rgba(71,85,105,0.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.stroke();

  // Labels along real axis
  ctx.font = `${Math.max(9, r * 0.040)}px monospace`;
  ctx.fillStyle = txtCol;
  ctx.textAlign = 'center';

  const realLabels: [number, string][] = [
    [0,  'SC'], [1, 'Z₀'], [2, 'OC'],
  ];
  const rLabelMap: [number, string][] = [
    [0.2, '0.2'], [0.5, '0.5'], [2, '2'], [5, '5'],
  ];
  for (const [rv, lbl] of rLabelMap) {
    const px = cx + r * rv / (rv + 1) - r / (rv + 1);
    ctx.fillText(lbl, px, cy + 13);
  }

  // Key points
  const kp: [number, number, string, CanvasTextAlign][] = [
    [-1,  0, 'SC', 'right'],
    [ 0,  0, 'Z₀', 'center'],
    [ 1,  0, 'OC', 'left'],
  ];
  for (const [gre, gim, lbl, align] of kp) {
    ctx.textAlign = align as CanvasTextAlign;
    const px = cx + r * gre + (align === 'left' ? 5 : align === 'right' ? -5 : 0);
    const py = cy - r * gim - 7;
    ctx.fillText(lbl, px, py);
  }
}

function drawTrace(
  ctx:   CanvasRenderingContext2D,
  trace: TraceData,
  cx:    number,
  cy:    number,
  r:     number,
) {
  const n = trace.gammaRe.length;
  if (n < 2) return;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.clip();

  ctx.lineWidth = 2.0;
  ctx.lineJoin  = 'round';

  // Draw segment-by-segment with frequency-based color shift
  const base = trace.color;
  for (let i = 0; i < n - 1; i++) {
    const t   = i / (n - 1);
    const px0 = cx + r * trace.gammaRe[i];
    const py0 = cy - r * trace.gammaIm[i];
    const px1 = cx + r * trace.gammaRe[i + 1];
    const py1 = cy - r * trace.gammaIm[i + 1];

    // Fade from dim (low freq) to full (high freq)
    const alpha = 0.35 + 0.65 * t;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = base;
    ctx.beginPath();
    ctx.moveTo(px0, py0);
    ctx.lineTo(px1, py1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Start dot
  ctx.fillStyle = trace.color;
  ctx.beginPath();
  ctx.arc(cx + r * trace.gammaRe[0], cy - r * trace.gammaIm[0], 4, 0, 2 * Math.PI);
  ctx.fill();

  // End dot (larger)
  ctx.beginPath();
  ctx.arc(cx + r * trace.gammaRe[n - 1], cy - r * trace.gammaIm[n - 1], 5, 0, 2 * Math.PI);
  ctx.fill();

  ctx.restore();
}

function drawCursor(
  ctx:    CanvasRenderingContext2D,
  cursor: Cursor,
  isDark: boolean,
) {
  const { canvasX: x, canvasY: y } = cursor;
  const c = isDark ? '#f0f6ff' : '#1e293b';

  ctx.save();
  ctx.strokeStyle = c;
  ctx.fillStyle   = c;
  ctx.lineWidth   = 1.2;
  ctx.globalAlpha = 0.85;

  // Crosshair
  ctx.beginPath();
  ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y);
  ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10);
  ctx.stroke();

  // Circle
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, 2 * Math.PI);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SmithChartTool() {
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const [size, setSize]       = useState({ w: 500, h: 500 });
  const [isDark, setIsDark]   = useState(false);
  const [traces, setTraces]   = useState<TraceData[]>([]);
  const [cursor, setCursor]   = useState<Cursor | null>(null);
  const [topology, setTopology] = useState('shunt');
  const [z0, setZ0]           = useState(50);
  const [loading, setLoading] = useState(false);
  const [measurements, setMeasurements] = useState<LibraryItem[]>([]);
  const [selectedPath, setSelectedPath] = useState('');

  // Matching network state
  const [matchRL, setMatchRL]       = useState('');
  const [matchXL, setMatchXL]       = useState('');
  const [matchFreq, setMatchFreq]   = useState('');
  const [matchZ0, setMatchZ0]       = useState('50');
  const [matchESeries, setMatchESeries] = useState('E24');
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchResults, setMatchResults] = useState<any[]>([]);
  const [copiedIdx, setCopiedIdx]   = useState<number | null>(null);

  async function solveMatching() {
    const rl = parseFloat(matchRL);
    const xl = parseFloat(matchXL || '0');
    const f  = parseFloat(matchFreq) * 1e6; // input in MHz
    const z0 = parseFloat(matchZ0);
    if (!rl || !f) return;
    setMatchLoading(true);
    setMatchResults([]);
    try {
      const res = await fetch('http://localhost:8080/api/matching/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rl, xl, z0, freq_hz: f, eseries: matchESeries }),
      });
      const data = await res.json();
      setMatchResults(data.solutions ?? []);
    } catch { /* ignore */ } finally {
      setMatchLoading(false);
    }
  }

  function copyNetlist(netlist: string, idx: number) {
    navigator.clipboard.writeText(netlist).catch(() => {});
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  // Detect dark mode
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const s = Math.min(width, height, 650);
      setSize({ w: s, h: s });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Load library
  useEffect(() => {
    fetch(`${API}/api/library/all`)
      .then(r => r.json())
      .then(d => setMeasurements(d.measurements ?? []))
      .catch(() => {});
  }, []);

  // Redraw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = size.w * dpr;
    canvas.height = size.h * dpr;
    canvas.style.width  = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    ctx.scale(dpr, dpr);

    const pad = 28;
    const cx  = size.w / 2;
    const cy  = size.h / 2;
    const r   = size.w / 2 - pad;

    drawGrid(ctx, cx, cy, r, isDark);
    for (const tr of traces) {
      if (tr.visible) drawTrace(ctx, tr, cx, cy, r);
    }
    if (cursor) drawCursor(ctx, cursor, isDark);
  }, [size, isDark, traces, cursor]);

  // ── Load trace ──────────────────────────────────────────────────────────────

  const loadTrace = useCallback(async (path: string) => {
    if (!path) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/api/smith/data?path=${encodeURIComponent(path)}&topology=${topology}&z0=${z0}`
      );
      if (!res.ok) throw new Error(await res.text());
      const d = await res.json();

      const existing = traces.find(t => t.meta.filename === d.meta.filename && t.id.includes(topology));
      if (existing) return; // already loaded

      const colorIdx = traces.length % TRACE_PALETTE.length;
      const tr: TraceData = {
        id:      `${Date.now()}-${path}`,
        label:   d.meta.filename,
        freq:    d.freq,
        gammaRe: d.gamma_re,
        gammaIm: d.gamma_im,
        zRe:     d.z_re,
        zIm:     d.z_im,
        s11Db:   d.s11_db,
        meta:    d.meta,
        color:   TRACE_PALETTE[colorIdx],
        visible: true,
      };
      setTraces(prev => [...prev, tr]);
    } catch (e) {
      console.error('Smith chart load error:', e);
    } finally {
      setLoading(false);
    }
  }, [traces, topology, z0]);

  const removeTrace = (id: string) => setTraces(prev => prev.filter(t => t.id !== id));
  const toggleTrace = (id: string) =>
    setTraces(prev => prev.map(t => t.id === id ? { ...t, visible: !t.visible } : t));

  // ── Hover cursor ────────────────────────────────────────────────────────────

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || traces.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const mx   = e.clientX - rect.left;
    const my   = e.clientY - rect.top;

    const pad  = 28;
    const cx   = size.w / 2;
    const cy   = size.h / 2;
    const r    = size.w / 2 - pad;

    // Convert to Γ coordinates
    const gre  = (mx - cx) / r;
    const gim  = -(my - cy) / r;

    // Find nearest point across all visible traces
    let bestDist = Infinity, bestIdx = -1, bestTrace: TraceData | null = null;
    for (const tr of traces) {
      if (!tr.visible) continue;
      for (let i = 0; i < tr.gammaRe.length; i++) {
        const d = (tr.gammaRe[i] - gre) ** 2 + (tr.gammaIm[i] - gim) ** 2;
        if (d < bestDist) { bestDist = d; bestIdx = i; bestTrace = tr; }
      }
    }
    if (!bestTrace || bestIdx < 0 || bestDist > 0.05) {
      setCursor(null);
      return;
    }

    const tr  = bestTrace;
    const gRe = tr.gammaRe[bestIdx];
    const gIm = tr.gammaIm[bestIdx];
    const mag = Math.sqrt(gRe ** 2 + gIm ** 2);
    const vswr = mag < 0.9999 ? (1 + mag) / (1 - mag) : 999;

    setCursor({
      idx:           bestIdx,
      traceId:       tr.id,
      freq:          tr.freq[bestIdx],
      gammaRe:       gRe,
      gammaIm:       gIm,
      gammaMag:      mag,
      gammaPhaseDeg: Math.atan2(gIm, gRe) * (180 / Math.PI),
      zRe:           tr.zRe[bestIdx],
      zIm:           tr.zIm[bestIdx],
      vswr,
      rl_db:         -20 * Math.log10(mag + 1e-30),
      canvasX:       cx + r * gRe,
      canvasY:       cy - r * gIm,
    });
  }, [traces, size]);

  // ── Export PNG ──────────────────────────────────────────────────────────────

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'smith_chart.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const activeCursor = cursor;
  const activeTrace  = activeCursor ? traces.find(t => t.id === activeCursor.traceId) : null;

  return (
    <div className="p-5 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <CircleDot className="w-8 h-8 text-primary" />
            Carta de Smith
          </h1>
          <p className="text-muted-foreground mt-1">
            Representación de parámetros S en el plano de coeficiente de reflexión.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={topology} onValueChange={v => { setTopology(v); setTraces([]); }}>
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shunt">Shunt-through (2-port)</SelectItem>
              <SelectItem value="series">Series (2-port)</SelectItem>
              <SelectItem value="oneport">1-port (S11)</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportPng} className="gap-1.5 h-8 text-xs">
            <Download className="w-3.5 h-3.5" />
            PNG
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_200px] gap-4">

        {/* ── File picker ──────────────────────────────────────────────── */}
        <Card className="border-border/50 bg-card/50 h-fit">
          <CardContent className="p-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Archivos · Biblioteca
            </p>
            <div className="space-y-0.5 max-h-64 overflow-y-auto">
              {measurements.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Sin medidas</p>
              ) : measurements
                .filter(m => (m.relative_path || m.name).match(/\.(s1p|s2p)$/i))
                .map((m, i) => {
                  const path = m.relative_path || m.name;
                  const already = traces.some(t => t.meta.filename === m.name);
                  return (
                    <button
                      key={i}
                      onClick={() => { setSelectedPath(path); loadTrace(path); }}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-muted/50 transition-colors flex items-center gap-2 ${already ? 'opacity-50' : ''}`}
                    >
                      <Activity className="w-3 h-3 shrink-0 text-primary" />
                      <span className="truncate" title={m.name}>{m.name}</span>
                      {already && <span className="ml-auto text-[9px] text-muted-foreground">✓</span>}
                    </button>
                  );
                })}
            </div>
            {loading && (
              <div className="text-center text-xs text-muted-foreground animate-pulse py-1">
                Cargando…
              </div>
            )}

            {/* Active traces */}
            {traces.length > 0 && (
              <>
                <div className="border-t border-border/40 pt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    Trazas activas
                  </p>
                  <div className="space-y-1">
                    {traces.map(tr => (
                      <div key={tr.id} className="flex items-center gap-1.5 text-xs">
                        <button
                          onClick={() => toggleTrace(tr.id)}
                          className="w-3 h-3 rounded-full shrink-0 border-2"
                          style={{
                            backgroundColor: tr.visible ? tr.color : 'transparent',
                            borderColor: tr.color,
                          }}
                        />
                        <span className="truncate flex-1 text-foreground" title={tr.label}>
                          {tr.label}
                        </span>
                        <button onClick={() => removeTrace(tr.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1 mt-1" onClick={() => setTraces([])}>
                  <Trash2 className="w-3 h-3" />
                  Limpiar todo
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Canvas ───────────────────────────────────────────────────── */}
        <div
          ref={containerRef}
          className="flex items-center justify-center rounded-lg border border-border/50 bg-card/30 aspect-square min-h-[300px] max-h-[650px]"
        >
          <canvas
            ref={canvasRef}
            onMouseMove={onMouseMove}
            onMouseLeave={() => setCursor(null)}
            onClick={() => {
              if (cursor) {
                setMatchRL(cursor.zRe.toFixed(2));
                setMatchXL(cursor.zIm.toFixed(2));
                setMatchFreq((cursor.freq / 1e6).toFixed(3));
              }
            }}
            title="Click para capturar ZL en el asistente de matching"
            style={{ cursor: 'crosshair', display: 'block' }}
          />
          {traces.length === 0 && (
            <div className="absolute flex flex-col items-center gap-2 pointer-events-none select-none">
              <CircleDot className="w-12 h-12 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground/40">Selecciona un archivo de la biblioteca</p>
            </div>
          )}
        </div>

        {/* ── Readout ──────────────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* Cursor readout */}
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" /> Cursor
              </p>
              {activeCursor ? (
                <div className="space-y-1.5 font-mono text-xs">
                  <ReadoutRow label="f" value={fmtHz(activeCursor.freq)} accent />
                  <ReadoutRow label="Z"  value={fmtZ(activeCursor.zRe, activeCursor.zIm)} />
                  <ReadoutRow label="|Γ|" value={activeCursor.gammaMag.toFixed(4)} />
                  <ReadoutRow label="∠Γ" value={`${activeCursor.gammaPhaseDeg.toFixed(1)}°`} />
                  <ReadoutRow label="VSWR" value={activeCursor.vswr > 100 ? '>100' : activeCursor.vswr.toFixed(3)} />
                  <ReadoutRow label="RL"  value={`${activeCursor.rl_db.toFixed(2)} dB`} />
                  {activeTrace && (
                    <div className="pt-1 border-t border-border/40">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: activeTrace.color }}
                      >
                        {activeTrace.label}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Mueve el cursor sobre la carta</p>
              )}
            </CardContent>
          </Card>

          {/* Trace stats */}
          {traces.filter(t => t.visible).map(tr => (
            <Card key={tr.id} className="border-border/50 bg-card/50">
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tr.color }} />
                  <p className="text-[11px] font-semibold text-muted-foreground truncate">{tr.label}</p>
                </div>
                <div className="space-y-0.5 font-mono text-[11px]">
                  <ReadoutRow label="Pts" value={String(tr.meta.n_points)} />
                  <ReadoutRow label="F₁" value={fmtHz(tr.meta.f_start)} />
                  <ReadoutRow label="F₂" value={fmtHz(tr.meta.f_stop)} />
                  <ReadoutRow label="S11 mín"
                    value={`${Math.min(...tr.s11Db).toFixed(1)} dB`}
                  />
                </div>
              </CardContent>
            </Card>
          ))}

          {/* ── Matching Network Assistant ──────────────────── */}
          <Card className="border-border/50 bg-card/50">
            <CardContent className="p-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Wrench className="w-3 h-3" /> Matching L-Network
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                Click en la carta para capturar ZL automáticamente.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <Label className="text-[10px] text-muted-foreground">RL (Ω)</Label>
                  <Input value={matchRL} onChange={e => setMatchRL(e.target.value)} className="h-7 text-xs px-2" placeholder="50" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">XL (Ω)</Label>
                  <Input value={matchXL} onChange={e => setMatchXL(e.target.value)} className="h-7 text-xs px-2" placeholder="0" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">f (MHz)</Label>
                  <Input value={matchFreq} onChange={e => setMatchFreq(e.target.value)} className="h-7 text-xs px-2" placeholder="1000" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Z₀ (Ω)</Label>
                  <Input value={matchZ0} onChange={e => setMatchZ0(e.target.value)} className="h-7 text-xs px-2" placeholder="50" />
                </div>
              </div>
              <Select value={matchESeries} onValueChange={setMatchESeries}>
                <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="E12">E12</SelectItem>
                  <SelectItem value="E24">E24</SelectItem>
                  <SelectItem value="E48">E48</SelectItem>
                  <SelectItem value="E96">E96</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="w-full h-7 text-xs"
                onClick={solveMatching}
                disabled={matchLoading || !matchRL || !matchFreq}
              >
                {matchLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Wrench className="w-3 h-3 mr-1" />}
                Resolver
              </Button>

              {/* Solutions */}
              {matchResults.length > 0 && (
                <div className="space-y-2 pt-1">
                  {matchResults.map((sol: any, i: number) => (
                    <div key={i} className="rounded-md border border-border/50 bg-muted/20 p-2 text-[10px] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-primary truncate">{sol.topology_name}</span>
                        <button
                          onClick={() => copyNetlist(sol.ltspice_netlist, i)}
                          className="text-muted-foreground hover:text-foreground ml-1 shrink-0"
                          title="Copiar netlist LTSpice"
                        >
                          {copiedIdx === i ? <CheckCheck className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-0.5 font-mono">
                        <span><span className="text-muted-foreground">Series: </span>{sol.series?.kind} {sol.series?.e_label}</span>
                        <span><span className="text-muted-foreground">Shunt:  </span>{sol.shunt?.kind} {sol.shunt?.e_label}</span>
                        <span><span className="text-muted-foreground">Q: </span>{sol.Q}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!matchLoading && matchResults.length === 0 && matchRL && matchFreq && (
                <p className="text-[10px] text-muted-foreground text-center">Sin soluciones para estos parámetros.</p>
              )}
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground px-1">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-muted-foreground/40 inline-block" />Traza: punto claro = inicio (baja f), punto brillante = final (alta f)</span>
        <span>•</span>
        <span>SC = Cortocircuito (Γ=−1) · OC = Circuito abierto (Γ=+1) · Z₀ = 50 Ω (Γ=0)</span>
      </div>
    </div>
  );
}

function ReadoutRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-muted-foreground text-[10px] shrink-0">{label}</span>
      <span className={`text-right truncate ${accent ? 'text-primary font-semibold' : 'text-foreground'}`}>
        {value}
      </span>
    </div>
  );
}
