import React, { useEffect, useState } from 'react';
import { useTools } from '../hooks/useTools';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  FolderOpen,
  RadioTower,
  Sparkles,
  Zap,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { useLanguage } from '../lib/i18n';

const API = 'http://127.0.0.1:8080';

interface DashboardProps {
  onSelectTool: (id: string) => void;
}

interface DbStats {
  total_measurements:  number;
  measurements_today:  number;
  total_projects:      number;
  total_calibrations:  number;
  quality:             Record<string, number>;
  component_types:     Record<string, number>;
}

interface RecentMeasurement {
  id:             number;
  filename:       string;
  component_type: string | null;
  device_name:    string | null;
  nominal_value:  number | null;
  nominal_unit:   string | null;
  quality:        string | null;
  created_at:     string | null;
  nports:         number | null;
  freq_start_hz:  number | null;
  freq_stop_hz:   number | null;
}

const pinnedIds = ['calibration', 'measurement', 'csv-analysis', 'library', 'samm', 'compact-model'];

function fmtHz(hz: number | null): string {
  if (!hz) return '';
  if (hz >= 1e9) return `${(hz / 1e9).toFixed(0)} GHz`;
  if (hz >= 1e6) return `${(hz / 1e6).toFixed(0)} MHz`;
  return `${(hz / 1e3).toFixed(0)} kHz`;
}

function fmtValue(val: number | null, unit: string | null): string {
  if (val == null || !unit) return '';
  if (unit === 'F') {
    if (val >= 1e-6) return `${(val * 1e6).toPrecision(3)} µF`;
    if (val >= 1e-9) return `${(val * 1e9).toPrecision(3)} nF`;
    return `${(val * 1e12).toPrecision(3)} pF`;
  }
  if (unit === 'H') {
    if (val >= 1e-3) return `${(val * 1e3).toPrecision(3)} mH`;
    if (val >= 1e-6) return `${(val * 1e6).toPrecision(3)} µH`;
    return `${(val * 1e9).toPrecision(3)} nH`;
  }
  return `${val} ${unit}`;
}

