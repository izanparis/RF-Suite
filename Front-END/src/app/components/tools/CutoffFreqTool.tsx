import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { cn } from '../ui/utils';
import { Upload, FileCheck, Library, RefreshCw, Activity, Zap, LineChart as ChartIcon } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, ReferenceLine, ReferenceDot 
} from 'recharts';
import { useLanguage } from '../../lib/i18n';

export function CutoffFreqTool() {
  const { t } = useLanguage();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [searchType, setSearchType] = useState<'min' | 'max'>('min');

  const [measurements, setMeasurements] = useState<{name: string}[]>([]);
  const [selectedMeasName, setSelectedMeasName] = useState<string>("");
  const [device, setDevice] = useState('NanoVNA-Izan');

  // Transformar datos para Recharts
  const chartData = React.useMemo(() => {
    if (!result?.raw_data) return [];
    return result.raw_data.freq_hz.map((f: number, i: number) => ({
      freqMHz: f / 1e6, 
      s21: result.raw_data.s21_db[i]
    }));
  }, [result]);

  useEffect(() => {
    fetchMeasurements();
  }, [device]);

  const fetchMeasurements = async () => {
    try {
      const response = await fetch(`http://localhost:8080/api/vna/measurements?device=${encodeURIComponent(device)}`);
      if (response.ok) {
        const data = await response.json();
        setMeasurements(data);
      }
    } catch (err) {
      console.error("Error fetching measurements:", err);
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
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && (droppedFile.name.toLowerCase().endsWith('.s2p') || droppedFile.name.toLowerCase().endsWith('.s1p'))) {
      setFile(droppedFile);
      setSelectedMeasName("");
    }
  };

  const handleCalculate = async () => {
    if (!file && !selectedMeasName) {
      toast.info("Por favor, selecciona un archivo o una medición de la biblioteca.");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      let response;
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('search_type', searchType);
        response = await fetch('http://localhost:8080/api/vna/measurements/cutoff-freq', {
          method: 'POST',
          body: formData
        });
      } else {
        response = await fetch(`http://localhost:8080/api/vna/measurements/cutoff-freq-server/${encodeURIComponent(selectedMeasName)}?device=${encodeURIComponent(device)}&search_type=${searchType}`);
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Error en el cálculo");
      }
      const data = await response.json();
      setResult(data);

      // Auto-save analysis results to server
      if (selectedMeasName) {
        const matched = measurements.find((m: any) => m.name === selectedMeasName) as any;
        const relativePath = matched?.relative_path || selectedMeasName;
        fetch('http://localhost:8080/api/library/measurement/analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            measurement_relative_path: relativePath,
            tool_name: 'cutoff_freq',
            results: {
              cutoff_frequency_hz: data.cutoff_frequency_hz,
              cutoff_frequency_mhz: data.cutoff_frequency_mhz,
              value_db: data.value_db,
              search_type: searchType,
              label: data.label
            }
          })
        }).catch(err => console.error("Error auto-saving cutoff frequency analysis:", err));
      }
    } catch (error) {
      console.error(error);
      toast.error("Error: " + (error instanceof Error ? error.message : "Error al calcular la frecuencia de corte."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolShell
      title="Calculadora de Frecuencia de Corte"
      description="Determina la frecuencia de corte identificando el punto crítico (mínimo o máximo de S21) para caracterizar componentes pasivos."
      actions={[
        { id: 'calc', label: 'Calcular Corte', variant: 'default' },
      ]}
      onAction={handleCalculate}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Configuración de Análisis</CardTitle>
              <CardDescription>Selecciona el tipo de componente para el cálculo.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Tipo de Componente</Label>
                  <Select value={searchType} onValueChange={(val: any) => setSearchType(val)}>
                    <SelectTrigger className="bg-input-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="min">Condensador (Mínimo S21)</SelectItem>
                      <SelectItem value="max">Bobina / Inductor (Máximo S21)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Library className="w-5 h-5 text-primary" />
                  Biblioteca del Servidor
                </CardTitle>
                <button onClick={fetchMeasurements} className="text-muted-foreground hover:text-primary p-1">
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
              <CardDescription>Usa una medición guardada anteriormente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">VNA / Carpeta</Label>
                <Select value={device} onValueChange={setDevice}>
                  <SelectTrigger className="bg-input-background h-8 text-xs">
                    <SelectValue placeholder="Seleccionar dispositivo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NanoVNA-Izan">NanoVNA-Izan</SelectItem>
                    <SelectItem value="NanoVNA-LAB1">NanoVNA-LAB1</SelectItem>
                    <SelectItem value="NanoVNA-LAB2">NanoVNA-LAB2</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Medición</Label>
                <Select 
                  value={selectedMeasName} 
                  onValueChange={(val) => {
                    setSelectedMeasName(val);
                    setFile(null);
                  }}
                >
                  <SelectTrigger className="bg-input-background">
                    <SelectValue placeholder="Selecciona una medición..." />
                  </SelectTrigger>
                  <SelectContent>
                    {measurements.map((m) => (
                      <SelectItem key={m.name} value={m.name}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Subir Archivo Local</CardTitle>
              <CardDescription>Arrastra un archivo .s2p para analizar.</CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative group cursor-pointer border-2 border-dashed rounded-xl p-6 transition-all flex flex-col items-center justify-center gap-2 text-center",
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
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setFile(e.target.files[0]);
                      setSelectedMeasName("");
                    }
                  }}
                />
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                  file ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary group-hover:bg-primary/20"
                )}>
                  {file ? <FileCheck className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                </div>
                <div>
                  <p className="text-xs font-medium">{file ? file.name : "Haz clic o arrastra aquí"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Resultado del Análisis
            </CardTitle>
            <CardDescription>
              {result ? `Frecuencia detectada para el ${result.label}.` : "Los resultados aparecerán aquí."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center">
            {loading ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="text-muted-foreground italic">Procesando datos RF...</p>
              </div>
            ) : result ? (
              <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground uppercase font-black tracking-widest">{result.label}</p>
                  <div className="text-5xl font-black text-primary tracking-tight">
                    {result.cutoff_frequency_mhz.toFixed(3)} <span className="text-2xl ml-1 text-muted-foreground">MHz</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-muted/30 p-4 rounded-xl border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Valor S21 (dB)</p>
                    <p className="text-xl font-mono font-bold text-foreground">{result.value_db.toFixed(2)} dB</p>
                  </div>
                  <div className="bg-muted/30 p-4 rounded-xl border border-border">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold">Frecuencia (Hz)</p>
                    <p className="text-xl font-mono font-bold text-foreground">{(result.cutoff_frequency_hz / 1e3).toFixed(0)} kHz</p>
                  </div>
                </div>

                <div className="w-full h-[280px] bg-background rounded-xl border border-border p-4 shadow-inner">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ChartIcon className="w-3 h-3 text-primary" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Magnitud S21 (dB)</span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground))" opacity={0.1} />
                      <XAxis 
                        dataKey="freqMHz" 
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        fontSize={10} 
                        tick={{fill: 'hsl(var(--muted-foreground))'}} 
                        tickFormatter={(val) => val.toFixed(0)}
                      />
                      <YAxis 
                        fontSize={10} 
                        tick={{fill: 'hsl(var(--muted-foreground))'}} 
                        domain={['auto', 'auto']}
                      />
                      <Tooltip 
                        contentStyle={{ fontSize: '10px', borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }}
                        labelFormatter={(val) => `${val.toFixed(2)} MHz`}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="s21" 
                        stroke="#3b82f6" 
                        strokeWidth={3} 
                        dot={false} 
                        isAnimationActive={false}
                        connectNulls={true}
                      />
                      <ReferenceLine 
                        x={result.cutoff_frequency_mhz} 
                        stroke="#ef4444" 
                        strokeDasharray="3 3" 
                        label={{ position: 'top', value: 'Punto', fontSize: 10, fill: '#ef4444', fontWeight: 'bold' }}
                      />
                      <ReferenceDot 
                        x={result.cutoff_frequency_mhz} 
                        y={result.value_db} 
                        r={6} 
                        fill="#ef4444" 
                        stroke="#fff" 
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-4 py-12 opacity-50">
                <Activity className="w-16 h-16 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground max-w-[200px]">Carga una medida (.s2p) y pulsa calcular para ver los resultados.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ToolShell>
  );
}


