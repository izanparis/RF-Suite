import React from 'react';
import {
  Activity,
  BookOpen,
  ChevronRight,
  CircuitBoard,
  Clock3,
  Cpu,
  Gauge,
  Info,
  Library,
  Microscope,
  Radio,
  SlidersHorizontal,
  Table,
  Zap,
} from 'lucide-react';
import { cn } from './ui/utils';
import { useLanguage } from '../lib/i18n';

interface SidebarProps {
  currentTool: string;
  onSelectTool: (tool: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  backendStatus: 'checking' | 'online' | 'offline';
  collapsed: boolean;
  recentFiles?: Array<{ name: string; tool: string; subtitle?: string }>;
}

const primaryNav = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge },
  { id: 'calibration', label: 'Calibrar', icon: SlidersHorizontal },
  { id: 'measurement', label: 'Medir', icon: Activity },
  { id: 'csv-analysis', label: 'Analizar', icon: Table },
  { id: 'compact-model', label: 'Extracción RLC', icon: Cpu },
  { id: 'samm', label: 'SAMM', icon: Microscope },
  { id: 'rf-tools', label: 'Herramientas RF', icon: Zap },
  { id: 'library', label: 'Biblioteca', icon: Library },
];

const rfToolIds = ['cutoff-freq', 'correction', 'tline-calc', 'cable-impedance', 'deembed', 'quick-extract', 'batch'];

export function Sidebar({ currentTool, onSelectTool, isOpen, setIsOpen, backendStatus, collapsed, recentFiles: recentFilesProp }: SidebarProps) {
  const { t } = useLanguage();
  const backendOnline = backendStatus === 'online';

  // Dynamic recent files — use prop from App (already kept in sync with localStorage)
  const recentFiles = recentFilesProp ?? [];

  const selectTool = (tool: string) => {
    onSelectTool(tool);
    setIsOpen(false);
  };

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-20 bg-black/50 transition-opacity md:hidden',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setIsOpen(false)}
      />

      <aside
        className={cn(
          'rf-sidebar fixed left-0 top-0 z-30 flex h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[8px_0_30px_rgba(15,23,42,0.04)] transition-all duration-300 ease-in-out md:sticky md:translate-x-0',
          collapsed ? 'md:w-[76px]' : 'w-[286px]',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <button
          onClick={() => selectTool('dashboard')}
          className={cn(
            'rf-sidebar-brand flex h-[68px] items-center gap-3 border-b border-sidebar-border px-4 text-left transition-colors hover:bg-sidebar-accent/70',
            collapsed && 'justify-center px-2'
          )}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <Radio className="h-5 w-5" />
          </span>
          <span className={cn('min-w-0', collapsed && 'hidden')}>
            <span className="block truncate text-base font-bold tracking-tight">{t('app.title')}</span>
            <span className="block truncate text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Lab workspace</span>
          </span>
        </button>

        <div className={cn('rf-sidebar-content min-h-0 flex-1 space-y-4 overflow-hidden px-3 py-4', collapsed && 'px-2')}>
          <section className="rf-sidebar-nav space-y-1">
            <div className={cn('px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground', collapsed && 'hidden')}>
              Navegacion
            </div>
            {primaryNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentTool === item.id || (item.id === 'rf-tools' && rfToolIds.includes(currentTool));
              return (
                <button
                  key={item.id}
                  onClick={() => selectTool(item.id)}
                  className={cn(
                    'rf-sidebar-nav-item flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors',
                    collapsed && 'justify-center px-0',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                  <span className={cn('truncate', collapsed && 'hidden')}>{item.label}</span>
                </button>
              );
            })}
          </section>

          <section className={cn('rf-sidebar-sessions space-y-1.5', collapsed && 'hidden')}>
            <div className="flex items-center justify-between px-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Sesiones</span>
              <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            {recentFiles.length === 0 ? (
              <p className="px-2 py-1.5 text-[11px] text-muted-foreground italic">Sin sesiones recientes</p>
            ) : (
              recentFiles.slice(0, 4).map((f, i) => (
                <button
                  key={i}
                  onClick={() => selectTool(f.tool)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <BookOpen className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{f.name}</span>
                    <span className="block truncate text-[11px]">{f.subtitle || f.tool}</span>
                  </span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ))
            )}
          </section>

        </div>

        <div className={cn('rf-sidebar-status space-y-2 border-t border-sidebar-border p-3', collapsed && 'p-2')}>
          <button
            onClick={() => selectTool('sobre')}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-[var(--rf-panel-soft)] px-3 py-2 text-sm font-medium transition-colors',
              collapsed && 'justify-center px-0',
              currentTool === 'sobre'
                ? 'border-primary/40 bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
            title="Sobre mi"
          >
            <Info className="h-4 w-4" />
            <span className={cn(collapsed && 'hidden')}>Sobre mi</span>
          </button>

          <div className="rounded-lg border border-sidebar-border bg-[var(--rf-panel-soft)] p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 font-semibold text-foreground">
                <CircuitBoard className="h-4 w-4 text-primary" />
                <span className={cn(collapsed && 'hidden')}>Backend</span>
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  backendOnline ? 'bg-[var(--rf-success)]/15 text-[var(--rf-success)]' : 'bg-destructive/10 text-destructive'
                )}
              >
                {backendStatus === 'checking' ? 'checking' : backendOnline ? 'online' : 'offline'}
              </span>
            </div>
            <div className={cn('mt-2 text-[11px] text-muted-foreground', collapsed && 'hidden')}>127.0.0.1:8080</div>
          </div>
        </div>
      </aside>
    </>
  );
}
