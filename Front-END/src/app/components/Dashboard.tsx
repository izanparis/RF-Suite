import React from 'react';
import { useTools } from '../hooks/useTools';
import { ArrowRight, Info } from 'lucide-react';
import { useLanguage } from '../lib/i18n';

interface DashboardProps {
  onSelectTool: (id: string) => void;
}

export function Dashboard({ onSelectTool }: DashboardProps) {
  const { allTools } = useTools();
  const { t } = useLanguage();

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-10 space-y-10">
      <div className="space-y-4 text-center md:text-left">
        <h2 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-zinc-900">{t('app.title')}</h2>
        <p className="text-xl text-muted-foreground max-w-2xl">
          {t('dash.desc')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {allTools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              onClick={() => onSelectTool(tool.id)}
              className="group relative flex flex-col p-6 bg-card border border-border rounded-xl shadow-xs hover:shadow-md transition-all hover:-translate-y-1 text-left"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <Icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors text-zinc-900">
                {tool.name}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {tool.description}
              </p>
              <div className="mt-auto flex items-center text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                {t('dash.action.open')} <ArrowRight className="w-3 h-3 ml-1" />
              </div>
            </button>
          );
        })}

        {/* Access to Sobre */}
        <button
          onClick={() => onSelectTool('sobre')}
          className="group relative flex flex-col p-6 bg-primary/5 border border-primary/20 rounded-xl shadow-xs hover:shadow-md transition-all hover:-translate-y-1 text-left"
        >
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
            <Info className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors text-zinc-900">
            {t('about')}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t('dash.about.desc')}
          </p>
          <div className="mt-auto flex items-center text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            {t('dash.about.action')} <ArrowRight className="w-3 h-3 ml-1" />
          </div>
        </button>
      </div>
    </div>
  );
}
