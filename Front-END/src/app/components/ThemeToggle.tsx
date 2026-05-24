import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from './ui/button';
import { useLanguage } from '../lib/i18n';
import { useTheme } from '../lib/theme';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex gap-2 rounded-lg border border-border bg-[var(--rf-topbar)] p-1.5 shadow-lg backdrop-blur-xl">
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 rounded-md border-border bg-card shadow-none hover:bg-muted"
        onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}
        title={language === 'es' ? 'Switch to English' : 'Cambiar a Español'}
      >
        <span className="text-xs font-bold">{language.toUpperCase()}</span>
        <span className="sr-only">Cambiar idioma</span>
      </Button>

      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 rounded-md border-border bg-card shadow-none hover:bg-muted"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Cambiar tema</span>
      </Button>
    </div>
  );
}
