import React, { useMemo, useState, useRef } from 'react';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { UnitInput } from '../UnitInput';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { OutputPickerPro } from '../OutputPickerPro';
import { FREQ_UNITS, toBase } from '../../lib/units';
import { cn } from '../ui/utils';
import { Upload, FileText } from 'lucide-react';
import type { DirectoryHandle } from '../../lib/fsAccess';

export function MeasurementTool() {
  const [calFile, setCalFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [startV, setStartV] = useState('1');
  const [startU, setStartU] = useState('MHz');
  const [stopV, setStopV] = useState('1000');
  const [stopU, setStopU] = useState('MHz');

  const startHz = useMemo(() => toBase(startV, startU, FREQ_UNITS), [startV, startU]);
  const stopHz = useMemo(() => toBase(stopV, stopU, FREQ_UNITS), [stopV, stopU]);

  const [points, setPoints] = useState('401');

  const [outS2P, setOutS2P] = useState('');
  const [outDir, setOutDir] = useState<DirectoryHandle | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.cal')) {
      setCalFile(file);
    } else {
      alert('Por favor, sube un archivo con extensión .cal');
    }
  };

  const handleAction = async (id: string) => {
    if (id === 'measure') {
      setLoading(true);
      setResult(null);
      try {
        const start_hz = startHz || 0;
        const stop_hz = stopHz || 0;
        const pts = parseInt(points) || 201;

        const response = await fetch(`http://localhost:8080/api/vna/sweep?start_mhz=${start_hz / 1e6}&stop_mhz=${stop_hz / 1e6}&points=${pts}`);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Error al conectar con el NanoVNA');
        }

        const data = await response.json();
        setResult(data);
      } catch (error) {
        console.error(error);
        alert('Error en medición: ' + (error instanceof Error ? error.message : String(error)));
      } finally {
        setLoading(false);
      }
    }
    
    if (id === 'save') {
      if (!result || !result.s2p_content) {
        alert('Primero realiza una medición.');
        return;
      }
      if (!outDir) {
        alert('Selecciona una carpeta de salida primero.');
        return;
      }
      
      try {
        let filename = outS2P || 'medicion.s2p';
        if (!filename.toLowerCase().endsWith('.s2p')) {
          filename += '.s2p';
        }

        const { saveTextFile } = await import('../../lib/fsAccess');
        await saveTextFile(outDir, filename, result.s2p_content);
        alert('Archivo guardado correctamente.');
      } catch (e) {
        console.error(e);
        alert('Error al guardar: ' + e);
      }
    }
  };

  return (
    <ToolShell
      title="Medición VNA"
      description="Mide Parámetros-S a partir de un archivo de calibración"
      actions={[
        { id: 'measure', label: 'Medir', variant: 'default' },
        { id: 'save', label: 'Guardar .s2p', variant: 'outline' },
      ]}
      onAction={handleAction}
    >
      <Card>
        <CardHeader>
          <CardTitle>Entrada</CardTitle>
          <CardDescription>Selecciona o arrastra el archivo de calibración (.cal).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "relative group cursor-pointer border-2 border-dashed rounded-xl p-8 transition-all flex flex-col items-center justify-center gap-3",
              isDragging 
                ? "border-primary bg-primary/5 scale-[1.01]" 
                : "border-border hover:border-primary/50 hover:bg-muted/50"
            )}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".cal"
              onChange={(e) => setCalFile(e.target.files?.[0] ?? null)}
            />
            
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center transition-colors",
              calFile ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary group-hover:bg-primary/20"
            )}>
              {calFile ? <FileText className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
            </div>

            <div className="text-center">
              <p className="text-sm font-medium">
                {calFile ? calFile.name : "Haz clic o arrastra el archivo aquí"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Solo archivos .cal generados previamente
              </p>
            </div>

            {calFile && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setCalFile(null);
                }}
                className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-destructive px-2 py-1"
              >
                Quitar
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuración de barrido</CardTitle>
          <CardDescription>Define el rango de frecuencia y el número de puntos del sweep.</CardDescription>
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
            <p className="text-xs text-muted-foreground mt-1"></p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Salida</CardTitle>
          <CardDescription>Introduce el nombre para guardar su archivo .s2p y el directorio en el que lo desea.</CardDescription>
        </CardHeader>
        <CardContent>
          <OutputPickerPro
            label="Archivo .s2p"
            defaultName={outS2P}
            onChange={({ filename, dirHandle }) => {
              setOutS2P(filename);
              setOutDir(dirHandle);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resultados de Medición</CardTitle>
          <CardDescription>
            {loading ? 'Adquiriendo datos del NanoVNA...' : result ? 'Medición capturada.' : 'Conecta el NanoVNA y pulsa Medir.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-muted-foreground italic">Comunicando con hardware por USB...</p>
            </div>
          ) : result ? (
            <div className="space-y-4">
              <div className="rounded-lg overflow-hidden border border-border">
                <img 
                  src={`data:image/png;base64,${result.plot}`} 
                  alt="VNA Measurement Plot" 
                  className="w-full h-auto"
                />
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Barrido de {result.freqs.length} puntos completado.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
              Los parámetros S medidos aparecerán aquí en tiempo real tras pulsar "Medir".
            </div>
          )}
        </CardContent>
      </Card>
    </ToolShell>
  );
}
