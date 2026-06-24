import React, { useEffect, useState, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { CalibrationTool } from './components/tools/CalibrationTool';
import { MeasurementTool } from './components/tools/MeasurementTool';
import { SParamAnalysisTool } from './components/tools/SParamAnalysisTool';
import { LibraryTool } from './components/tools/LibraryTool';
import { SammTool } from './components/tools/SammTool';
import { CompactModelTool } from './components/tools/CompactModelTool';
import { CutoffFreqTool } from './components/tools/CutoffFreqTool';
import { CorrectionTool } from './components/tools/CorrectionTool';
import { TransmissionLineCalculator } from './components/tools/TransmissionLineCalculator';
import { CableImpedanceTool } from './components/tools/CableImpedanceTool';
import { DatasheetTool } from './components/tools/DatasheetTool';
import { QuickComponentExtractor } from './components/tools/QuickComponentExtractor';
import { DeembedTool } from './components/tools/DeembedTool';
import { BatchTool } from './components/tools/BatchTool';
import { SmithChartTool } from './components/tools/SmithChartTool';
import { ProjectTool } from './components/tools/ProjectTool';
import { ReportTool } from './components/tools/ReportTool';
import { TdrTool } from './components/tools/TdrTool';
import { ComparisonTool } from './components/tools/ComparisonTool';
import { SequencerTool } from './components/tools/SequencerTool';
import { Sobre } from './components/Sobre';
import { ThemeToggle } from './components/ThemeToggle';
import { Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LanguageProvider, useLanguage } from './lib/i18n';
import { useBackendStatus } from './hooks/useBackendStatus';
import { TopCommandBar } from './components/TopCommandBar';
import { RFToolsHub } from './components/RFToolsHub';
import { Toaster } from './components/ui/sonner';
import { CommandPalette } from './components/CommandPalette';

function AppContent() {
  const [currentTool, setCurrentTool] = useState<string>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedLibraryFile, setSelectedLibraryFile] = useState<{name: string, device?: string, componentType?: string | null} | null>(null);
  const [compactModelPreload, setCompactModelPreload] = useState<{content: string; filename: string} | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [activeVna, setActiveVna] = useState<string | null>(() => {
    try { return localStorage.getItem('rf_last_vna'); } catch { return null; }
  });
  const [recentFiles, setRecentFiles] = useState<Array<{name: string; tool: string; subtitle?: string}>>(() => {
    try { return JSON.parse(localStorage.getItem('rf_recent_files') || '[]'); } catch { return []; }
  });
  const { t } = useLanguage();
  const backend = useBackendStatus();

  useEffect(() => {
    window.rfDesktop?.onBackendExit((payload) => {
      console.error('RF backend exited', payload);
    });
  }, []);

  // Global Ctrl+K and Escape keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(true);
      } else if (e.key === 'Escape' && !cmdOpen) {
        handleSelectTool('dashboard');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cmdOpen]);

  const addRecentFile = useCallback((name: string, tool: string, subtitle?: string) => {
    setRecentFiles((prev) => {
      const filtered = prev.filter((f) => f.name !== name);
      const next = [{ name, tool, subtitle: subtitle || tool }, ...filtered].slice(0, 10);
      try { localStorage.setItem('rf_recent_files', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const handleAnalyzeFile = (name: string, device?: string, componentType?: string | null) => {
    setSelectedLibraryFile({ name, device, componentType });
    setCurrentTool('csv-analysis');
    addRecentFile(name, 'csv-analysis', 'Análisis S-param');
  };

  const handleSelectTool = (tool: string) => {
    setCurrentTool(tool);
    if (tool === 'calibration' || tool === 'measurement' || tool === 'compact-model') {
      setSidebarCollapsed(true);
    }
  };

  const renderTool = () => {
    switch (currentTool) {
      case 'calibration':
        return <CalibrationTool onBackToDashboard={() => handleSelectTool('dashboard')} />;
      case 'measurement':
        return (
          <MeasurementTool
            onBackToDashboard={() => handleSelectTool('dashboard')}
            onVnaChange={(dev) => {
              setActiveVna(dev);
              try { localStorage.setItem('rf_last_vna', dev); } catch {}
            }}
          />
        );
      case 'csv-analysis':
        return <SParamAnalysisTool initialFile={selectedLibraryFile} onFileProcessed={() => setSelectedLibraryFile(null)} />;
      case 'library':
        return <LibraryTool onAnalyze={handleAnalyzeFile} />;
      case 'rf-tools':
        return <RFToolsHub onSelectTool={handleSelectTool} />;
      case 'samm':
        return <SammTool />;
      case 'compact-model':
        return <CompactModelTool preloadedFile={compactModelPreload} onPreloadConsumed={() => setCompactModelPreload(null)} />;
      case 'quick-extract':
        return <QuickComponentExtractor />;
      case 'cutoff-freq':
        return <CutoffFreqTool />;
      case 'correction':
        return <CorrectionTool />;
      case 'tline-calc':
        return <TransmissionLineCalculator />;
      case 'cable-impedance':
        return <CableImpedanceTool />;
      case 'datasheets':
        return <DatasheetTool />;
      case 'deembed':
        return (
          <DeembedTool
            onSendToCompactModel={(content, filename) => {
              setCompactModelPreload({ content, filename });
              handleSelectTool('compact-model');
            }}
          />
        );
      case 'batch':
        return <BatchTool />;
      case 'smith':
        return <SmithChartTool />;
      case 'project':
        return <ProjectTool />;
      case 'report':
        return <ReportTool />;
      case 'tdr':
        return <TdrTool />;
      case 'comparison':
        return <ComparisonTool />;
      case 'sequencer':
        return <SequencerTool />;
      case 'sobre':
        return <Sobre />;
      default:
        return <Dashboard onSelectTool={handleSelectTool} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground font-sans transition-colors duration-300">
      <Sidebar
        currentTool={currentTool}
        onSelectTool={handleSelectTool}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        backendStatus={backend.status}
        collapsed={sidebarCollapsed}
        recentFiles={recentFiles}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopCommandBar
          currentTool={currentTool}
          backendStatus={backend.status}
          onSelectTool={handleSelectTool}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
          onOpenCommandPalette={() => setCmdOpen(true)}
          vnaDevice={activeVna}
        />

        {/* Mobile Header */}
        <div className="md:hidden h-16 border-b border-border flex items-center px-4 bg-card">
          <button 
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <Menu className="w-6 h-6" />
          </button>
          <button 
            onClick={() => handleSelectTool('dashboard')}
            className="ml-2 font-semibold hover:text-primary transition-colors"
          >
            {t('app.title')}
          </button>
        </div>

        {/* Main Content */}
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {currentTool !== 'dashboard' && currentTool !== 'calibration' && currentTool !== 'measurement' && currentTool !== 'compact-model' && (
             <div className={(currentTool === 'calibration' || currentTool === 'measurement' || currentTool === 'compact-model') ? 'mx-auto flex max-w-4xl justify-end px-5 pt-3' : 'mx-auto flex max-w-5xl justify-end px-6 pt-6'}>
                <button
                  onClick={() => handleSelectTool('dashboard')}
                  title="Esc"
                  className="mb-2 inline-flex items-center rounded-md border border-primary/30 bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  Volver al Dashboard
                  <span className="ml-2 rounded border border-primary-foreground/30 px-1 py-0.5 text-[10px] font-mono opacity-60">Esc</span>
                </button>
             </div>
          )}
          
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTool}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              {renderTool()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <ThemeToggle />
      <Toaster position="bottom-right" richColors />
      <CommandPalette
        open={cmdOpen}
        onOpenChange={setCmdOpen}
        onSelectTool={handleSelectTool}
        recentFiles={recentFiles}
      />
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}
