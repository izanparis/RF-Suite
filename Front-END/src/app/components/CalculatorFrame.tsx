import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CalculatorFrameProps {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}

export function CalculatorFrame({ title, description, children, className, icon }: CalculatorFrameProps) {
  return (
    <div className={cn("w-full max-w-5xl mx-auto p-6 md:p-8 space-y-6", className)}>
      <div className="rounded-lg border border-border bg-[var(--rf-panel)] p-6 shadow-sm">
        <div className="flex items-center gap-3">
          {icon && <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</div>}
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        </div>
        <p className="mt-2 max-w-3xl text-muted-foreground">{description}</p>
      </div>
      <div className="bg-card text-card-foreground rounded-lg border border-border shadow-sm p-6 md:p-8">
        {children}
      </div>
    </div>
  );
}
