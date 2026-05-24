import React from 'react';
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
} from 'lucide-react';
import { useLanguage } from '../lib/i18n';

interface DashboardProps {
  onSelectTool: (id: string) => void;
}

const pinnedIds = ['calibration', 'measurement', 'csv-analysis', 'library', 'samm', 'compact-model'];

export function Dashboard({ onSelectTool }: DashboardProps) {
  const { allTools } = useTools();
  const { t } = useLanguage();
  const pinnedTools = pinnedIds
    .map((id) => allTools.find((tool) => tool.id === id))
    .filter(Boolean) as typeof allTools;
  const labTools = allTools.filter((tool) => !pinnedIds.includes(tool.id));

  return (
    <div className="mx-auto w-full max-w-[1600px] p-4 md:p-5">
      <main className="min-w-0 space-y-4">
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
              <div className="hidden min-w-[270px] grid-cols-3 gap-2.5 lg:grid">
                <Metric label="API" value="Online" tone="success" />
                <Metric label="VNA" value="Listo" tone="primary" />
                <Metric label="Library" value="Local" tone="warning" />
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Continuar trabajo</h3>
                  <p className="text-xs text-muted-foreground">Sesiones y flujos recientes del laboratorio.</p>
                </div>
                <button
                  onClick={() => onSelectTool('library')}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Ver biblioteca
                </button>
              </div>
              <div className="grid gap-2 2xl:grid-cols-3">
                <SessionRow
                  title="Medicion S2P - Cable SMA"
                  meta="VNA-HP-8752A · 401 puntos · 1-1000 MHz"
                  icon={<Activity className="h-4 w-4" />}
                  onClick={() => onSelectTool('measurement')}
                />
                <SessionRow
                  title="Calibracion S11 HP8752A"
                  meta="Open / Short / Load · JSON guardado"
                  icon={<RadioTower className="h-4 w-4" />}
                  onClick={() => onSelectTool('calibration')}
                />
                <SessionRow
                  title="Modelo compacto cap_470p"
                  meta="Extraccion .cir · Biblioteca local"
                  icon={<Zap className="h-4 w-4" />}
                  onClick={() => onSelectTool('compact-model')}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-foreground">Estado del laboratorio</h3>
                <p className="text-xs text-muted-foreground">Resumen rapido de entorno y datos.</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <LabTile icon={<CheckCircle2 className="h-4 w-4" />} label="Backend" value="Online" tone="success" />
                <LabTile icon={<RadioTower className="h-4 w-4" />} label="VNA" value="Local" tone="primary" />
                <LabTile icon={<Database className="h-4 w-4" />} label="Calibraciones" value="Biblioteca" tone="warning" />
                <LabTile icon={<FolderOpen className="h-4 w-4" />} label="Mediciones" value="Touchstone" tone="primary" />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-[var(--rf-panel)] p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">Herramientas fijadas</h3>
                <p className="text-xs text-muted-foreground">Accesos directos para el flujo calibrar, medir, analizar y modelar.</p>
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

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-base font-semibold text-foreground">Biblioteca reciente</h3>
              {['cal_response_hp8752a_1_1000_401.json', 'cap_470p_adrian.s2p', 'cap_470p_adrian.cir'].map((file) => (
                <button
                  key={file}
                  onClick={() => onSelectTool('library')}
                  className="flex w-full items-center gap-3 border-b border-border py-2.5 text-left last:border-0 hover:text-primary"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{file}</span>
                  <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <h3 className="mb-3 text-base font-semibold text-foreground">Herramientas avanzadas</h3>
              <div className="grid grid-cols-2 gap-2">
                {labTools.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <button
                      key={tool.id}
                      onClick={() => onSelectTool(tool.id)}
                      className="flex items-center gap-2 rounded-md border border-border bg-[var(--rf-panel-soft)] p-2.5 text-left text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-primary"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="line-clamp-1">{tool.name}</span>
                    </button>
                  );
                })}
              </div>
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

function SessionRow({ title, meta, icon, onClick }: { title: string; meta: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md border border-border bg-[var(--rf-panel-soft)] p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{meta}</span>
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </button>
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
