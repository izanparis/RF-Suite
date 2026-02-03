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
    <div className={cn("w-full max-w-4xl mx-auto p-6 space-y-6", className)}>
      <div className="space-y-2 pb-6 border-b border-border/40">
        <div className="flex items-center gap-3">
          {icon && <div className="text-primary">{icon}</div>}
          <h2 className="text-3xl font-bold tracking-tight text-foreground">{title}</h2>
        </div>
        <p className="text-muted-foreground text-lg">{description}</p>
      </div>
      <div className="bg-card text-card-foreground rounded-xl border border-border shadow-sm p-6 md:p-8">
        {children}
      </div>
    </div>
  );
}
