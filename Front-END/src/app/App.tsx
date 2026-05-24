import React, { useEffect, useState } from 'react';
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
import { Sobre } from './components/Sobre';
import { ThemeToggle } from './components/ThemeToggle';
import { Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LanguageProvider, useLanguage } from './lib/i18n';
import { useBackendStatus } from './hooks/useBackendStatus';
import { TopCommandBar } from './components/TopCommandBar';
import { RFToolsHub } from './components/RFToolsHub';

function AppContent() {
  const [currentTool, setCurrentTool] = useState<string>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedLibraryFile, setSelectedLibraryFile] = useState<{name: string, device?: string, componentType?: string | null} | null>(null);
  const { t } = useLanguage();
  const backend = useBackendStatus();

  useEffect(() => {
    window.rfDesktop?.onBackendExit((payload) => {
      console.error('RF backend exited', payload);
    });
  }, []);

  const handleAnalyzeFile = (name: string, device?: string, componentType?: string | null) => {
    setSelectedLibraryFile({ name, device, componentType });
    setCurrentTool('csv-analysis');
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
        return <MeasurementTool onBackToDashboard={() => handleSelectTool('dashboard')} />;
      case 'csv-analysis':
        return <SParamAnalysisTool initialFile={selectedLibraryFile} onFileProcessed={() => setSelectedLibraryFile(null)} />;
      case 'library':
        return <LibraryTool onAnalyze={handleAnalyzeFile} />;
      case 'rf-tools':
        return <RFToolsHub onSelectTool={handleSelectTool} />;
      case 'samm':
        return <SammTool />;
      case 'compact-model':
        return <CompactModelTool />;
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
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopCommandBar
          currentTool={currentTool}
          backendStatus={backend.status}
          onSelectTool={handleSelectTool}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
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
                  className="mb-2 inline-flex items-center rounded-md border border-primary/30 bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  Volver al Dashboard
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
