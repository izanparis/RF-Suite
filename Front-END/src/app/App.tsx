import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { CalibrationTool } from './components/tools/CalibrationTool';
import { MeasurementTool } from './components/tools/MeasurementTool';
import { SParamAnalysisTool } from './components/tools/SParamAnalysisTool';
import { LibraryTool } from './components/tools/LibraryTool';
import { SammTool } from './components/tools/SammTool';
import { CompactModelTool } from './components/tools/CompactModelTool';
import { CutoffFreqTool } from './components/tools/CutoffFreqTool';
import { TransmissionLineCalculator } from './components/tools/TransmissionLineCalculator';
import { CableImpedanceTool } from './components/tools/CableImpedanceTool';
import { Sobre } from './components/Sobre';
import { ThemeToggle } from './components/ThemeToggle';
import { Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { LanguageProvider, useLanguage } from './lib/i18n';

function AppContent() {
  const [currentTool, setCurrentTool] = useState<string>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedLibraryFile, setSelectedLibraryFile] = useState<{name: string, device?: string} | null>(null);
  const { t } = useLanguage();

  const handleAnalyzeFile = (name: string, device?: string) => {
    setSelectedLibraryFile({ name, device });
    setCurrentTool('csv-analysis');
  };

  const renderTool = () => {
    switch (currentTool) {
      case 'calibration':
        return <CalibrationTool />;
      case 'measurement':
        return <MeasurementTool />;
      case 'csv-analysis':
        return <SParamAnalysisTool initialFile={selectedLibraryFile} onFileProcessed={() => setSelectedLibraryFile(null)} />;
      case 'library':
        return <LibraryTool onAnalyze={handleAnalyzeFile} />;
      case 'samm':
        return <SammTool />;
      case 'compact-model':
        return <CompactModelTool />;
      case 'cutoff-freq':
        return <CutoffFreqTool />;
      case 'tline-calc':
        return <TransmissionLineCalculator />;
      case 'cable-impedance':
        return <CableImpedanceTool />;
      case 'sobre':
        return <Sobre />;
      default:
        return <Dashboard onSelectTool={setCurrentTool} />;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex font-sans transition-colors duration-300">
      <Sidebar 
        currentTool={currentTool} 
        onSelectTool={setCurrentTool} 
        isOpen={sidebarOpen} 
        setIsOpen={setSidebarOpen}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <div className="md:hidden h-16 border-b border-border flex items-center px-4 bg-card">
          <button 
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground"
          >
            <Menu className="w-6 h-6" />
          </button>
          <button 
            onClick={() => setCurrentTool('dashboard')}
            className="ml-2 font-semibold hover:text-primary transition-colors"
          >
            {t('app.title')}
          </button>
        </div>

        {/* Main Content */}
        <main className="flex-1">
          {currentTool !== 'dashboard' && (
             <div className="max-w-4xl mx-auto px-6 pt-6">
                <button 
                  onClick={() => setCurrentTool('dashboard')}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center mb-2"
                >
                  {t('back_to_dashboard')}
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
              className="w-full h-full"
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