function qualityDot(q: string | null) {
  if (q === 'good')  return 'bg-emerald-400';
  if (q === 'fair')  return 'bg-amber-400';
  if (q === 'poor')  return 'bg-red-400';
  return 'bg-muted-foreground/40';
}

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)   return 'ahora';
  if (diffMin < 60)  return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)    return `hace ${diffH} h`;
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export function Dashboard({ onSelectTool }: DashboardProps) {
  const { allTools } = useTools();
  const { t } = useLanguage();

  const [stats,   setStats]   = useState<DbStats | null>(null);
  const [recent,  setRecent]  = useState<RecentMeasurement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch(`${API}/api/db/stats`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/api/db/measurements/recent?n=5`).then(r => r.ok ? r.json() : []),
    ]).then(([s, r]) => {
      if (!alive) return;
      if (s) setStats(s);
      if (Array.isArray(r)) setRecent(r);
    }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const pinnedTools = pinnedIds
    .map((id) => allTools.find((tool) => tool.id === id))
    .filter(Boolean) as typeof allTools;
  const labTools = allTools.filter((tool) => !pinnedIds.includes(tool.id));

  const totalMeas    = stats?.total_measurements  ?? 0;
  const measToday    = stats?.measurements_today  ?? 0;
  const totalProj    = stats?.total_projects      ?? 0;
  const goodCount    = stats?.quality?.good       ?? 0;
  const yield_pct    = totalMeas > 0 ? Math.round((goodCount / totalMeas) * 100) : null;

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 md:p-5">
      <main className="min-w-0 space-y-4">

        {/* Header */}
        <section className="rounded-lg border border-border bg-[var(--rf-panel)] p-4 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Workspace operativo
              </div>
              <h2 className="text-xl font-extrabold tracking-tight text-foreground lg:text-2xl">{t('app.title')}</h2>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">{t('dash.desc')}</p>
            </div>
            {/* Live DB stats pills */}
            <div className="hidden min-w-[300px] grid-cols-3 gap-2.5 lg:grid">
              <Metric label="Medidas" value={loading ? '…' : String(totalMeas)} tone="primary" />
              <Metric label="Hoy"     value={loading ? '…' : String(measToday)} tone="success" />
              <Metric label="Proyectos" value={loading ? '…' : String(totalProj)} tone="warning" />
            </div>
          </div>
        </section>

        {/* Estado + medidas recientes */}
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">

          {/* Medidas recientes */}
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">Medidas recientes</h3>
                <p className="text-xs text-muted-foreground">Últimas mediciones registradas en la base de datos.</p>
              </div>
              <button onClick={() => onSelectTool('library')} className="text-xs font-semibold text-primary hover:underline">
                Ver biblioteca
              </button>
            </div>
            <div className="space-y-0">
              {loading ? (
                <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">Cargando…</div>
              ) : recent.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-24 gap-2">
                  <Database className="h-6 w-6 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">Sin medidas registradas aún.</p>
                  <button onClick={() => onSelectTool('measurement')} className="text-xs text-primary hover:underline">
                    Realizar primera medida
                  </button>
                </div>
              ) : recent.map((m) => {
                const meta = [
                  m.device_name,
                  m.nports ? `${m.nports}-port` : null,
                  m.freq_start_hz && m.freq_stop_hz
                    ? `${fmtHz(m.freq_start_hz)}–${fmtHz(m.freq_stop_hz)}`
                    : null,
                  fmtValue(m.nominal_value, m.nominal_unit),
                ].filter(Boolean).join(' · ');

                return (
                  <button
                    key={m.id}
                    onClick={() => onSelectTool('library')}
                    className="flex w-full items-center gap-3 border-b border-border/50 py-2.5 text-left last:border-0 hover:text-primary transition-colors"
                  >
                    <span className={`h-2 w-2 rounded-full shrink-0 ${qualityDot(m.quality)}`} />
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{m.filename}</span>
                      {meta && <span className="block truncate text-xs text-muted-foreground">{meta}</span>}
                    </span>
                    <Clock3 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground shrink-0">{fmtDate(m.created_at)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Estado del laboratorio */}
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="mb-3">
              <h3 className="text-base font-semibold text-foreground">Estado del laboratorio</h3>
              <p className="text-xs text-muted-foreground">Resumen rápido de entorno y calidad de datos.</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <LabTile icon={<CheckCircle2 className="h-4 w-4" />} label="Backend" value="Online"    tone="success" />
              <LabTile icon={<RadioTower   className="h-4 w-4" />} label="VNA"     value="Listo"     tone="primary" />
              <LabTile icon={<Database     className="h-4 w-4" />} label="BD"
                value={loading ? '…' : `${totalMeas} medidas`} tone="warning" />
              <LabTile icon={<TrendingUp   className="h-4 w-4" />} label="Yield"
                value={loading || yield_pct === null ? '—' : `${yield_pct}%`} tone="success" />
            </div>

            {/* Quality breakdown bar */}
            {stats && totalMeas > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Calidad de medidas</p>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                  {(['good', 'fair', 'poor', 'bad'] as const).map((q) => {
                    const cnt = stats.quality[q] ?? 0;
                    const pct = (cnt / totalMeas) * 100;
                    const colors: Record<string, string> = {
                      good: 'bg-emerald-500', fair: 'bg-amber-400', poor: 'bg-red-400', bad: 'bg-muted-foreground/30',
                    };
                    return pct > 0 ? (
                      <div key={q} className={`${colors[q]} h-full transition-all`} style={{ width: `${pct}%` }} title={`${q}: ${cnt}`} />
                    ) : null;
                  })}
                </div>
                <div className="flex gap-3 text-[10px] text-muted-foreground">
                  {(['good', 'fair', 'poor'] as const).map(q => {
                    const cnt = stats.quality[q] ?? 0;
                    if (!cnt) return null;
                    const dots: Record<string, string> = { good: 'bg-emerald-500', fair: 'bg-amber-400', poor: 'bg-red-400' };
                    const labels: Record<string, string> = { good: 'buena', fair: 'regular', poor: 'pobre' };
                    return (
                      <span key={q} className="flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${dots[q]}`} />
                        {cnt} {labels[q]}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Component type breakdown */}
            {stats && (
              <div className="mt-3 flex gap-3">
                {Object.entries(stats.component_types).map(([t, cnt]) => (
                  <div key={t} className="rounded-md border border-border bg-[var(--rf-panel-soft)] px-2.5 py-1.5 text-center">
                    <div className="text-[10px] text-muted-foreground capitalize">{t === 'capacitor' ? 'Cap' : t === 'inductor' ? 'Ind' : t}</div>
                    <div className="text-sm font-bold text-foreground">{cnt}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Herramientas fijadas */}
        <section className="rounded-lg border border-border bg-[var(--rf-panel)] p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Herramientas fijadas</h3>
              <p className="text-xs text-muted-foreground">Flujo calibrar → medir → analizar → modelar.</p>
            </div>
            <span className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {pinnedTools.length} fijadas
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {pinnedTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => onSelectTool(tool.id)}
                  className="group flex min-h-[116px] flex-col rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                  <span className="text-sm font-semibold text-foreground group-hover:text-primary">{tool.name}</span>
                  <span className="mt-1 line-clamp-2 text-xs leading-4 text-muted-foreground">{tool.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Herramientas avanzadas */}
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-foreground">Herramientas avanzadas</h3>
            {yield_pct !== null && yield_pct < 80 && (
              <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-3.5 w-3.5" />
                Yield bajo — revisa medidas
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {labTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  onClick={() => onSelectTool(tool.id)}
                  className="flex items-center gap-2 rounded-md border border-border bg-[var(--rf-panel-soft)] p-2.5 text-left text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="line-clamp-1">{tool.name}</span>
                </button>
              );
            })}
          </div>
        </section>

      </main>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: 'primary' | 'success' | 'warning' }) {
  const color = tone === 'success' ? 'var(--rf-success)' : tone === 'warning' ? 'var(--rf-warning)' : 'var(--primary)';
  return (
    <div className="rounded-lg border border-border bg-[var(--rf-panel-soft)] p-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {value}
      </div>
    </div>
  );
}

function LabTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: 'primary' | 'success' | 'warning' }) {
  const color = tone === 'success' ? 'var(--rf-success)' : tone === 'warning' ? 'var(--rf-warning)' : 'var(--primary)';
  return (
    <div className="rounded-lg border border-border bg-[var(--rf-panel-soft)] p-2.5">
      <div className="flex items-center gap-2" style={{ color }}>
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <div className="mt-2 text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
