import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { OutputPickerPro } from '../OutputPickerPro';
import { cn } from '../ui/utils';
import { Upload, FileCheck, RefreshCw } from 'lucide-react';
import type { DirectoryHandle } from '../../lib/fsAccess';

export function SParamExtractionTool() {
  const [calFile, setCalFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [outCsv, setOutCsv] = useState('');
  const [outDir, setOutDir] = useState<DirectoryHandle | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Calibraciones del servidor
  const [serverCalibrations, setServerCalibrations] = useState<{name: string, fmin: number, fmax: number, points: number}[]>([]);
  const [selectedCalName, setSelectedCalName] = useState<string>("");
  const [device, setDevice] = useState<string>('NanoVNA-Izan');
  
  // Parámetros de barrido
  const [fmin, setFmin] = useState<number>(1);
  const [fmax, setFmax] = useState<number>(1000);
  const [points, setPoints] = useState<number>(201);

  useEffect(() => {
    fetchCalibrations();
  }, [device]);

  const fetchCalibrations = async () => {
    try {
      const response = await fetch(`http://localhost:8080/api/vna/calibrations?device=${encodeURIComponent(device)}`);
      if (response.ok) {
        const data = await response.json();
        setServerCalibrations(data);
      }
    } catch (err) {
      console.error("Error fetching calibrations:", err);
    }
  };

  const handleCalChange = (val: string) => {
    setSelectedCalName(val);
    const cal = serverCalibrations.find(c => c.name === val);
    if (cal) {
      setFmin(cal.fmin);
      setFmax(cal.fmax);
      setPoints(cal.points);
      // Si se elige una de servidor, quitamos el archivo local si lo había
      setCalFile(null);
    }
  };

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
      setSelectedCalName(""); // Quitamos la de servidor si se sube uno
    } else {
      toast.info('Por favor, sube un archivo con extensión .cal');
    }
  };

  const handleAction = async (id: string) => {
    if (id === 'run') {
      setLoading(true);
      setResult(null);
      try {
        const formData = new FormData();
        formData.append('start_mhz', fmin.toString());
        formData.append('stop_mhz', fmax.toString());
        formData.append('points', points.toString());
        formData.append('is_one_port', 'false');
        formData.append('device', device);
        
        if (calFile) {
          formData.append('cal_file', calFile);
        } else if (selectedCalName) {
          formData.append('server_cal_name', selectedCalName);
        }

        const response = await fetch('http://localhost:8080/api/vna/measurement', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Error al realizar la medición');
        }
        
        const data = await response.json();
        setResult(data);
      } catch (error) {
        console.error(error);
        toast.error('Error: ' + (error instanceof Error ? error.message : String(error)));
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
        { id: 'run', label: 'Ejecutar', variant: 'default' },
        { id: 'export', label: 'Exportar', variant: 'outline' },
      ]}
      onAction={handleAction}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Calibración</CardTitle>
              <CardDescription>Selecciona una calibración del servidor o sube una propia.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Dispositivo VNA</Label>
                <Select value={device} onValueChange={setDevice}>
                  <SelectTrigger className="bg-input-background">
                    <SelectValue placeholder="Seleccionar dispositivo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NanoVNA-Izan">NanoVNA-Izan</SelectItem>
                    <SelectItem value="NanoVNA-LAB1">NanoVNA-LAB1</SelectItem>
                    <SelectItem value="NanoVNA-LAB2">NanoVNA-LAB2</SelectItem>
                    <SelectItem value="VNA-HP-8752A">VNA-HP-8752A (GPIB)</SelectItem>
                    <SelectItem value="VNA-E5071C">VNA-E5071C (TCP/IP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Calibraciones en servidor</Label>
                  <button onClick={fetchCalibrations} className="text-muted-foreground hover:text-primary p-1">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
                <Select value={selectedCalName} onValueChange={handleCalChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una calibración..." />
                  </SelectTrigger>
                  <SelectContent>
                    {serverCalibrations.map((cal) => (
                      <SelectItem key={cal.name} value={cal.name}>
                        {cal.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">O subir archivo</span>
                </div>
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative group cursor-pointer border-2 border-dashed rounded-xl p-4 transition-all flex flex-col items-center justify-center gap-2",
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
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setCalFile(e.target.files[0]);
                      setSelectedCalName("");
                    }
                  }}
                />
                
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                  calFile ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary group-hover:bg-primary/20"
                )}>
                  {calFile ? <FileCheck className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                </div>

                <div className="text-center">
                  <p className="text-xs font-medium">
                    {calFile ? calFile.name : "Haz clic o arrastra .cal"}
                  </p>
                </div>

                {calFile && (
                  <div className="absolute top-2 right-2 flex items-center gap-2">
                    <button 
                      onClick={async (e) => {
                        e.stopPropagation();
                        const formData = new FormData();
                        formData.append('file', calFile);
                        try {
                          const res = await fetch('http://localhost:8080/api/vna/calibrations/upload', {
                            method: 'POST',
                            body: formData
                          });
                          if (res.ok) {
                            toast.success("Calibración guardada en el servidor.");
                            fetchCalibrations();
                          }
                        } catch (err) {
                          toast.error("Error al guardar calibración: " + err);
                        }
                      }}
                      className="text-xs text-primary hover:text-primary/80 bg-primary/10 px-2 py-1 rounded"
                    >
                      Persistir en Servidor
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setCalFile(null);
                      }}
                      className="text-xs text-muted-foreground hover:text-destructive px-1 py-1"
                    >
                      Quitar
                    </button>
                  </div>
                )}

              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configuración de Barrido</CardTitle>
              <CardDescription>Ajusta el rango de frecuencias y puntos.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fmin">Fmin (MHz)</Label>
                <Input 
                  id="fmin" 
                  type="number" 
                  value={fmin} 
                  onChange={(e) => setFmin(Number(e.target.value))} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fmax">Fmax (MHz)</Label>
                <Input 
                  id="fmax" 
                  type="number" 
                  value={fmax} 
                  onChange={(e) => setFmax(Number(e.target.value))} 
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label htmlFor="points">Puntos</Label>
                <Input 
                  id="points" 
                  type="number" 
                  value={points} 
                  onChange={(e) => setPoints(Number(e.target.value))} 
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Salida</CardTitle>
              <CardDescription>Introduce el nombre para guardar su CSV.</CardDescription>
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
                {loading ? 'Midiendo...' : result ? 'Datos adquiridos.' : 'Pulsa Ejecutar para medir.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex flex-col items-center justify-center p-8 space-y-4">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                  <p className="text-muted-foreground italic text-sm">Capturando datos...</p>
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
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground text-sm">
                  Las gráficas se mostrarán aquí.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ToolShell>
  );
}


