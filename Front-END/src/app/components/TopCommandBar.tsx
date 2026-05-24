import React from 'react';
import {
  Activity,
  Maximize2,
  Minus,
  PanelLeft,
  X,
  Gauge,
  Library,
  RadioTower,
  Search,
  Settings2,
  SlidersHorizontal,
  Table,
  Wifi,
} from 'lucide-react';
import { cn } from './ui/utils';

interface TopCommandBarProps {
  currentTool: string;
  backendStatus: 'checking' | 'online' | 'offline';
  onSelectTool: (tool: string) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge },
  { id: 'calibration', label: 'Calibrar', icon: SlidersHorizontal },
  { id: 'measurement', label: 'Medir', icon: Activity },
  { id: 'csv-analysis', label: 'Analizar', icon: Table },
  { id: 'library', label: 'Biblioteca', icon: Library },
];

export function TopCommandBar({ currentTool, backendStatus, onSelectTool, sidebarCollapsed, onToggleSidebar }: TopCommandBarProps) {
  const backendOnline = backendStatus === 'online';

  return (
    <header className="hidden h-12 select-none items-center border-b border-border bg-[var(--rf-topbar)] backdrop-blur-xl md:flex">
      <div className="flex h-full min-w-0 flex-1 items-center gap-2 px-2 [app-region:drag]">
        <div className="flex shrink-0 items-center gap-2 pr-1 [app-region:no-drag]">
          <button
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground',
              sidebarCollapsed && 'bg-muted text-foreground'
            )}
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-primary shadow-sm">
            <RadioTower className="h-4 w-4" />
          </span>
          <span className="hidden min-w-0 2xl:block">
            <span className="block truncate text-xs font-semibold text-foreground">RF Tool Suite</span>
            <span className="block truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Desktop</span>
          </span>
        </div>

        <nav className="flex shrink-0 items-center rounded-md border border-border bg-card p-0.5 shadow-sm [app-region:no-drag]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTool === tab.id || (tab.id === 'dashboard' && currentTool === 'sobre');
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTool(tab.id)}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded px-2 text-xs font-semibold transition-colors xl:px-2.5',
                  isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex h-8 min-w-[160px] max-w-xl flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 text-muted-foreground shadow-sm [app-region:no-drag]">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <input
            className="h-full min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Buscar herramienta, archivo o comando"
          />
          <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Ctrl K</span>
        </div>

        <div className="ml-auto hidden shrink-0 items-center gap-1.5 [app-region:no-drag] xl:flex">
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground">
            <Wifi className={cn('h-3.5 w-3.5', backendOnline ? 'text-[var(--rf-success)]' : 'text-destructive')} />
            <span className="hidden xl:inline">{backendStatus === 'checking' ? 'API...' : backendOnline ? 'Online' : 'Offline'}</span>
          </span>
          <button className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground">
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex h-full shrink-0 items-center border-l border-border [app-region:no-drag]">
        <button
          onClick={() => window.rfDesktop?.minimize()}
          className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Minimizar"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={() => window.rfDesktop?.toggleMaximize()}
          className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Maximizar"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => window.rfDesktop?.close()}
          className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
          title="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
