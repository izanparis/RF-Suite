import React, { useMemo, useState } from 'react';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { UnitInput } from '../UnitInput';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { cn } from '../ui/utils';
import { OutputPickerPro } from '../OutputPickerPro';
import { FREQ_UNITS, toBase } from '../../lib/units';
import type { DirectoryHandle } from '../../lib/fsAccess';

export function CalibrationTool() {
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

  const [status, setStatus] = useState<'idle' | 'calibrating'>('idle');
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  const calSteps = ['short', 'open', 'load', 'isolation', 'through'];

  const handleAction = async (id: string) => {
    if (id === 'connect') {
      setLoading(true);
      try {
        const res = await fetch('http://localhost:8080/api/vna/connect');
        const data = await res.json();
        if (data.connected) {
          alert('✅ NanoVNA detectado correctamente.');
        } else {
          alert('❌ Error de conexión: ' + data.error + '\n\n' + 
                'Asegúrate de que:\n' +
                '1. El NanoVNA esté encendido y conectado por USB.\n' +
                '2. Ningún otro programa (como NanoVNA Saver) lo esté usando.\n' +
                '3. Los drivers de puerto serie estén instalados.');
        }
      } catch (e) {
        alert('❌ No se pudo contactar con el servidor backend (Python). Asegúrate de que esté ejecutándose.');
      } finally {
        setLoading(false);
      }
    }

    if (id === 'start') {
      setLoading(true);
      try {
        const payload = {
          start_mhz: parseFloat(startHz) / 1e6,
          stop_mhz: parseFloat(stopHz) / 1e6,
          points: parseInt(points)
        };
        const res = await fetch('http://localhost:8080/api/vna/calibrate/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Error al iniciar sweep');
        setStatus('calibrating');
        setCurrentStepIdx(0);
        alert('Barrido configurado. Comienza el proceso SOLT.');
      } catch (e) {
        alert('Error: ' + e);
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
      if (!res.ok) throw new Error(`Error en paso ${step}`);
      
      if (currentStepIdx < calSteps.length - 1) {
        setCurrentStepIdx(prev => prev + 1);
      } else {
        // Finalize - The backend now returns base64 content
        try {
          const res = await fetch('http://localhost:8080/api/vna/calibrate/finish', { method: 'POST' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          setStatus('idle');
          
          if (data.status === 'success' && data.file_content) {
            const { saveBase64File } = await import('../../lib/fsAccess');
            // Try to save to selected folder, or just trigger download
            await saveBase64File(outDir, outCal || data.suggested_name, data.file_content);
            alert(`✅ Calibración completada y archivo guardado.`);
          } else {
            alert('❌ Error al finalizar: ' + (data.message || 'Error desconocido del servidor.'));
          }
        } catch (e) {
          console.error(e);
          alert('❌ Error al finalizar la calibración: ' + (e instanceof Error ? e.message : String(e)));
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
      title="Calibración"
      description="Asistente para calibración SOLT. Genera y guarda el archivo de calibración para usarlo en las mediciones."
      actions={[
        { id: 'connect', label: 'Detectar VNA', variant: 'secondary' },
        { id: 'start', label: 'Iniciar calibración', variant: 'default' },
      ]}
      onAction={handleAction}
    >
      <Card>
        <CardHeader>
          <CardTitle>Configuración de barrido</CardTitle>
          <CardDescription>Define el rango de frecuencia y el número de puntos del barrido.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UnitInput
            label="Start"
            value={startV}
            unit={startU}
            units={FREQ_UNITS}
            onChangeValue={setStartV}
            onChangeUnit={setStartU}
            placeholder="1"
          />
          <UnitInput
            label="Stop"
            value={stopV}
            unit={stopU}
            units={FREQ_UNITS}
            onChangeValue={setStopV}
            onChangeUnit={setStopU}
            placeholder="1000"
          />
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label>Puntos</Label>
            </div>
            <div className="grid grid-cols-12 gap-2 items-center">
              <Input
                className="col-span-7"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                placeholder="401"
                inputMode="numeric"
              />
              <div className="col-span-5 h-9 w-full rounded-md border border-input bg-input-background flex items-center justify-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Pts
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
        
              {status === 'calibrating' && (
                <Card className="border-primary/50 bg-primary/5">
                  <CardHeader>
                    <CardTitle>Proceso de Calibración: Paso {currentStepIdx + 1} de {calSteps.length}</CardTitle>
                    <CardDescription>
                      Sigue las instrucciones para cada estándar SOLT.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-6 bg-background rounded-lg border border-border text-center space-y-4">
                      <h3 className="text-xl font-bold uppercase text-primary">{calSteps[currentStepIdx]}</h3>
                      <p className="text-muted-foreground">
                        {currentStepIdx === 0 && 'Conecta el estándar SHORT al puerto 1.'}
                        {currentStepIdx === 1 && 'Conecta el estándar OPEN al puerto 1.'}
                        {currentStepIdx === 2 && 'Conecta la CARGA (LOAD) de 50 Ω al puerto 1.'}
                        {currentStepIdx === 3 && 'Conecta cargas a ambos puertos para ISOLATION.'}
                        {currentStepIdx === 4 && 'Conecta el cable THRU entre el puerto 1 y 2.'}
                      </p>
                      <Button 
                        onClick={runStep} 
                        disabled={loading}
                        className="w-full md:w-auto"
                      >
                        {loading ? 'Midiendo...' : `Confirmar ${calSteps[currentStepIdx].toUpperCase()}`}
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
        
              <Card>
        <CardHeader>
          <CardTitle>Salida</CardTitle>
          <CardDescription>Introduce el nombre para guardar su archivo de calibración y el directorio en el que lo desea.</CardDescription>
        </CardHeader>
        <CardContent>
          <OutputPickerPro
            label="Archivo"
            defaultName={outCal}
            onChange={({ filename, dirHandle }) => {
              setOutCal(filename);
              setOutDir(dirHandle);
            }}
          />
          
        </CardContent>
      </Card>
    </ToolShell>
  );
}
