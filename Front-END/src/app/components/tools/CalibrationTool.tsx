import React, { useMemo, useState } from 'react';
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

import { Zap, Info, Ruler, Activity, Check, ArrowRight } from 'lucide-react';

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
  const [importFilename, setImportFilename] = useState('');

  const [hpImportFile, setHpImportFile] = useState<File | null>(null);

  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  // Generate suggested filename: cal_IDCAL_dispositivo_fmin_fmax_npuntos
  const generateSuggestedFilename = () => {
    const fmin = startHz !== null ? (startHz / 1e6).toFixed(0) : '0';
    const fmax = stopHz !== null ? (stopHz / 1e6).toFixed(0) : '0';
    
    if (architecture === 'HP8752A') {
      return `cal_${calPrefix}_hp8752a_${fmin}_${fmax}_${points}.json`;
    }
    
    // Formato solicitado: cal_IDCAL_dispositivo_fmin_fmax_npuntos
    return `cal_${calPrefix}_${device}_${fmin}_${fmax}_${points}.cal`;
  };

  const calSteps = useMemo(() => {
    if (architecture === 'NanoVNA') {
      return calType === 'oneport' 
        ? ['short', 'open', 'load'] 
        : ['short', 'open', 'load', 'through'];
    } else {
      // HP 8752A - Solo S11 y RAI (twoport)
      if (hpCalMode === 's11') return ['open', 'short', 'load', 'compute'];
      if (hpCalMode === 'twoport') return ['thru', 'isolation', 'compute'];
      return [];
    }
  }, [calType, hpCalMode, architecture]);

  const getStepInstruction = (idx: number) => {
    const step = calSteps[idx];
    if (step === 'short') return t('cal.step.instr_short');
    if (step === 'open') return t('cal.step.instr_open');
    if (step === 'load') return t('cal.step.instr_load');
    if (step === 'isolation') return t('cal.step.instr_iso');
    if (step === 'through' || step === 'thru') return t('cal.step.instr_thru');
    if (step === 'compute') return "Calculando coeficientes finales...";
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
        await fetch('http://localhost:8080/api/vna/hp/calibrate/step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cal_type: 'none', step_cmd: 'PRES', device })
        });
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
      
      let pts = parseInt(points);
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
        const res = await fetch(`http://localhost:8080/api/vna/calibrate/start?device=${device}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.detail || 'Error al iniciar sweep');
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
      if (architecture === 'NanoVNA') {
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
      const res = await fetch(`http://localhost:8080/api/vna/hp/export?filename=${encodeURIComponent(name)}&device=${device}`);
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

        const res = await fetch('http://localhost:8080/api/vna/hp/import_file', {
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
        const res = await fetch('http://localhost:8080/api/vna/hp/import', {
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
        { id: 'change_device', label: 'Cambiar Equipo', variant: 'ghost' },
        { id: 'connect', label: t('cal.action.connect'), variant: 'secondary' },
        { id: 'start', label: t('cal.action.start'), variant: 'default' },
        { id: 'save_folder', label: t('cal.action.save_folder'), variant: 'outline' },
        { id: 'reset', label: 'RESET VNA', variant: 'destructive' },
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
                ) : (
                  /* UI SECUENCIAL ESTÁNDAR (NanoVNA o HP S11/Isolation) */
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
                <Activity className="w-4 h-4" />
                <CardTitle className="text-sm uppercase tracking-wider font-bold">Especificaciones {architecture}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Frec. Mínima</p>
                  <p className="text-lg font-mono font-bold text-foreground">
                    {architecture === 'NanoVNA' ? '50 kHz' : '300 kHz'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Frec. Máxima</p>
                  <p className="text-lg font-mono font-bold text-foreground">
                    {architecture === 'NanoVNA' ? '3.0 GHz' : '1.3 GHz'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Puntos Máx.</p>
                  <p className="text-lg font-mono font-bold text-foreground">
                    {architecture === 'NanoVNA' ? '1024' : '1601'}
                  </p>
                </div>
              </div>
              <div className="pt-2">
                <div className="p-3 bg-background/50 rounded-lg border border-primary/10 flex items-start gap-2">
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    {architecture === 'NanoVNA' 
                      ? t('cal.info.nanovna')
                      : "El HP 8752A es un analizador T/R de alta precisión. Soporta hasta 1601 puntos, pero requiere tiempos de barrido mayores."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <div className="p-4 bg-muted/30 rounded-lg border border-border">
            <h4 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 text-muted-foreground">
              <Zap className="w-3 h-3 text-yellow-500" />
              {architecture === 'NanoVNA' ? 'Recordatorio SOLT' : 'Estándares HP'}
            </h4>
            <ul className="text-[10px] space-y-1 text-muted-foreground">
              {architecture === 'NanoVNA' ? (
                <>
                  <li>• <strong>Short</strong>: Cortocircuito.</li>
                  <li>• <strong>Open</strong>: Circuito abierto.</li>
                  <li>• <strong>Load</strong>: Carga de 50 Ω.</li>
                  <li>• <strong>Through</strong>: Conexión directa.</li>
                </>
              ) : (
                <>
                  <li>• <strong>Open/Short/Load</strong>: Para reflexión ($S_{11}$).</li>
                  <li>• <strong>Thru</strong>: Para transmisión ($S_{21}$).</li>
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
