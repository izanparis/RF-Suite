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

import { Zap, Info, Ruler, Activity } from 'lucide-react';

export function CalibrationTool() {
  const { t } = useLanguage();
  // Frecuencias con unidad (UI)
  const [startV, setStartV] = useState('1');
  const [startU, setStartU] = useState('MHz');
  const [stopV, setStopV] = useState('1000');
  const [stopU, setStopU] = useState('MHz');

  const startHz = useMemo(() => toBase(startV, startU, FREQ_UNITS), [startV, startU]);
  const stopHz = useMemo(() => toBase(stopV, stopU, FREQ_UNITS), [stopV, stopU]);

  const [points, setPoints] = useState('401');

  // Salida
  const [outCal, setOutCal] = useState('');
  const [outDir, setOutDir] = useState<DirectoryHandle | null>(null);
  const [device, setDevice] = useState('NanoVNA-Izan');
  const [saveToServer, setSaveToServer] = useState(true);

  const [status, setStatus] = useState<'idle' | 'calibrating'>('idle');
  const [calType, setCalType] = useState<'oneport' | 'twoport'>('twoport');
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  // Generate suggested filename: cal_fmin-fmax_numpuntos_dispositivo.cal
  const generateSuggestedFilename = () => {
    const fmin = startHz !== null ? (startHz / 1e6).toFixed(0) : '0';
    const fmax = stopHz !== null ? (stopHz / 1e6).toFixed(0) : '0';
    return `cal_${fmin}-${fmax}_${points}_${device}.cal`;
  };

  const calSteps = useMemo(() => {
    return calType === 'oneport' 
      ? ['short', 'open', 'load'] 
      : ['short', 'open', 'load', 'isolation', 'through'];
  }, [calType]);

  const getStepInstruction = (idx: number) => {
    const step = calSteps[idx];
    switch (step) {
      case 'short': return t('cal.step.instr_short');
      case 'open': return t('cal.step.instr_open');
      case 'load': return t('cal.step.instr_load');
      case 'isolation': return t('cal.step.instr_iso');
      case 'through': return t('cal.step.instr_thru');
      default: return '';
    }
  };

  const handleAction = async (id: string) => {
    if (id === 'connect') {
      setLoading(true);
      try {
        const res = await fetch('http://localhost:8080/api/vna/connect');
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
          // Also update the filename with the suggested one if empty
          if (!outCal) {
            setOutCal(generateSuggestedFilename());
          }
        }
      } catch (e) {
        console.error("User cancelled or error picking directory", e);
      }
    }

    if (id === 'start') {
      if (startHz === null || stopHz === null) {
        alert(t('alert.freq_error'));
        return;
      }
      
      let pts = parseInt(points);
      if (pts > 1024) {
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
        const res = await fetch('http://localhost:8080/api/vna/calibrate/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.detail || 'Error al iniciar sweep');
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
      const res = await fetch(`http://localhost:8080/api/vna/calibrate/step?step=${step}`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error(t('cal.alert.step_error', step));
      
      if (currentStepIdx < calSteps.length - 1) {
        setCurrentStepIdx(prev => prev + 1);
      } else {
        // Finalize
        try {
          const filename = outCal || generateSuggestedFilename();
          const res = await fetch(`http://localhost:8080/api/vna/calibrate/finish?cal_type=${calType}&save_to_server=${saveToServer}&filename=${encodeURIComponent(filename)}&device=${encodeURIComponent(device)}`, { method: 'POST' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setStatus('idle');
          
          if (data.status === 'success' && data.file_content) {
            // Download local copy if possible
            if (outDir) {
              await saveBase64File(outDir, filename, data.file_content);
            }
            alert(saveToServer ? t('cal.alert.finish_success') + " (Guardada en servidor)" : t('cal.alert.finish_success'));
          } else {
            alert(t('cal.alert.finish_error') + (data.message || 'Error desconocido del servidor.'));
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

  return (
    <ToolShell
      title={t('cal.title')}
      description={t('cal.desc')}
      actions={[
        { id: 'connect', label: t('cal.action.connect'), variant: 'secondary' },
        { id: 'start', label: t('cal.action.start'), variant: 'default' },
        { id: 'save_folder', label: t('cal.action.save_folder'), variant: 'outline' },
      ]}
      onAction={handleAction}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('cal.config.title')}</CardTitle>
              <CardDescription>{t('cal.config.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                      <SelectItem value="NanoVNA-Izan">NanoVNA-Izan</SelectItem>
                      <SelectItem value="NanoVNA-LAB1">NanoVNA-LAB1</SelectItem>
                      <SelectItem value="NanoVNA-LAB2">NanoVNA-LAB2</SelectItem>
                    </SelectContent>
                  </Select>
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
                <CardTitle>{t('cal.step.title', currentStepIdx + 1, calSteps.length)}</CardTitle>
                <CardDescription>
                  {t('cal.step.desc')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 text-primary">
                <Activity className="w-4 h-4" />
                <CardTitle className="text-sm uppercase tracking-wider font-bold">Especificaciones VNA</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Frec. Mínima</p>
                  <p className="text-lg font-mono font-bold text-foreground">50 kHz</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Frec. Máxima</p>
                  <p className="text-lg font-mono font-bold text-foreground">3.0 GHz</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Puntos Máx.</p>
                  <p className="text-lg font-mono font-bold text-foreground">1024</p>
                </div>
              </div>
              <div className="pt-2">
                <div className="p-3 bg-background/50 rounded-lg border border-primary/10 flex items-start gap-2">
                  <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Valores estándar para la serie NanoVNA V2 (SAA-2). Asegúrate de que el barrido esté dentro de estos límites para una calibración precisa.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <div className="p-4 bg-muted/30 rounded-lg border border-border">
            <h4 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 text-muted-foreground">
              <Zap className="w-3 h-3 text-yellow-500" />
              Recordatorio SOLT
            </h4>
            <ul className="text-[10px] space-y-1 text-muted-foreground">
              <li>• <strong>Short</strong>: Cortocircuito.</li>
              <li>• <strong>Open</strong>: Circuito abierto.</li>
              <li>• <strong>Load</strong>: Carga de 50 Ω.</li>
              <li>• <strong>Through</strong>: Conexión directa.</li>
            </ul>
          </div>
        </div>
      </div>
    </ToolShell>
  );
}
