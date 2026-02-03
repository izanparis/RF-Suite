import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { CalibrationTool } from './components/tools/CalibrationTool';
import { MeasurementTool } from './components/tools/MeasurementTool';
import { SParamAnalysisTool } from './components/tools/SParamAnalysisTool';
import { SammTool } from './components/tools/SammTool';
import { RlcModelTool } from './components/tools/RlcModelTool';
import { Sobre } from './components/Sobre';
import { ThemeToggle } from './components/ThemeToggle';
import { Menu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [currentTool, setCurrentTool] = useState<string>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderTool = () => {
    switch (currentTool) {
      case 'calibration':
        return <CalibrationTool />;
      case 'measurement':
        return <MeasurementTool />;
      case 'csv-analysis':
        return <SParamAnalysisTool />;
      case 'samm':
        return <SammTool />;
      case 'rlc-model':
        return <RlcModelTool />;
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
            RF Suite
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
                  ← Back to Dashboard
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
