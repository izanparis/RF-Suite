import React, { useMemo, useState, useRef } from 'react';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { UnitInput } from '../UnitInput';
import { OutputPickerPro } from '../OutputPickerPro';
import { cn } from '../ui/utils';
import { Upload, FileCheck, ChevronLeft, ChevronRight, Download, Activity, X, BarChart3 } from 'lucide-react';
import { RES_UNITS, toBase } from '../../lib/units';
import type { DirectoryHandle } from '../../lib/fsAccess';

export function RlcModelTool() {
  const [s2pFile, setS2pFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [z0, setZ0] = useState('50');
  const [z0Unit, setZ0Unit] = useState('Ω');
  const [mode, setMode] = useState('shunt');
  const [outName, setOutName] = useState('');
  const [outDir, setOutDir] = useState<DirectoryHandle | null>(null);

  const z0Ohm = useMemo(() => toBase(z0, z0Unit, RES_UNITS), [z0, z0Unit]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [activePlotIdx, setActivePlotIdx] = useState(0);

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
    if (file && (file.name.toLowerCase().endsWith('.s2p') || file.name.toLowerCase().endsWith('.ts'))) {
      setS2pFile(file);
    } else {
      alert('Por favor, sube un archivo Touchstone (.s2p)');
    }
  };

  const handleAction = async (id: string) => {
    if (id === 'fit') {
      if (!s2pFile) {
        alert('Por favor, selecciona un archivo Touchstone (.s2p) primero.');
        return;
      }

      setLoading(true);
      setResult(null);
      setActivePlotIdx(0);
      try {
        const formData = new FormData();
        formData.append('file', s2pFile);
        formData.append('z0', String(z0Ohm || 50));
        formData.append('mode', mode);

        const response = await fetch('http://localhost:8080/api/rlc-extraction', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Error en la respuesta del servidor');
        }

        const data = await response.json();
        setResult(data);
      } catch (error) {
        console.error(error);
        alert('Error en extracción RLC: ' + (error instanceof Error ? error.message : String(error)));
      } finally {
        setLoading(false);
      }
    }

    if (id === 'export') {
      if (!result || !result.zip_content) {
        alert('Primero ajusta el modelo.');
        return;
      }
      try {
        const { saveBase64File } = await import('../../lib/fsAccess');
        let filename = outName || 'figuras_rlc';
        if (!filename.toLowerCase().endsWith('.zip')) {
          filename += '.zip';
        }
        await saveBase64File(outDir, filename, result.zip_content);
        alert('✅ Figuras exportadas correctamente en un paquete ZIP.');
      } catch (e) {
        alert('❌ Error al exportar figuras: ' + e);
      }
    }
  };

  const downloadCurrentPlot = () => {
    if (!result?.plots?.[activePlotIdx]) return;
    const plot = result.plots[activePlotIdx];
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${plot.image}`;
    link.download = `${plot.id}_fit.png`;
    link.click();
  };

  return (
    <ToolShell
      title="Modelo RLC automático"
      description="Carga un Touchstone .s2p y ajusta un modelo RLC (Modo Shunt)."
      actions={[
        { id: 'fit', label: 'Ajustar modelo', variant: 'default' },
        { id: 'export', label: 'Exportar figuras (.zip)', variant: 'outline' },
      ]}
      onAction={handleAction}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="flex flex-col">
            <CardHeader className="pb-3 text-zinc-900">
              <CardTitle className="text-lg">Entrada</CardTitle>
              <CardDescription>Archivo y parámetros de referencia.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative group cursor-pointer border-2 border-dashed rounded-xl p-4 min-h-[100px] transition-all flex flex-col items-center justify-center gap-2",
                  isDragging 
                    ? "border-primary bg-primary/5 scale-[1.01]" 
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                )}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".s2p"
                  onChange={(e) => setS2pFile(e.target.files?.[0] ?? null)}
                />
                
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                  s2pFile ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary group-hover:bg-primary/20"
                )}>
                  {s2pFile ? <FileCheck className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                </div>

                <p className="text-[10px] font-medium text-center truncate max-w-full px-2 text-zinc-900">
                  {s2pFile ? s2pFile.name : "Pincha o arrastra el archivo .s2p"}
                </p>

                {s2pFile && (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setS2pFile(null);
                    }}
                    className="absolute top-1 right-1 text-muted-foreground hover:text-destructive p-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <UnitInput
                  label="Z0"
                  value={z0}
                  unit={z0Unit}
                  units={RES_UNITS}
                  onChangeValue={setZ0}
                  onChangeUnit={setZ0Unit}
                  placeholder="50"
                />
                <div className="space-y-2">
                  <Label className="text-zinc-900">Modo</Label>
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger className="bg-input-background">
                      <SelectValue placeholder="Selecciona" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shunt">Shunt</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="pb-3 text-zinc-900">
              <CardTitle className="text-lg">Salida</CardTitle>
              <CardDescription>Guardar modelo ajustado.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <OutputPickerPro
                label="Nombre del archivo"
                defaultName={outName}
                onChange={({ filename, dirHandle }) => {
                  setOutName(filename);
                  setOutDir(dirHandle);
                }}
              />
            </CardContent>
          </Card>
        </div>

        {/* RLC Parameters Summary */}
        <Card className={cn("transition-colors", result ? "bg-primary/5 border-primary/20" : "bg-muted/30")}>
          <CardHeader className="pb-2 text-zinc-900">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Parámetros RLC Extraídos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex flex-col border-l-2 border-primary/20 pl-4">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Resistencia (R)</p>
                  <p className="text-2xl font-mono font-bold text-primary">{(result.R || 0).toFixed(4)} Ω</p>
                </div>
                <div className="flex flex-col border-l-2 border-primary/20 pl-4">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Inductancia (L)</p>
                  <p className="text-2xl font-mono font-bold text-primary">{((result.L || 0) * 1e9).toFixed(4)} nH</p>
                </div>
                <div className="flex flex-col border-l-2 border-primary/20 pl-4">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold">Capacidad (C)</p>
                  <p className="text-2xl font-mono font-bold text-primary">{((result.C || 0) * 1e12).toFixed(4)} pF</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-2 text-zinc-900">
                <p className="text-xs text-muted-foreground italic">Los parámetros aparecerán tras ajustar el modelo.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Carousel Section */}
        <Card className="w-full flex flex-col overflow-hidden min-h-[500px]">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 bg-muted/10 px-6 py-4">
            <div className="space-y-1">
              <CardTitle className="text-xl text-zinc-900">Comparativa Medida vs Modelo</CardTitle>
              <CardDescription>
                {result?.plots ? `Visualizando: ${result.plots[activePlotIdx]?.title}` : 'Los gráficos de ajuste aparecerán aquí.'}
              </CardDescription>
            </div>
            {result?.plots && (
              <div className="flex items-center gap-3">
                <button 
                  onClick={downloadCurrentPlot}
                  className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 gap-2 shadow-sm text-zinc-900"
                >
                  <Download className="w-4 h-4 text-primary" />
                  <span>Exportar PNG</span>
                </button>
                <div className="flex items-center bg-background rounded-lg p-1 border border-border shadow-sm">
                  <button 
                    disabled={activePlotIdx === 0} 
                    onClick={() => setActivePlotIdx(prev => prev - 1)}
                    className="p-1 hover:bg-muted rounded-md disabled:opacity-50 text-zinc-900"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="px-3 flex flex-col items-center justify-center min-w-[60px] border-x border-border/50 mx-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-tight">Vista</span>
                    <span className="text-sm font-mono font-bold leading-tight text-zinc-900">{activePlotIdx + 1} / {result.plots.length}</span>
                  </div>
                  <button 
                    disabled={activePlotIdx === result.plots.length - 1} 
                    onClick={() => setActivePlotIdx(prev => prev + 1)}
                    className="p-1 hover:bg-muted rounded-md disabled:opacity-50 text-zinc-900"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-50/50 dark:bg-zinc-950/20">
            {loading ? (
              <div className="flex flex-col items-center justify-center space-y-6 py-20">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
                <p className="font-bold text-lg text-zinc-900">Ajustando modelo RLC...</p>
              </div>
            ) : result?.plots ? (
              <div className="w-full flex-1 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-border p-4 overflow-hidden group">
                  <img 
                    key={result.plots[activePlotIdx]?.id} 
                    src={`data:image/png;base64,${result.plots[activePlotIdx]?.image}`} 
                    alt={result.plots[activePlotIdx]?.title} 
                    className="w-full h-auto object-contain max-h-[600px] rounded-lg transition-transform duration-300 group-hover:scale-[1.01]" 
                  />
                  <div className="absolute top-4 left-4">
                    <span className="bg-primary/90 text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-full uppercase shadow-lg">
                      {result.plots[activePlotIdx]?.title}
                    </span>
                  </div>
                </div>
                <div className="mt-8 flex justify-center gap-2 w-full max-w-sm mx-auto">
                  {result.plots.map((p: any, i: number) => (
                    <button 
                      key={p.id} 
                      onClick={() => setActivePlotIdx(i)} 
                      className={cn(
                        "h-1.5 flex-1 rounded-full transition-all duration-300", 
                        activePlotIdx === i ? "bg-primary" : "bg-muted hover:bg-primary/30"
                      )} 
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center space-y-6 py-20">
                <div className="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mx-auto text-muted-foreground/40 border-4 border-dashed border-muted">
                  <Activity className="w-12 h-12" />
                </div>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Sube un archivo .s2p para ver la comparativa entre la medida real y el modelo RLC extraído.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ToolShell>
  );
}