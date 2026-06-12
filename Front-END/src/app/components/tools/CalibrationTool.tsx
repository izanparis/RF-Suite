import React, { useMemo, useState, useEffect } from 'react';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { UnitInput } from '../UnitInput';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { cn } from '../ui/utils';
import { FREQ_UNITS, toBase } from '../../lib/units';
import type { DirectoryHandle } from '../../lib/fsAccess';
import { pickDirectory, saveBase64File } from '../../lib/fsAccess';
import { useLanguage } from '../../lib/i18n';

import { Zap, Info, Ruler, Activity, Check, ArrowRight, Wifi } from 'lucide-react';

interface CalibrationToolProps {
  onBackToDashboard?: () => void;
}

export function CalibrationTool({ onBackToDashboard }: CalibrationToolProps) {
  const { t } = useLanguage();
  // Frecuencias con unidad (UI)
  const [startV, setStartV] = useState('1');
  const [startU, setStartU] = useState('MHz');
  const [stopV, setStopV] = useState('1000');
  const [stopU, setStopU] = useState('MHz');

  const startHz = useMemo(() => toBase(startV, startU, FREQ_UNITS), [startV, startU]);
  const stopHz = useMemo(() => toBase(stopV, stopU, FREQ_UNITS), [stopV, stopU]);

  const [points, setPoints] = useState('401');

  // Dispositivo y Arquitectura
  const [device, setDevice] = useState('NanoVNA-Izan');
  const architecture = architectureOf(device);

  function architectureOf(dev: string) {
    if (dev.includes('HP') || dev.includes('8752')) return 'HP8752A';
    if (dev.includes('E5071C')) return 'E5071C';
    return 'NanoVNA';
  }

  // Salida
  const [calPrefix, setCalPrefix] = useState('medida');
  const [outCal, setOutCal] = useState('');
  const [outDir, setOutDir] = useState<DirectoryHandle | null>(null);
  const [saveToServer, setSaveToServer] = useState(true);

  const [status, setStatus] = useState<'idle' | 'calibrating'>('idle');
  
  // Modos NanoVNA
  const [calType, setCalType] = useState<'oneport' | 'twoport'>('twoport');
  
  // Modos HP 8752A
  const [hpCalMode, setHpCalMode] = useState<'s11' | 'twoport'>('s11');
  const [hpStandardsDone, setHpStandardsDone] = useState<Record<string, boolean>>({});
  const [e5071cStandardsDone, setE5071cStandardsDone] = useState<Record<string, boolean>>({});
  const [nanovnaStandardsDone, setNanovnaStandardsDone] = useState<Record<string, boolean>>({});
  const [nanovnaPlots, setNanovnaPlots] = useState<Record<string, string>>({});
  const [importFilename, setImportFilename] = useState('');

  const [hpImportFile, setHpImportFile] = useState<File | null>(null);

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  // E5071C specific
  const [e5071cCalMode, setE5071cCalMode] = useState<'sol' | 'solt'>('solt');
  const [e5071cPort1, setE5071cPort1] = useState(1);
  const [e5071cPort2, setE5071cPort2] = useState(2);
  const [e5071cIp, setE5071cIp] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rf_e5071c_ip') || '192.168.1.12';
    }
    return '192.168.1.12';
  });

  const [e5071cAveragingCount, setE5071cAveragingCount] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rf_e5071c_averaging_count') || '1';
    }
    return '1';
  });
  const [e5071cSmoothingAperture, setE5071cSmoothingAperture] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rf_e5071c_smoothing_aperture') || '1';
    }
    return '1';
  });
  const [e5071cAveragingEnabled, setE5071cAveragingEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rf_e5071c_averaging_enabled') === 'true';
    }
    return false;
  });
  const [e5071cSmoothingEnabled, setE5071cSmoothingEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rf_e5071c_smoothing_enabled') === 'true';
    }
    return false;
  });
  const [e5071cSweepType, setE5071cSweepType] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rf_e5071c_sweep_type') || 'LIN';
    }
    return 'LIN';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('rf_e5071c_ip', e5071cIp);
    }
  }, [e5071cIp]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('rf_e5071c_averaging_count', e5071cAveragingCount);
    }
  }, [e5071cAveragingCount]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('rf_e5071c_smoothing_aperture', e5071cSmoothingAperture);
    }
  }, [e5071cSmoothingAperture]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('rf_e5071c_averaging_enabled', String(e5071cAveragingEnabled));
    }
  }, [e5071cAveragingEnabled]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('rf_e5071c_smoothing_enabled', String(e5071cSmoothingEnabled));
    }
  }, [e5071cSmoothingEnabled]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('rf_e5071c_sweep_type', e5071cSweepType);
    }
  }, [e5071cSweepType]);

  const toggleAveraging = (enable: boolean) => {
    setE5071cAveragingEnabled(enable);
    if (enable && (e5071cAveragingCount === '1' || !e5071cAveragingCount)) {
      setE5071cAveragingCount('16');
    }
  };

  const toggleSmoothing = (enable: boolean) => {
    setE5071cSmoothingEnabled(enable);
    if (enable && (e5071cSmoothingAperture === '1' || e5071cSmoothingAperture === '0' || !e5071cSmoothingAperture)) {
      setE5071cSmoothingAperture('1.5');
    }
  };

  const calSteps = useMemo(() => {
    if (architecture === 'NanoVNA') {
      return calType === 'oneport' 
        ? ['short', 'open', 'load'] 
        : ['short', 'open', 'load', 'through'];
    } else if (architecture === 'E5071C') {
      if (e5071cCalMode === 'sol') {
        return [`open_p${e5071cPort1}`, `short_p${e5071cPort1}`, `load_p${e5071cPort1}`, 'compute'];
      }
      // SOLT 2-port
      return [
        `open_p${e5071cPort1}`, `short_p${e5071cPort1}`, `load_p${e5071cPort1}`,
        `open_p${e5071cPort2}`, `short_p${e5071cPort2}`, `load_p${e5071cPort2}`,
        `thru_p${e5071cPort1}_p${e5071cPort2}`,
        'compute'
      ];
    } else {
      // HP 8752A - Solo S11 y RAI (twoport)
      if (hpCalMode === 's11') return ['open', 'short', 'load', 'compute'];
      if (hpCalMode === 'twoport') return ['thru', 'isolation', 'compute'];
      return [];
    }
  }, [calType, hpCalMode, architecture, e5071cCalMode, e5071cPort1, e5071cPort2]);

  const getNanovnaBlockDetails = (stepKey: string) => {
    if (stepKey === 'short') {
      return {
        label: 'SHORT',
        stdName: 'Cortocircuito',
        portText: 'Puerto 1'
      };
    }
    if (stepKey === 'open') {
      return {
        label: 'OPEN',
        stdName: 'Circuito Abierto',
        portText: 'Puerto 1'
      };
    }
    if (stepKey === 'load') {
      return {
        label: 'LOAD',
        stdName: 'Carga 50 Ω',
        portText: 'Puerto 1'
      };
    }
    return {
      label: 'THRU',
      stdName: 'Conexión Directa',
      portText: 'Puerto 1 ⇄ Puerto 2'
    };
  };

  const runNanovnaStandard = async (stepKey: string) => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8080/api/vna/calibrate/step?step=${stepKey}&device=${device}`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error(`Error midiendo estándar ${stepKey.toUpperCase()}`);
      
      const data = await res.json();
      
      setNanovnaStandardsDone(prev => ({
        ...prev,
        [stepKey]: true
      }));
      
      if (data.plot) {
        setNanovnaPlots(prev => ({
          ...prev,
          [stepKey]: data.plot
        }));
      }
      
      alert(`Estándar ${stepKey.toUpperCase()} medido con éxito.`);
    } catch (e) {
      alert('Error: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const runNanovnaCompute = async () => {
    setLoading(true);
    try {
      const filename = outCal || generateSuggestedFilename();
      const res = await fetch(`http://localhost:8080/api/vna/calibrate/finish?cal_type=${calType}&save_to_server=${saveToServer}&filename=${encodeURIComponent(filename)}&device=${encodeURIComponent(device)}`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus('idle');
      
      if (data.status === 'success' && data.file_content) {
        if (outDir) {
          await saveBase64File(outDir, filename, data.file_content);
        }
        alert(saveToServer ? t('cal.alert.finish_success') + " (Guardada en servidor)" : t('cal.alert.finish_success'));
      } else {
        alert(t('cal.alert.finish_error') + (data.message || 'Error de finalización.'));
      }
    } catch (e) {
      alert('Error: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const e5071cStandards = useMemo(() => {
    return calSteps.filter(s => s !== 'compute');
  }, [calSteps]);

  const getE5071cBlockDetails = (stepKey: string) => {
    if (stepKey.startsWith('thru_')) {
      const parts = stepKey.split('_p');
      const p1 = parts[1] || '1';
      const p2 = parts[2] || '2';
      return {
        label: 'THRU',
        stdName: 'thru-sma',
        portText: `Puerto_${p1} ⇄ Puerto_${p2}`
      };
    }
    const parts = stepKey.split('_p');
    const type = parts[0].toUpperCase();
    const port = parts[1] || '1';
    const stdName = type === 'OPEN' ? 'open-sma' : type === 'SHORT' ? 'short-sma' : 'load50ohm-sma';
    return {
      label: type,
      stdName: stdName,
      portText: `Puerto_${port}`
    };
  };

  const runE5071cStandard = async (stepKey: string) => {
    setLoading(true);
    try {
      let standard = '';
      let port = e5071cPort1;
      let port2 = e5071cPort2;

      if (stepKey.startsWith('thru_')) {
        standard = 'thru';
        const parts = stepKey.split('_p');
        if (parts.length >= 3) {
          port = parseInt(parts[1]) || e5071cPort1;
          port2 = parseInt(parts[2]) || e5071cPort2;
        }
      } else {
        const parts = stepKey.split('_p');
        standard = parts[0]; // open, short, load
        port = parseInt(parts[1]) || e5071cPort1;
      }

      const res = await fetch('http://localhost:8080/api/vna/e5071c/calibrate/measure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ standard, port, port2, device })
      });
      if (!res.ok) throw new Error(`Error midiendo ${standard.toUpperCase()}`);

      // Mark standard as done
      setE5071cStandardsDone(prev => ({
        ...prev,
        [stepKey]: true
      }));
      alert(`Estándar ${standard.toUpperCase()} medido en puerto ${port} con éxito.`);
    } catch (e) {
      alert('Error: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  const runE5071cCompute = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8080/api/vna/e5071c/calibrate/compute?device=${device}`, { method: 'POST' });
      if (!res.ok) throw new Error('Error calculando coeficientes');

      // Auto-export after compute
      const filename = outCal || generateSuggestedFilename();
      const exportRes = await fetch(`http://localhost:8080/api/vna/e5071c/export?filename=${encodeURIComponent(filename)}&device=${encodeURIComponent(device)}&save_to_server=${saveToServer}`);
      if (exportRes.ok) {
        const data = await exportRes.json();
        if (data.status === 'success' && data.file_content && outDir) {
          await saveBase64File(outDir, filename, data.file_content);
        }
      }
      alert(saveToServer ? 'Calibración E5071C completada y guardada en servidor y carpeta local.' : 'Calibración E5071C completada.');
      setStatus('idle');
    } catch (e) {
      alert('Error: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  };

  // Generate suggested filename: cal_IDCAL_dispositivo_fmin_fmax_npuntos
  const generateSuggestedFilename = () => {
    const fmin = startHz !== null ? (startHz / 1e6).toFixed(0) : '0';
    const fmax = stopHz !== null ? (stopHz / 1e6).toFixed(0) : '0';
    
    if (architecture === 'HP8752A') {
      return `cal_${calPrefix}_hp8752a_${fmin}_${fmax}_${points}.json`;
    }
    if (architecture === 'E5071C') {
      return `cal_${calPrefix}_e5071c_${fmin}_${fmax}_${points}.json`;
    }
    
    // Formato solicitado: cal_IDCAL_dispositivo_fmin_fmax_npuntos
    return `cal_${calPrefix}_${device}_${fmin}_${fmax}_${points}.cal`;
  };



  const getStepInstruction = (idx: number) => {
    const step = calSteps[idx];
    if (!step) return "";
    if (step === 'short') return t('cal.step.instr_short');
    if (step === 'open') return t('cal.step.instr_open');
    if (step === 'load') return t('cal.step.instr_load');
    if (step === 'isolation') return t('cal.step.instr_iso');
    if (step === 'through' || step === 'thru') return t('cal.step.instr_thru');
    if (step === 'compute') return "Calculando coeficientes finales...";
    // E5071C steps
    if (step.startsWith('open_p')) return `Conecte OPEN (open-sma) en Puerto ${step.split('p')[1]}`;
    if (step.startsWith('short_p')) return `Conecte SHORT (short-sma) en Puerto ${step.split('p')[1]}`;
    if (step.startsWith('load_p')) return `Conecte LOAD (load50ohm-sma) en Puerto ${step.split('p')[1]}`;
    if (step.startsWith('thru_p')) return `Conecte THRU entre Puerto ${e5071cPort1} y Puerto ${e5071cPort2}`;
    return "";
  };

  const runHpStandard = async (std: 'open' | 'short' | 'load' | 'thru' | 'isolation') => {
    setLoading(true);
    try {
      let hp_cmd = "";
      if (hpCalMode === 'twoport') {
        // Lógica específica Response & Isolation (según requerimiento de usuario)
        if (std === 'thru') hp_cmd = "RAIRESP; STANE;";
        if (std === 'isolation') hp_cmd = "RAIISOL; STANA;";
      } else {
        if (std === 'open') hp_cmd = "REFL; CLASS11A; STANA; REFD;";
        if (std === 'short') hp_cmd = "REFL; CLASS11B; STANA; REFD;";
        if (std === 'load') hp_cmd = "REFL; CLASS11C; STANA; REFD;";
        if (std === 'thru') hp_cmd = "TRAN; THRU; TRAD;";
        if (std === 'isolation') hp_cmd = "ISOL; OMII; ISOD;";
      }

      const res = await fetch('http://localhost:8080/api/vna/hp/calibrate/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cal_type: hpCalMode, step_cmd: hp_cmd, device })
      });
      if (!res.ok) throw new Error("Error midiendo estándar");
      
      setHpStandardsDone(prev => ({ ...prev, [std]: true }));
    } catch (e) {
      alert("Error: " + e);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string) => {
    if (id === 'abort') {
      setStatus('idle');
      alert("Calibración abortada. Se ha vuelto al modo de configuración.");
      return;
    }

    if (id === 'connect') {
      setLoading(true);
      try {
        const res = await fetch(`http://localhost:8080/api/vna/connect?device=${device}`);
        const data = await res.json();
        if (data.connected) {
          alert(t('cal.alert.connect_success'));
        } else {
          alert(t('cal.alert.connect_error') + data.error + '\n\n' + t('cal.alert.connect_help'));
        }
      } catch (e) {
        alert(t('cal.alert.backend_error'));
      } finally {
        setLoading(false);
      }
    }

    if (id === 'save_folder') {
      try {
        const handle = await pickDirectory();
        if (handle) {
          setOutDir(handle);
          if (!outCal) {
            setOutCal(generateSuggestedFilename());
          }
        }
      } catch (e) {
        console.error("User cancelled or error picking directory", e);
      }
    }

    if (id === 'reset') {
      setLoading(true);
      try {
        if (architecture === 'E5071C') {
          await fetch(`http://localhost:8080/api/vna/e5071c/reset?device=${device}`, { method: 'POST' });
        } else {
          await fetch('http://localhost:8080/api/vna/hp/calibrate/step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cal_type: 'none', step_cmd: 'PRES', device })
          });
        }
        setStatus('idle');
        setHpStandardsDone({ open: false, short: false, load: false, thru: false });
        alert("VNA Reiniciado (Preset enviado).");
      } catch (e) {
        alert("Error al reiniciar VNA");
      } finally {
        setLoading(false);
      }
    }

    if (id === 'start') {
      if (startHz === null || stopHz === null) {
        alert(t('alert.freq_error'));
        return;
      }
      
      const parsePointsValue = (val: string): number => {
        const clean = String(val).toLowerCase().trim();
        if (clean.endsWith('k')) {
          const num = parseFloat(clean.replace('k', ''));
          return isNaN(num) ? 201 : Math.round(num * 1000);
        }
        const parsed = parseInt(clean);
        return isNaN(parsed) ? 201 : parsed;
      };
      let pts = parsePointsValue(points);
      if (architecture === 'NanoVNA' && pts > 1024) {
        alert("El dispositivo tiene un límite de hardware de 1024 puntos. Se ajustará el valor automáticamente.");
        setPoints('1024');
        pts = 1024;
      }

      setLoading(true);
      try {
        const payload = {
          start_mhz: startHz / 1e6,
          stop_mhz: stopHz / 1e6,
          points: pts
        };

        if (architecture === 'E5071C') {
          // 1. Enviar primero la configuración de averaging y smoothing nativos al VNA
          const avgCount = parseInt(e5071cAveragingCount) || 1;
          const smoAper = parseFloat(e5071cSmoothingAperture) || 0.0;
          try {
            await fetch('http://localhost:8080/api/vna/e5071c/setup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                averaging_enabled: e5071cAveragingEnabled,
                averaging_count: Math.max(1, avgCount),
                smoothing_enabled: e5071cSmoothingEnabled,
                smoothing_aperture: Math.max(0.05, smoAper),
                sweep_type: e5071cSweepType,
                device: "VNA-E5071C",
                ip_address: e5071cIp
              })
            });
          } catch (err) {
            console.error("Error setting up VNA DSP parameters:", err);
          }

          // 2. E5071C: usar endpoint específico de calibración
          const calPayload = {
            ...payload,
            cal_type: e5071cCalMode,
            port1: e5071cPort1,
            port2: e5071cPort2,
            device,
            ip_address: e5071cIp
          };
          const res = await fetch('http://localhost:8080/api/vna/e5071c/calibrate/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(calPayload)
          });
          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.detail || 'Error al iniciar calibración E5071C');
          }
          if (e5071cCalMode === 'sol') {
            setE5071cStandardsDone({
              [`open_p${e5071cPort1}`]: false,
              [`short_p${e5071cPort1}`]: false,
              [`load_p${e5071cPort1}`]: false,
            });
          } else {
            setE5071cStandardsDone({
              [`open_p${e5071cPort1}`]: false,
              [`short_p${e5071cPort1}`]: false,
              [`load_p${e5071cPort1}`]: false,
              [`open_p${e5071cPort2}`]: false,
              [`short_p${e5071cPort2}`]: false,
              [`load_p${e5071cPort2}`]: false,
              [`thru_p${e5071cPort1}_p${e5071cPort2}`]: false,
            });
          }
          setStatus('calibrating');
          setCurrentStepIdx(0);
          alert('Calibración E5071C iniciada. Usa los bloques para medir en cualquier orden.');
        } else {
          const res = await fetch(`http://localhost:8080/api/vna/calibrate/start?device=${device}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.detail || 'Error al iniciar sweep');
          }

          if (architecture === 'NanoVNA') {
            setNanovnaStandardsDone({
              short: false,
              open: false,
              load: false,
              ...(calType === 'twoport' ? { through: false } : {})
            });
            setNanovnaPlots({});
          }

          // Si es HP, inicializamos el comando de cal
          if (architecture === 'HP8752A') {
            if (hpCalMode === 'twoport') {
              setHpStandardsDone({ thru: false, isolation: false });
            } else {
              setHpStandardsDone({ open: false, short: false, load: false, thru: false });
            }
            
            // El usuario indica que para RAI hay que poner el VNA en S21 primero
            const cal_cmd = hpCalMode === 's11' ? 'CALIS111' : (hpCalMode === 'twoport' ? 'S21; CALIRAI' : 'CALIRISO');
            
            await fetch('http://localhost:8080/api/vna/hp/calibrate/step', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cal_type: hpCalMode, step_cmd: cal_cmd, device })
            });
          }

          setStatus('calibrating');
          setCurrentStepIdx(0);
          alert(t('cal.alert.start_success'));
        }
      } catch (e) {
        alert('Error: ' + (e instanceof Error ? e.message : String(e)));
      } finally {
        setLoading(false);
      }
    }
  };

  const runStep = async () => {
    const step = calSteps[currentStepIdx];
    setLoading(true);
    try {
      if (architecture === 'E5071C') {
        // E5071C calibration step
        if (step === 'compute') {
          const res = await fetch(`http://localhost:8080/api/vna/e5071c/calibrate/compute?device=${device}`, { method: 'POST' });
          if (!res.ok) throw new Error('Error calculando coeficientes');
          
          // Auto-export after compute
          const filename = outCal || generateSuggestedFilename();
          const exportRes = await fetch(`http://localhost:8080/api/vna/e5071c/export?filename=${encodeURIComponent(filename)}&device=${encodeURIComponent(device)}&save_to_server=${saveToServer}`);
          if (exportRes.ok) {
            const data = await exportRes.json();
            if (data.status === 'success' && data.file_content && outDir) {
              await saveBase64File(outDir, filename, data.file_content);
            }
          }
          alert(saveToServer ? 'Calibración E5071C completada y guardada.' : 'Calibración E5071C completada.');
          setStatus('idle');
          return;
        } else {
          // Parse step: open_p1, short_p2, thru_p1_p2, etc.
          let standard = '';
          let port = e5071cPort1;
          let port2 = e5071cPort2;

          if (step.startsWith('thru_')) {
            standard = 'thru';
            const parts = step.split('_p');
            if (parts.length >= 3) {
              port = parseInt(parts[1]) || e5071cPort1;
              port2 = parseInt(parts[2]) || e5071cPort2;
            }
          } else {
            const parts = step.split('_p');
            standard = parts[0]; // open, short, load
            port = parseInt(parts[1]) || e5071cPort1;
          }

          const res = await fetch('http://localhost:8080/api/vna/e5071c/calibrate/measure', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ standard, port, port2, device })
          });
          if (!res.ok) throw new Error(`Error midiendo ${standard.toUpperCase()}`);

          if (currentStepIdx < calSteps.length - 1) {
            setCurrentStepIdx(prev => prev + 1);
          }
          return;
        }
      } else if (architecture === 'NanoVNA') {
        const res = await fetch(`http://localhost:8080/api/vna/calibrate/step?step=${step}&device=${device}`, {
          method: 'POST'
        });
        if (!res.ok) throw new Error(t('cal.alert.step_error', step));
      } else {
        // HP 8752A Steps (Sequential flow for S11/Isolation)
        let hp_cmd = "";
        
        if (step === 'compute') {
           hp_cmd = "DONE";
        } else if (hpCalMode === 's11') {
           if (step === 'open') hp_cmd = "CLASS11A; STANA";
           if (step === 'short') hp_cmd = "CLASS11B; STANA";
           if (step === 'load') hp_cmd = "CLASS11C; STANA";
        } else if (hpCalMode === 'isolation') {
           if (step === 'open') hp_cmd = "REFL; CLASS11A; STANA; REFD;";
           if (step === 'short') hp_cmd = "REFL; CLASS11B; STANA; REFD;";
           if (step === 'load') hp_cmd = "REFL; CLASS11C; STANA; REFD;";
           if (step === 'thru') hp_cmd = "TRAN; THRU; TRAD;";
           if (step === 'isolation') hp_cmd = "ISOL; OMII; ISOD;";
        }

        if (hp_cmd) {
          const res = await fetch('http://localhost:8080/api/vna/hp/calibrate/step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cal_type: hpCalMode, step_cmd: hp_cmd, device })
          });
          if (!res.ok) throw new Error("Error en paso HP");
        }
      }
      
      if (currentStepIdx < calSteps.length - 1 && hpCalMode !== 'twoport') {
        setCurrentStepIdx(prev => prev + 1);
      } else {
        // Finalize
        try {
          if (architecture === 'HP8752A') {
             // Finalizamos el cálculo en el VNA (Sincronizado vía Backend con OPC?)
             const done_cmd = hpCalMode === 'twoport' ? 'RAID' : 'DONE';
             await fetch('http://localhost:8080/api/vna/hp/calibrate/step', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cal_type: hpCalMode, step_cmd: done_cmd, device })
             });

             // Guardamos en el registro activo
             await fetch('http://localhost:8080/api/vna/hp/calibrate/step', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cal_type: hpCalMode, step_cmd: "SAVC", device })
             });

             // Exportar automáticamente
             const filename = outCal || generateSuggestedFilename();
             const res = await fetch(`http://localhost:8080/api/vna/hp/export?filename=${encodeURIComponent(filename)}&device=${encodeURIComponent(device)}&save_to_server=${saveToServer}`);
             if (!res.ok) throw new Error("Error al exportar calibración del HP");
             
             const data = await res.json();
             if (data.status === 'success' && data.file_content) {
                if (outDir) {
                   await saveBase64File(outDir, filename, data.file_content);
                }
                alert(saveToServer ? t('cal.alert.finish_success') + " (Guardada en servidor y VNA)" : t('cal.alert.finish_success'));
             }
             
             setStatus('idle');
          } else {
            const filename = outCal || generateSuggestedFilename();
            const res = await fetch(`http://localhost:8080/api/vna/calibrate/finish?cal_type=${calType}&save_to_server=${saveToServer}&filename=${encodeURIComponent(filename)}&device=${encodeURIComponent(device)}`, { method: 'POST' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setStatus('idle');
            
            if (data.status === 'success' && data.file_content) {
              if (outDir) {
                await saveBase64File(outDir, filename, data.file_content);
              }
              alert(saveToServer ? t('cal.alert.finish_success') + " (Guardada en servidor)" : t('cal.alert.finish_success'));
            } else {
              alert(t('cal.alert.finish_error') + (data.message || 'Error desconocido del servidor.'));
            }
          }
        } catch (e) {
          console.error(e);
          alert(t('cal.alert.finish_error') + (e instanceof Error ? e.message : String(e)));
        }
      }
    } catch (e) {
      alert('Error: ' + e);
    } finally {
      setLoading(false);
    }
  };

  const handleHpExport = async () => {
    setLoading(true);
    try {
      const name = prompt("Nombre para guardar la calibración (.json):", generateSuggestedFilename());
      if (!name) return;
      const url = architecture === 'E5071C'
        ? `http://localhost:8080/api/vna/e5071c/export?filename=${encodeURIComponent(name)}&device=${device}`
        : `http://localhost:8080/api/vna/hp/export?filename=${encodeURIComponent(name)}&device=${device}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'success') alert(data.message);
      else throw new Error(data.detail || data.message);
    } catch (e) {
      alert("Error al exportar: " + e);
    } finally {
      setLoading(false);
    }
  };

  const handleHpImport = async () => {
    setLoading(true);
    try {
      if (hpImportFile) {
        // Importación desde archivo local (.json)
        const formData = new FormData();
        formData.append('file', hpImportFile);
        formData.append('device', device);
        const url = architecture === 'E5071C'
          ? 'http://localhost:8080/api/vna/e5071c/import_file'
          : 'http://localhost:8080/api/vna/hp/import_file';
        const res = await fetch(url, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.status === 'success') {
          alert(data.message);
          setHpImportFile(null);
        } else throw new Error(data.detail || data.message);
      } else if (importFilename) {
        // Importación desde Biblioteca (Servidor)
        const url = architecture === 'E5071C'
          ? 'http://localhost:8080/api/vna/e5071c/import'
          : 'http://localhost:8080/api/vna/hp/import';
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: importFilename, device })
        });
        const data = await res.json();
        if (data.status === 'success') alert(data.message);
        else throw new Error(data.detail || data.message);
      } else {
        alert("Selecciona un archivo local o introduce el nombre de uno en la biblioteca.");
      }
    } catch (e) {
      alert("Error al importar: " + e);
    } finally {
      setLoading(false);
    }
  };

  const [selectionMade, setSelectionMade] = useState(false);

  if (!selectionMade) {
    return (
      <div className="mx-auto max-w-[820px] px-5 pb-4 pt-5">
        <div className="mb-3 rounded-lg border border-border bg-[var(--rf-panel)] p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">{t('cal.title')}</h2>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
                Elige el equipo de trabajo y prepara el flujo de calibracion antes de conectar con el VNA.
              </p>
            </div>
            <button
              onClick={onBackToDashboard}
              className="rounded-md border border-primary/30 bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Volver al Dashboard
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[0.72fr_1.28fr]">
          <Card className="border-border/70 bg-[var(--rf-panel-soft)]">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm">Antes de empezar</CardTitle>
              <CardDescription className="text-xs">Resumen rapido para elegir arquitectura.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 text-sm">
              {[
                ['NanoVNA', 'SOLT compacto, portatil y hasta 1024 puntos.'],
                ['HP 8752A', 'GPIB con modos S11, respuesta y aislamiento.'],
                ['Preparacion', 'Conecta estandares, define rango y guarda salida.'],
                ['Salida', 'Biblioteca local/servidor y exportacion posterior.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-md border border-border bg-card p-2">
                  <div className="text-sm font-semibold text-foreground">{title}</div>
                  <div className="mt-0.5 text-xs leading-4 text-muted-foreground">{body}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card
              className="group relative flex min-h-[198px] cursor-pointer flex-col justify-center overflow-hidden border-2 transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:shadow-md"
              onClick={() => {
                setDevice('NanoVNA-Izan');
                setSelectionMade(true);
              }}
            >
              <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20">
                <Activity size={72} />
              </div>
              <CardContent className="flex flex-col items-center space-y-2.5 p-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 transition-transform group-hover:scale-110">
                  <Activity className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold uppercase tracking-tight">NanoVNA</h3>
                  <p className="mt-1 max-w-[210px] text-xs text-muted-foreground">
                    Arquitectura compacta para NanoVNA-H, H4, V2 y variantes.
                  </p>
                </div>
                <div className="grid w-full grid-cols-2 gap-1.5 text-left text-[11px] text-muted-foreground">
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">SOLT 1/2 puertos</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">1024 pts</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">Portatil</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">USB/local</span>
                </div>
                <div className="flex w-full items-center justify-between rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                  Seleccionar NanoVNA
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </CardContent>
            </Card>

            <Card
              className="group relative flex min-h-[198px] cursor-pointer flex-col justify-center overflow-hidden border-2 transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:shadow-md"
              onClick={() => {
                setDevice('VNA-HP-8752A');
                setSelectionMade(true);
              }}
            >
              <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20">
                <Zap size={72} />
              </div>
              <CardContent className="flex flex-col items-center space-y-2.5 p-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 transition-transform group-hover:scale-110">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold uppercase tracking-tight">HP 8752A</h3>
                  <p className="mt-1 max-w-[210px] text-xs text-muted-foreground">
                    Equipo legacy profesional con control via GPIB para laboratorio.
                  </p>
                </div>
                <div className="grid w-full grid-cols-2 gap-1.5 text-left text-[11px] text-muted-foreground">
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">S11 / 2P</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">GPIB</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">SAVC</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">Biblioteca</span>
                </div>
                <div className="flex w-full items-center justify-between rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                  Seleccionar HP 8752A
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </CardContent>
            </Card>

            <Card
              className="group relative flex min-h-[198px] cursor-pointer flex-col justify-center overflow-hidden border-2 transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:shadow-md"
              onClick={() => {
                setDevice('VNA-E5071C');
                setSelectionMade(true);
              }}
            >
              <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20">
                <Wifi size={72} />
              </div>
              <CardContent className="flex flex-col items-center space-y-2.5 p-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 transition-transform group-hover:scale-110">
                  <Wifi className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold uppercase tracking-tight">Agilent E5071C</h3>
                  <p className="mt-1 max-w-[210px] text-xs text-muted-foreground">
                    ENA de alta prestaciones con SOLT completo via TCP/IP.
                  </p>
                </div>
                <div className="grid w-full grid-cols-2 gap-1.5 text-left text-[11px] text-muted-foreground">
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">SOLT Full</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">20001 pts</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">TCP/IP (LAN)</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">8.5 GHz</span>
                </div>
                <div className="flex w-full items-center justify-between rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
                  Seleccionar E5071C
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }
  return (
    <ToolShell
      title={t('cal.title')}
      description={t('cal.desc')}
      actions={[
        ...(status !== 'calibrating' ? [
          { id: 'change_device', label: 'Cambiar Equipo', variant: 'ghost' as const },
          { id: 'connect', label: t('cal.action.connect'), variant: 'secondary' as const },
          { id: 'start', label: t('cal.action.start'), variant: 'default' as const },
          { id: 'save_folder', label: t('cal.action.save_folder'), variant: 'outline' as const },
        ] : [
          { id: 'abort', label: 'Abortar Calibración', variant: 'destructive' as const }
        ]),
        ...(architecture !== 'NanoVNA' && status !== 'calibrating' ? [{ id: 'reset', label: 'RESET VNA', variant: 'destructive' as const }] : []),
      ]}
      onAction={(id) => {
        if (id === 'change_device') setSelectionMade(false);
        else handleAction(id);
      }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{t('cal.config.title')}</CardTitle>
                  <CardDescription>{t('cal.config.desc')}</CardDescription>
                </div>
                <div className="flex items-center gap-2 bg-muted/50 px-3 py-1 rounded-full border border-border">
                  <div className={cn("w-2 h-2 rounded-full animate-pulse", architecture === 'NanoVNA' ? "bg-blue-500" : "bg-orange-500")} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">{architecture}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {architecture === 'NanoVNA' ? (
                  <div className="space-y-2">
                    <Label>{t('cal.config.type')}</Label>
                    <Select 
                      value={calType} 
                      onValueChange={(val: any) => setCalType(val)}
                      disabled={status === 'calibrating'}
                    >
                      <SelectTrigger className="bg-input-background">
                        <SelectValue placeholder={t('cal.config.type')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="oneport">{t('cal.config.one_port')}</SelectItem>
                        <SelectItem value="twoport">{t('cal.config.two_port')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : architecture === 'E5071C' ? (
                  <div className="space-y-2">
                    <Label>Modo de Calibración</Label>
                    <Select 
                      value={e5071cCalMode} 
                      onValueChange={(val: any) => setE5071cCalMode(val)}
                      disabled={status === 'calibrating'}
                    >
                      <SelectTrigger className="bg-input-background">
                        <SelectValue placeholder="Seleccionar modo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sol">SOL – 1 Puerto</SelectItem>
                        <SelectItem value="solt">SOLT – 2 Puertos (Full)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Modo de Calibración</Label>
                    <Select 
                      value={hpCalMode} 
                      onValueChange={(val: any) => setHpCalMode(val)}
                      disabled={status === 'calibrating'}
                    >
                      <SelectTrigger className="bg-input-background">
                        <SelectValue placeholder="Seleccionar modo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="s11">1-Port (S11)</SelectItem>
                        <SelectItem value="twoport">Response & Isolation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}


                <div className="space-y-2">
                  <Label>Dispositivo</Label>
                  <Select 
                    value={device} 
                    onValueChange={(val: string) => setDevice(val)}
                    disabled={status === 'calibrating'}
                  >
                    <SelectTrigger className="bg-input-background">
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {architecture === 'NanoVNA' ? (
                        <>
                          <SelectItem value="NanoVNA-Izan">NanoVNA-Izan</SelectItem>
                          <SelectItem value="NanoVNA-LAB1">NanoVNA-LAB1</SelectItem>
                          <SelectItem value="NanoVNA-LAB2">NanoVNA-LAB2</SelectItem>
                        </>
                      ) : architecture === 'E5071C' ? (
                        <SelectItem value="VNA-E5071C">VNA-E5071C (TCP/IP)</SelectItem>
                      ) : (
                        <SelectItem value="VNA-HP-8752A">VNA-HP-8752A (GPIB)</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Identificador de Calibración</Label>
                  <Input 
                    value={calPrefix}
                    onChange={(e) => setCalPrefix(e.target.value)}
                    placeholder="Ej: cable_azul"
                    disabled={status === 'calibrating'}
                    className="bg-input-background"
                  />
                </div>
                
                <UnitInput
                  label={t('cal.config.start')}
                  value={startV}
                  unit={startU}
                  units={FREQ_UNITS}
                  onChangeValue={setStartV}
                  onChangeUnit={setStartU}
                  placeholder="1"
                  disabled={status === 'calibrating'}
                />
                <UnitInput
                  label={t('cal.config.stop')}
                  value={stopV}
                  unit={stopU}
                  units={FREQ_UNITS}
                  onChangeValue={setStopV}
                  onChangeUnit={setStopU}
                  placeholder="1000"
                  disabled={status === 'calibrating'}
                />
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label>{t('cal.config.points')}</Label>
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <Input
                      className="col-span-8 bg-input-background"
                      value={points}
                      onChange={(e) => setPoints(e.target.value)}
                      placeholder="401"
                      inputMode="numeric"
                      disabled={status === 'calibrating'}
                    />
                    <div className="col-span-4 h-9 w-full rounded-md border border-input bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Pts
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-8">
                  <Checkbox 
                    id="save_server" 
                    checked={saveToServer} 
                    onCheckedChange={(checked) => setSaveToServer(!!checked)}
                    disabled={status === 'calibrating'}
                  />
                  <Label htmlFor="save_server" className="cursor-pointer text-sm">Guardar automáticamente en servidor</Label>
                </div>

                {architecture === 'E5071C' && (
                  <>
                    <div className="space-y-2">
                      <Label>Dirección IP</Label>
                      <Input
                        value={e5071cIp}
                        onChange={(e) => setE5071cIp(e.target.value)}
                        placeholder="192.168.1.12"
                        disabled={status === 'calibrating'}
                        className="bg-input-background font-mono"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Averaging</Label>
                          <div className="flex rounded-md bg-muted/50 p-0.5 border border-border scale-90 origin-right">
                            <button
                              type="button"
                              disabled={status === 'calibrating'}
                              onClick={() => toggleAveraging(false)}
                              className={cn(
                                "rounded px-2 py-0.5 text-[10px] font-medium transition-all disabled:opacity-50",
                                !e5071cAveragingEnabled ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              OFF
                            </button>
                            <button
                              type="button"
                              disabled={status === 'calibrating'}
                              onClick={() => toggleAveraging(true)}
                              className={cn(
                                "rounded px-2 py-0.5 text-[10px] font-medium transition-all disabled:opacity-50",
                                e5071cAveragingEnabled ? "bg-primary text-primary-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              ON
                            </button>
                          </div>
                        </div>
                        <Input
                          className="bg-input-background h-8 text-sm disabled:opacity-40"
                          type="number"
                          min={1}
                          max={999}
                          value={e5071cAveragingCount}
                          onChange={(e) => setE5071cAveragingCount(e.target.value)}
                          disabled={status === 'calibrating' || !e5071cAveragingEnabled}
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">Smoothing (%)</Label>
                          <div className="flex rounded-md bg-muted/50 p-0.5 border border-border scale-90 origin-right">
                            <button
                              type="button"
                              disabled={status === 'calibrating'}
                              onClick={() => toggleSmoothing(false)}
                              className={cn(
                                "rounded px-2 py-0.5 text-[10px] font-medium transition-all disabled:opacity-50",
                                !e5071cSmoothingEnabled ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              OFF
                            </button>
                            <button
                              type="button"
                              disabled={status === 'calibrating'}
                              onClick={() => toggleSmoothing(true)}
                              className={cn(
                                "rounded px-2 py-0.5 text-[10px] font-medium transition-all disabled:opacity-50",
                                e5071cSmoothingEnabled ? "bg-primary text-primary-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              ON
                            </button>
                          </div>
                        </div>
                        <Input
                          className="bg-input-background h-8 text-sm disabled:opacity-40"
                          type="number"
                          min={0.05}
                          max={25}
                          step={0.5}
                          value={e5071cSmoothingAperture}
                          onChange={(e) => setE5071cSmoothingAperture(e.target.value)}
                          disabled={status === 'calibrating' || !e5071cSmoothingEnabled}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Tipo de Barrido</Label>
                      <Select 
                        value={e5071cSweepType} 
                        onValueChange={setE5071cSweepType}
                        disabled={status === 'calibrating'}
                      >
                        <SelectTrigger className="bg-input-background h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LIN">Lineal</SelectItem>
                          <SelectItem value="LOG">Logarítmico</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {e5071cCalMode === 'solt' && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Puerto 1</Label>
                          <Select value={String(e5071cPort1)} onValueChange={(v) => setE5071cPort1(parseInt(v))} disabled={status === 'calibrating'}>
                            <SelectTrigger className="bg-input-background"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {[1,2,3,4].filter(p => p !== e5071cPort2).map(p => (
                                <SelectItem key={p} value={String(p)}>Puerto {p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Puerto 2</Label>
                          <Select value={String(e5071cPort2)} onValueChange={(v) => setE5071cPort2(parseInt(v))} disabled={status === 'calibrating'}>
                            <SelectTrigger className="bg-input-background"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {[1,2,3,4].filter(p => p !== e5071cPort1).map(p => (
                                <SelectItem key={p} value={String(p)}>Puerto {p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                    {e5071cCalMode === 'sol' && (
                      <div className="space-y-2">
                        <Label>Puerto de calibración</Label>
                        <Select value={String(e5071cPort1)} onValueChange={(v) => setE5071cPort1(parseInt(v))} disabled={status === 'calibrating'}>
                          <SelectTrigger className="bg-input-background"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[1,2,3,4].map(p => (
                              <SelectItem key={p} value={String(p)}>Puerto {p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {status === 'calibrating' && (
            <Card className="border-primary/50 bg-primary/5">
              <CardHeader>
                <CardTitle>
                  {architecture === 'HP8752A' && hpCalMode === 'twoport' 
                    ? "Medición de Estándares (2-Ports)" 
                    : t('cal.step.title', currentStepIdx + 1, calSteps.length)}
                </CardTitle>
                <CardDescription>
                  {architecture === 'HP8752A' && hpCalMode === 'twoport'
                    ? "Mide los estándares en cualquier orden. Una vez completados, pulsa COMPUTING."
                    : t('cal.step.desc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                
                {architecture === 'HP8752A' && hpCalMode === 'twoport' ? (
                  /* UI NO SECUENCIAL PARA 2-PORTS */
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { id: 'thru', label: 'THRU' },
                        { id: 'isolation', label: 'ISOLATION' }
                      ].map((std) => (
                        <Button
                          key={std.id}
                          variant={hpStandardsDone[std.id as keyof typeof hpStandardsDone] ? "secondary" : "outline"}
                          className={cn(
                            "h-20 flex flex-col gap-2 relative overflow-hidden",
                            hpStandardsDone[std.id as keyof typeof hpStandardsDone] && "border-green-500/50 bg-green-500/5"
                          )}
                          onClick={() => runHpStandard(std.id as any)}
                          disabled={loading}
                        >
                          {hpStandardsDone[std.id as keyof typeof hpStandardsDone] && (
                            <Check className="w-4 h-4 text-green-500 absolute top-2 right-2" />
                          )}
                          <span className="font-bold tracking-widest">{std.label}</span>
                          <span className="text-[10px] opacity-70">Pulsar para medir</span>
                        </Button>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-border">
                      <Button
                        className="w-full h-12 text-lg font-bold"
                        variant={Object.values(hpStandardsDone).every(v => v) ? "default" : "ghost"}
                        disabled={loading || !Object.values(hpStandardsDone).every(v => v)}
                        onClick={async () => {
                          // Trigger artificial compute step
                          setCurrentStepIdx(calSteps.length - 1);
                          await runStep();
                        }}
                      >
                        {loading ? "Calculando..." : "COMPUTING & FINISH"}
                      </Button>
                      {!Object.values(hpStandardsDone).every(v => v) && (
                        <p className="text-[10px] text-center text-muted-foreground mt-2 italic">
                          Mide todos los estándares para habilitar el cálculo de coeficientes.
                        </p>
                      )}
                    </div>
                  </div>
                ) : architecture === 'E5071C' ? (
                  /* UI NO SECUENCIAL (BLOQUES) PARA E5071C */
                  <div className="space-y-6">
                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-primary/80 flex flex-wrap justify-between items-center gap-2">
                      <div>
                        <strong>Modo:</strong> {e5071cCalMode.toUpperCase()} ({e5071cCalMode === 'sol' ? '1 Puerto' : '2 Puertos'})
                      </div>
                      <div>
                        <strong>Averaging:</strong> {e5071cAveragingEnabled ? `ON (${e5071cAveragingCount})` : 'OFF'}
                      </div>
                      <div>
                        <strong>Smoothing:</strong> {e5071cSmoothingEnabled ? `ON (${e5071cSmoothingAperture}%)` : 'OFF'}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {e5071cCalMode === 'sol' ? (
                        <div className="space-y-2">
                          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Estándares Puerto {e5071cPort1}</div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {e5071cStandards.map((stepKey) => {
                              const details = getE5071cBlockDetails(stepKey);
                              const isDone = !!e5071cStandardsDone[stepKey];
                              return (
                                <Button
                                  key={stepKey}
                                  type="button"
                                  variant={isDone ? "secondary" : "outline"}
                                  disabled={loading}
                                  onClick={() => runE5071cStandard(stepKey)}
                                  className={cn(
                                    "h-20 flex flex-col gap-1.5 relative overflow-hidden transition-all duration-200 border-2",
                                    isDone ? "border-green-500/50 bg-green-500/5 hover:bg-green-500/10 text-foreground" : "border-border hover:border-primary/50"
                                  )}
                                >
                                  {isDone && (
                                    <Check className="w-4 h-4 text-green-600 absolute top-2 right-2" />
                                  )}
                                  <span className="font-bold tracking-widest text-sm text-primary">{details.label}</span>
                                  <span className="text-[10px] text-muted-foreground font-semibold">{details.stdName}</span>
                                  <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full font-mono">{details.portText}</span>
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-5">
                          {/* Puerto 1 */}
                          <div className="space-y-2">
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Estándares Puerto {e5071cPort1}</div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {e5071cStandards
                                .filter(s => s.endsWith(`_p${e5071cPort1}`) && !s.startsWith('thru_'))
                                .map((stepKey) => {
                                  const details = getE5071cBlockDetails(stepKey);
                                  const isDone = !!e5071cStandardsDone[stepKey];
                                  return (
                                    <Button
                                      key={stepKey}
                                      type="button"
                                      variant={isDone ? "secondary" : "outline"}
                                      disabled={loading}
                                      onClick={() => runE5071cStandard(stepKey)}
                                      className={cn(
                                        "h-20 flex flex-col gap-1.5 relative overflow-hidden transition-all duration-200 border-2",
                                        isDone ? "border-green-500/50 bg-green-500/5 hover:bg-green-500/10 text-foreground" : "border-border hover:border-primary/50"
                                      )}
                                    >
                                      {isDone && (
                                        <Check className="w-4 h-4 text-green-600 absolute top-2 right-2" />
                                      )}
                                      <span className="font-bold tracking-widest text-sm text-primary">{details.label}</span>
                                      <span className="text-[10px] text-muted-foreground font-semibold">{details.stdName}</span>
                                      <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full font-mono">{details.portText}</span>
                                    </Button>
                                  );
                                })}
                            </div>
                          </div>

                          {/* Puerto 2 */}
                          <div className="space-y-2">
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Estándares Puerto {e5071cPort2}</div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {e5071cStandards
                                .filter(s => s.endsWith(`_p${e5071cPort2}`) && !s.startsWith('thru_'))
                                .map((stepKey) => {
                                  const details = getE5071cBlockDetails(stepKey);
                                  const isDone = !!e5071cStandardsDone[stepKey];
                                  return (
                                    <Button
                                      key={stepKey}
                                      type="button"
                                      variant={isDone ? "secondary" : "outline"}
                                      disabled={loading}
                                      onClick={() => runE5071cStandard(stepKey)}
                                      className={cn(
                                        "h-20 flex flex-col gap-1.5 relative overflow-hidden transition-all duration-200 border-2",
                                        isDone ? "border-green-500/50 bg-green-500/5 hover:bg-green-500/10 text-foreground" : "border-border hover:border-primary/50"
                                      )}
                                    >
                                      {isDone && (
                                        <Check className="w-4 h-4 text-green-600 absolute top-2 right-2" />
                                      )}
                                      <span className="font-bold tracking-widest text-sm text-primary">{details.label}</span>
                                      <span className="text-[10px] text-muted-foreground font-semibold">{details.stdName}</span>
                                      <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full font-mono">{details.portText}</span>
                                    </Button>
                                  );
                                })}
                            </div>
                          </div>

                          {/* Thru (Transmisión) */}
                          <div className="space-y-2">
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Conexión de Transmisión</div>
                            <div className="grid grid-cols-1 gap-3">
                              {e5071cStandards
                                .filter(s => s.startsWith('thru_'))
                                .map((stepKey) => {
                                  const details = getE5071cBlockDetails(stepKey);
                                  const isDone = !!e5071cStandardsDone[stepKey];
                                  return (
                                    <Button
                                      key={stepKey}
                                      type="button"
                                      variant={isDone ? "secondary" : "outline"}
                                      disabled={loading}
                                      onClick={() => runE5071cStandard(stepKey)}
                                      className={cn(
                                        "h-20 flex flex-col gap-1.5 relative overflow-hidden transition-all duration-200 border-2",
                                        isDone ? "border-green-500/50 bg-green-500/5 hover:bg-green-500/10 text-foreground" : "border-border hover:border-primary/50"
                                      )}
                                    >
                                      {isDone && (
                                        <Check className="w-4 h-6 text-green-600 absolute top-2 right-2" />
                                      )}
                                      <span className="font-bold tracking-widest text-sm text-primary">{details.label}</span>
                                      <span className="text-[10px] text-muted-foreground font-semibold">{details.stdName}</span>
                                      <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full font-mono">{details.portText}</span>
                                    </Button>
                                  );
                                })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-4 border-t border-border space-y-3">
                      <Button
                        className="w-full h-12 text-lg font-bold shadow-md transition-all duration-300 active:scale-[0.99] hover:shadow-lg"
                        variant={Object.values(e5071cStandardsDone).every(v => v) ? "default" : "secondary"}
                        disabled={loading || !Object.values(e5071cStandardsDone).every(v => v)}
                        onClick={runE5071cCompute}
                      >
                        {loading ? "Procesando en VNA..." : "COMPUTING & FINISH"}
                      </Button>
                      {!Object.values(e5071cStandardsDone).every(v => v) && (
                        <p className="text-[10px] text-center text-muted-foreground italic">
                          Mide todos los estándares en sus respectivos puertos para habilitar la compilación y guardado.
                        </p>
                      )}
                    </div>
                  </div>
                ) : architecture === 'NanoVNA' ? (
                  /* UI NO SECUENCIAL (BLOQUES) PARA NanoVNA */
                  <div className="space-y-6">
                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-primary/80 flex flex-wrap justify-between items-center gap-2">
                      <div>
                        <strong>Modo:</strong> {calType === 'oneport' ? 'SOL – 1 Puerto' : 'SOLT – 2 Puertos'}
                      </div>
                      <div>
                        <strong>Equipo:</strong> {device}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {calSteps.map((stepKey) => {
                        const details = getNanovnaBlockDetails(stepKey);
                        const isDone = !!nanovnaStandardsDone[stepKey];
                        const plot = nanovnaPlots[stepKey];
                        return (
                          <div key={stepKey} className="flex flex-col space-y-2">
                            <Button
                              type="button"
                              variant={isDone ? "secondary" : "outline"}
                              disabled={loading}
                              onClick={() => runNanovnaStandard(stepKey)}
                              className={cn(
                                "h-20 w-full flex flex-col gap-1.5 relative overflow-hidden transition-all duration-200 border-2",
                                isDone ? "border-green-500/50 bg-green-500/5 hover:bg-green-500/10 text-foreground" : "border-border hover:border-primary/50"
                              )}
                            >
                              {isDone && (
                                <Check className="w-4 h-4 text-green-600 absolute top-2 right-2" />
                              )}
                              <span className="font-bold tracking-widest text-sm text-primary">{details.label}</span>
                              <span className="text-[10px] text-muted-foreground font-semibold">{details.stdName}</span>
                              <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full font-mono">{details.portText}</span>
                            </Button>
                            
                            {/* Gráfico medido para confirmar buena calibración */}
                            {isDone && plot && (
                              <div className="rounded-lg border border-border bg-background p-1.5 shadow-sm overflow-hidden transition-all duration-300">
                                <img 
                                  src={`data:image/png;base64,${plot}`} 
                                  alt={`Gráfico ${details.label}`} 
                                  className="w-full h-auto rounded" 
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-4 border-t border-border space-y-3">
                      <Button
                        className="w-full h-12 text-lg font-bold shadow-md transition-all duration-300 active:scale-[0.99] hover:shadow-lg"
                        variant={Object.values(nanovnaStandardsDone).every(v => v) ? "default" : "secondary"}
                        disabled={loading || !Object.values(nanovnaStandardsDone).every(v => v)}
                        onClick={runNanovnaCompute}
                      >
                        {loading ? "Procesando en NanoVNA..." : "COMPUTING & FINISH"}
                      </Button>
                      {!Object.values(nanovnaStandardsDone).every(v => v) && (
                        <p className="text-[10px] text-center text-muted-foreground italic">
                          Mide todos los estándares para habilitar el cálculo de coeficientes de calibración.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  /* UI SECUENCIAL ESTÁNDAR (HP S11/Isolation) */
                  <div className="space-y-4">
                    <div className="p-6 bg-background rounded-lg border border-border text-center space-y-4">
                      <h3 className="text-xl font-bold uppercase text-primary">{calSteps[currentStepIdx]}</h3>
                      <p className="text-muted-foreground">
                        {getStepInstruction(currentStepIdx)}
                      </p>
                      <Button 
                        onClick={runStep} 
                        disabled={loading}
                        className="w-full md:w-auto"
                      >
                        {loading ? t('cal.step.btn_measure') : t('cal.step.btn_confirm', calSteps[currentStepIdx].toUpperCase())}
                      </Button>
                    </div>
                    
                    <div className="flex justify-between gap-1">
                      {calSteps.map((s, i) => (
                        <div 
                          key={s} 
                          className={cn(
                            "h-2 flex-1 rounded-full",
                            i < currentStepIdx ? "bg-primary" : i === currentStepIdx ? "bg-primary animate-pulse" : "bg-muted"
                          )} 
                        />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-primary">
                {architecture === 'E5071C' ? <Wifi className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
                <CardTitle className="text-sm uppercase tracking-wider font-bold">Especificaciones {architecture}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Frec. Mínima</p>
                  <p className="text-lg font-mono font-bold text-foreground">
                    {architecture === 'NanoVNA' ? '50 kHz' : architecture === 'E5071C' ? '100 kHz' : '300 kHz'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Frec. Máxima</p>
                  <p className="text-lg font-mono font-bold text-foreground">
                    {architecture === 'NanoVNA' ? '3.0 GHz' : architecture === 'E5071C' ? '8.5 GHz' : '1.3 GHz'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Puntos Máx.</p>
                  <p className="text-lg font-mono font-bold text-foreground">
                    {architecture === 'NanoVNA' ? '1024' : architecture === 'E5071C' ? '20001' : '1601'}
                  </p>
                </div>
                {architecture === 'E5071C' && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Conexión</p>
                    <p className="text-lg font-mono font-bold text-foreground">TCP/IP</p>
                  </div>
                )}
              </div>
              <div className="pt-2">
                <div className="p-3 bg-background/50 rounded-lg border border-primary/10 flex items-start gap-2">
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    {architecture === 'NanoVNA' 
                      ? t('cal.info.nanovna')
                      : architecture === 'E5071C'
                      ? 'El E5071C es un ENA de altas prestaciones con calibración SOLT completa. Soporta hasta 20001 puntos y averaging/smoothing nativo.'
                      : "El HP 8752A es un analizador T/R de alta precisión. Soporta hasta 1601 puntos, pero requiere tiempos de barrido mayores."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <div className="p-4 bg-muted/30 rounded-lg border border-border">
            <h4 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 text-muted-foreground">
              <Zap className="w-3 h-3 text-yellow-500" />
              {architecture === 'NanoVNA' ? 'Recordatorio SOLT' : architecture === 'E5071C' ? 'Estándares E5071C' : 'Estándares HP'}
            </h4>
            <ul className="text-[10px] space-y-1 text-muted-foreground">
              {architecture === 'NanoVNA' ? (
                <>
                  <li>• <strong>Short</strong>: Cortocircuito.</li>
                  <li>• <strong>Open</strong>: Circuito abierto.</li>
                  <li>• <strong>Load</strong>: Carga de 50 Ω.</li>
                  <li>• <strong>Through</strong>: Conexión directa.</li>
                </>
              ) : architecture === 'E5071C' ? (
                <>
                  <li>• <strong>Open</strong>: Circuito abierto en cada puerto.</li>
                  <li>• <strong>Short</strong>: Cortocircuito en cada puerto.</li>
                  <li>• <strong>Load</strong>: Carga de 50 Ω en cada puerto.</li>
                  {e5071cCalMode === 'solt' && <li>• <strong>Thru</strong>: Conexión directa entre puertos.</li>}
                  <li>• Usa el kit de calibración activo en el instrumento.</li>
                </>
              ) : (
                <>
                  <li>• <strong>Open/Short/Load</strong>: Para reflexión ($S_{'{11}'}$).</li>
                  <li>• <strong>Thru</strong>: Para transmisión ($S_{'{21}'}$).</li>
                  <li>• <strong>Isolation</strong>: Cargas en ambos puertos.</li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>
    </ToolShell>
  );
}
