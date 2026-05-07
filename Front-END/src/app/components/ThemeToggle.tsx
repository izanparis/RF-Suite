import React from 'react';
import { Moon, Sun, Languages } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from './ui/button';
import { useLanguage } from '../lib/i18n';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      <Button
        variant="outline"
        size="icon"
        className="rounded-full shadow-lg bg-card hover:bg-muted border-border"
        onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}
        title={language === 'es' ? 'Switch to English' : 'Cambiar a Español'}
      >
        <span className="text-xs font-bold">{language.toUpperCase()}</span>
        <span className="sr-only">Cambiar idioma</span>
      </Button>

      <Button
        variant="outline"
        size="icon"
        className="rounded-full shadow-lg bg-card hover:bg-muted border-border"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      >
        <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Cambiar tema</span>
      </Button>
    </div>
  );
}
