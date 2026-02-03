import React from 'react';
import { Button } from './ui/button';

export interface ToolAction {
  id: string;
  label: string;
  variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'ghost' | 'link';
}

interface ToolShellProps {
  title: string;
  description: string;
  actions?: ToolAction[];
  onAction?: (actionId: string) => void;
  children: React.ReactNode;
}

export function ToolShell({ title, description, actions = [], onAction, children }: ToolShellProps) {
  return (
    <div className="max-w-4xl mx-auto p-6 md:p-10 space-y-6">
      <div className="space-y-3">
        <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight">{title}</h2>
        <p className="text-muted-foreground text-base md:text-lg max-w-2xl">{description}</p>

        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {actions.map((a) => (
              <Button
                key={a.id}
                variant={a.variant ?? 'secondary'}
                onClick={() => onAction?.(a.id)}
              >
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-6">{children}</div>
    </div>
  );
}
