import React from 'react';
import {
  Radio,
  SlidersHorizontal,
  Activity,
  FileDown,
  Table,
  Wand2,
  CircuitBoard,
  LayoutDashboard,
  Info
} from 'lucide-react';

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  currentTool: string;
  onSelectTool: (tool: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const tools = [
  {
    id: 'calibration',
    name: 'Calibración',
    description: 'Calibración SOLT.',
    icon: SlidersHorizontal,
  },
  {
    id: 'measurement',
    name: 'Extracción de S-Params ',
    description: 'Carga la calibración, mide y exporta los datos del VNA.',
    icon: Activity,
  },
  {
    id: 'csv-analysis',
    name: 'Análisis Parámetros-S (S2P)',
    description: 'Analiza magnitud/fase desde un archivo Touchstone.',
    icon: Table,
  },
  {
    id: 'samm',
    name: 'Selección Automática del Modelo de Medición (SAMM)',
    description: 'Selección Automática del Modelo de Medición',
    icon: Wand2,
  },
  {
    id: 'rlc-model',
    name: 'Modelo RLC',
    description: 'Ajuste automático del equivalente RLC.',
    icon: CircuitBoard,
  },
];

export function Sidebar({ currentTool, onSelectTool, isOpen, setIsOpen }: SidebarProps) {
  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={cn(
          "fixed inset-0 bg-black/50 z-20 md:hidden transition-opacity",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setIsOpen(false)}
      />

      {/* Sidebar Content */}
      <div className={cn(
        "fixed md:sticky top-0 left-0 h-screen w-64 bg-card border-r border-border z-30 transition-transform duration-300 ease-in-out md:translate-x-0 overflow-y-auto",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <button 
          onClick={() => {
            onSelectTool('dashboard');
            setIsOpen(false);
          }}
          className="h-16 flex items-center px-6 border-b border-border w-full hover:bg-muted/50 transition-colors text-left"
        >
          <Radio className="w-6 h-6 text-primary mr-2" />
          <h1 className="text-xl font-bold tracking-tight">RF Suite</h1>
        </button>

        <div className="p-4 space-y-1">
          <button
            onClick={() => {
              onSelectTool('dashboard');
              setIsOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors mb-4",
              currentTool === 'dashboard' 
                ? "bg-primary/10 text-primary" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <LayoutDashboard className={cn("w-5 h-5", currentTool === 'dashboard' ? "text-primary" : "text-muted-foreground")} />
            Dashboard
          </button>

          <div className="text-xs font-semibold text-muted-foreground mb-4 px-2 uppercase tracking-wider">
            Tools
          </div>
          {tools.map((tool) => {
            const Icon = tool.icon;
            const isActive = currentTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => {
                  onSelectTool(tool.id);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")} />
                {tool.name}
              </button>
            );
          })}

          <div className="pt-4 mt-4 border-t border-border">
            <button
              onClick={() => {
                onSelectTool('sobre');
                setIsOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                currentTool === 'sobre' 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Info className={cn("w-5 h-5", currentTool === 'sobre' ? "text-primary" : "text-muted-foreground")} />
              Sobre
            </button>
          </div>
        </div>

        <div className="absolute bottom-4 left-0 right-0 px-6 text-xs text-muted-foreground text-center">
            &copy; 2026 RF Tools Suite
        </div>
      </div>
    </>
  );
}
