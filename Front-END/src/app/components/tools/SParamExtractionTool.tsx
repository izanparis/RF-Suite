import React, { useState, useRef } from 'react';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { OutputPickerPro } from '../OutputPickerPro';
import { cn } from '../ui/utils';
import { Upload, FileCheck } from 'lucide-react';
import type { DirectoryHandle } from '../../lib/fsAccess';

export function SParamExtractionTool() {
  const [calFile, setCalFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [outCsv, setOutCsv] = useState('');
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
    if (id === 'run') {
      setLoading(true);
      setResult(null);
      try {
        // Para mediciones directas con calibración, usamos el endpoint de sweep.
        // En una fase posterior, el backend aceptará el archivo .cal subido.
        const response = await fetch('http://localhost:8000/api/vna/sweep?start_mhz=1&stop_mhz=1000&points=201');

        if (!response.ok) throw new Error('Error al conectar con NanoVNA');
        const data = await response.json();
        setResult(data);
      } catch (error) {
        console.error(error);
        alert('Error: ' + (error instanceof Error ? error.message : String(error)));
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <ToolShell
      title="Extracción de parámetros S → CSV"
      description="A partir de una calibración cargada, calcula los parámetros S, exporta CSV y genera plots." 
      actions={[
        { id: 'open_cal', label: 'Cargar .cal', variant: 'secondary' },
        { id: 'run', label: 'Ejecutar', variant: 'default' },
        { id: 'export', label: 'Exportar', variant: 'outline' },
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
              {calFile ? <FileCheck className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
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
          <CardTitle>Salida</CardTitle>
          <CardDescription>Introduce el nombre para guardar su CSV y el directorio en el que lo desea.</CardDescription>
        </CardHeader>
        <CardContent>
          <OutputPickerPro
            label="Salida CSV"
            defaultName={outCsv}
            onChange={({ filename, dirHandle }) => {
              setOutCsv(filename);
              setOutDir(dirHandle);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visualización de Parámetros S</CardTitle>
          <CardDescription>
            {loading ? 'Midiendo...' : result ? 'Datos adquiridos.' : 'Pulsa Ejecutar para medir con el NanoVNA.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-muted-foreground italic">Capturando datos del hardware...</p>
            </div>
          ) : result ? (
            <div className="space-y-4">
              <div className="rounded-lg overflow-hidden border border-border">
                <img 
                  src={`data:image/png;base64,${result.plot}`} 
                  alt="VNA Plot" 
                  className="w-full h-auto"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
              Las gráficas de magnitud y fase se mostrarán aquí tras la adquisición.
            </div>
          )}
        </CardContent>
      </Card>
    </ToolShell>
  );
}
