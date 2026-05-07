import React from 'react';
import {
  Radio,
  LayoutDashboard,
  Info
} from 'lucide-react';

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useLanguage } from '../lib/i18n';
import { useTools } from '../hooks/useTools';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  currentTool: string;
  onSelectTool: (tool: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export function Sidebar({ currentTool, onSelectTool, isOpen, setIsOpen }: SidebarProps) {
  const { t } = useLanguage();
  const { mainTools, labTools } = useTools();

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
          <h1 className="text-xl font-bold tracking-tight">{t('app.title')}</h1>
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
            {t('dashboard')}
          </button>

          {/* Sección Ingeniería RF */}
          <div className="text-xs font-semibold text-muted-foreground mb-2 px-2 uppercase tracking-wider mt-4">
            {t('rf_engineering')}
          </div>
          {mainTools.map((tool) => {
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

          {/* Sección Laboratorio */}
          <div className="text-xs font-semibold text-muted-foreground mb-2 px-2 uppercase tracking-wider mt-6 pt-4 border-t border-border/50">
            {t('laboratory')}
          </div>
          {labTools.map((tool) => {
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
              {t('about')}
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
