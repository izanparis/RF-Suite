import React from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from './ui/command';
import {
  Activity,
  Cpu,
  FileText,
  Gauge,
  Layers,
  Library,
  Microscope,
  Ruler,
  SlidersHorizontal,
  Table,
  Wifi,
  Zap,
  CircuitBoard,
} from 'lucide-react';

const TOOLS = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge, group: 'Herramientas' },
  { id: 'measurement', label: 'Medir — VNA', icon: Activity, group: 'Herramientas' },
  { id: 'calibration', label: 'Calibrar — VNA', icon: SlidersHorizontal, group: 'Herramientas' },
  { id: 'csv-analysis', label: 'Analizar S-param', icon: Table, group: 'Herramientas' },
  { id: 'compact-model', label: 'Extracción RLC', icon: Cpu, group: 'Herramientas' },
  { id: 'library', label: 'Biblioteca', icon: Library, group: 'Herramientas' },
  { id: 'samm', label: 'SAMM', icon: Microscope, group: 'Herramientas' },
  { id: 'quick-extract', label: 'Extractor Rápido C/L', icon: Zap, group: 'Herramientas RF' },
  { id: 'cutoff-freq', label: 'Frecuencia de Corte', icon: Zap, group: 'Herramientas RF' },
  { id: 'correction', label: 'Corrección Offline', icon: CircuitBoard, group: 'Herramientas RF' },
  { id: 'tline-calc', label: 'Línea de Transmisión', icon: Ruler, group: 'Herramientas RF' },
  { id: 'deembed', label: 'De-embedding Open-Short', icon: Wifi, group: 'Herramientas RF' },
  { id: 'batch', label: 'Procesamiento en Lote', icon: Layers, group: 'Herramientas RF' },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTool: (tool: string) => void;
  recentFiles?: Array<{ name: string; tool: string }>;
}

export function CommandPalette({ open, onOpenChange, onSelectTool, recentFiles = [] }: CommandPaletteProps) {
  const run = (id: string) => {
    onSelectTool(id);
    onOpenChange(false);
  };

  const grouped: Record<string, typeof TOOLS> = {};
  TOOLS.forEach((t) => {
    (grouped[t.group] = grouped[t.group] || []).push(t);
  });

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Comando" description="Busca herramientas y archivos">
      <CommandInput placeholder="Buscar herramienta, archivo..." />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        {recentFiles.length > 0 && (
          <>
            <CommandGroup heading="Recientes">
              {recentFiles.slice(0, 5).map((f, i) => (
                <CommandItem key={i} onSelect={() => run(f.tool)}>
                  <FileText className="mr-2 h-4 w-4" />
                  {f.name}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        {Object.entries(grouped).map(([group, tools]) => (
          <CommandGroup key={group} heading={group}>
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <CommandItem key={tool.id} onSelect={() => run(tool.id)}>
                  <Icon className="mr-2 h-4 w-4" />
                  {tool.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
