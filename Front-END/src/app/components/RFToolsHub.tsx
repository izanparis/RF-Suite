import React from 'react';
import { ArrowRight, CircuitBoard, FileSearch, FlaskConical, Ruler, Zap } from 'lucide-react';
import { ToolShell } from './ToolShell';
import { Card, CardContent } from './ui/card';

interface RFToolsHubProps {
  onSelectTool: (tool: string) => void;
}

const rfTools = [
  {
    id: 'quick-extract',
    title: 'Extractor Rapido C/L',
    description: 'Calcula capacitancia o inductancia nominal y SRF promediando por pendiente.',
    icon: Zap,
    badge: 'Analisis Rapido',
  },
  {
    id: 'cutoff-freq',
    title: 'Frecuencia de Corte',
    description: 'Calcula la frecuencia de corte a partir de mediciones de impedancia y parametros S.',
    icon: Zap,
    badge: 'Analisis',
  },
  {
    id: 'correction',
    title: 'Correccion Offline',
    description: 'Aplica correcciones S-parameter con archivos RAW y coeficientes externos.',
    icon: FlaskConical,
    badge: 'Post-proceso',
  },
  {
    id: 'tline-calc',
    title: 'Linea de Transmision',
    description: 'Calcula longitud electrica, fase, impedancia y parametros de linea.',
    icon: Ruler,
    badge: 'Calculadora',
  },
  {
    id: 'cable-impedance',
    title: 'Impedancia Cable y Vf',
    description: 'Estima impedancia caracteristica y factor de velocidad de cables RF.',
    icon: CircuitBoard,
    badge: 'Cableado',
  },
  {
    id: 'datasheets',
    title: 'Datasheets',
    description: 'Busca hojas de datos por referencia y fijalas a componentes medidos.',
    icon: FileSearch,
    badge: 'Biblioteca',
  },
];

export function RFToolsHub({ onSelectTool }: RFToolsHubProps) {
  return (
    <ToolShell
      title="Herramientas RF"
      description="Selecciona la utilidad de radiofrecuencia que quieres abrir."
    >
      <div className="flex flex-col items-center justify-center py-8 gap-6">
        <div className="grid w-full max-w-5xl grid-cols-1 gap-5 px-4 md:grid-cols-2">
          {rfTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Card
                key={tool.id}
                className="group relative min-h-[220px] cursor-pointer overflow-hidden border-2 transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:shadow-md"
                onClick={() => onSelectTool(tool.id)}
              >
                <div className="absolute right-0 top-0 p-5 text-primary opacity-10 transition-opacity group-hover:opacity-20">
                  <Icon size={92} />
                </div>
                <CardContent className="relative flex h-full flex-col justify-between p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex h-13 w-13 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110">
                        <Icon className="h-6 w-6" />
                      </span>
                      <span className="rounded-full border border-border bg-[var(--rf-panel-soft)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {tool.badge}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-xl font-bold tracking-tight text-foreground">{tool.title}</h3>
                      <p className="mt-2 max-w-sm text-sm leading-5 text-muted-foreground">{tool.description}</p>
                    </div>
                  </div>
                  <div className="mt-6 flex items-center justify-between text-sm font-semibold text-primary">
                    Abrir herramienta
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </ToolShell>
  );
}
