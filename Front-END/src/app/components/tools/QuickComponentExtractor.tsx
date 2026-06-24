import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { cn } from '../ui/utils';
import { Upload, FileCheck, Zap, Activity, Info, Target, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer
} from 'recharts';
import { toast } from 'sonner';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

type ExtractionQuality = 'good' | 'fair' | 'poor' | 'bad';

type QuickExtractResult = {
  freq_hz: number[];
  mag_z: number[];
  slope: number[];
  selected_mask?: boolean[];
  selected_band_hz?: [number, number] | null;
  selected_points?: number;
  nominal_value: number;
  unit: 'F' | 'H';
  srf_hz?: number | null;
  esr?: number | null;
  quality?: ExtractionQuality;
  quality_score?: number;
};

export function QuickComponentExtractor() {
  const [file, setFile] = useState<File | null>(null);
  const [componentType, setComponentType] = useState('capacitor');
  const [method, setMethod] = useState('shunt');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuickExtractResult | null>(null);

  // Server measurements library
  const [measurements, setMeasurements] = useState<{name: string, device: string, relative_path?: string}[]>([]);
  const [selectedMeasName, setSelectedMeasName] = useState<string>("");
  const [device, setDevice] = useState('NanoVNA-Izan');

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

  const formatValue = (val: number, unit: string) => {
    if (val === 0 || val < 0) return '0 ' + unit;
    
    let scale = 1;
    let prefix = '';
    
    if (unit === 'F') {
      if (val < 1e-9) { scale = 1e12; prefix = 'p'; }
      else if (val < 1e-6) { scale = 1e9; prefix = 'n'; }
      else if (val < 1e-3) { scale = 1e6; prefix = 'u'; }
      else if (val < 1) { scale = 1e3; prefix = 'm'; }
    } else if (unit === 'H') {
      if (val < 1e-6) { scale = 1e9; prefix = 'n'; }
      else if (val < 1e-3) { scale = 1e6; prefix = 'u'; }
      else if (val < 1) { scale = 1e3; prefix = 'm'; }
    }
    
    return `${(val * scale).toFixed(2)} ${prefix}${unit}`;
  };

  const formatFreq = (val: number) => {
    if (!val || val <= 0) return '0 Hz';
    if (val >= 1e9) return `${(val / 1e9).toFixed(2)} GHz`;
    if (val >= 1e6) return `${(val / 1e6).toFixed(2)} MHz`;
    if (val >= 1e3) return `${(val / 1e3).toFixed(2)} kHz`;
    return `${val.toFixed(0)} Hz`;
  };

  const formatBand = (band?: [number, number] | null) => {
    if (!band) return 'Sin ventana valida';
    return `${formatFreq(band[0])} - ${formatFreq(band[1])}`;
  };

  const qualityCopy = (quality?: ExtractionQuality) => {
    switch (quality) {
      case 'good':
        return { label: 'Buena', icon: CheckCircle2, className: 'bg-emerald-600 text-white hover:bg-emerald-700' };
      case 'fair':
        return { label: 'Aceptable', icon: Target, className: 'bg-amber-500 text-white hover:bg-amber-600' };
      case 'poor':
        return { label: 'Pobre', icon: AlertTriangle, className: 'bg-orange-600 text-white hover:bg-orange-700' };
      case 'bad':
        return { label: 'No fiable', icon: AlertTriangle, className: 'bg-red-600 text-white hover:bg-red-700' };
      default:
        return { label: 'Sin evaluar', icon: Info, className: 'bg-zinc-600 text-white hover:bg-zinc-700' };
    }
  };

  const handleAction = async (id: string) => {
    if (id === 'extract') {
      if (!file && !selectedMeasName) {
        toast.info("Por favor, selecciona un archivo Touchstone o una medición de la biblioteca.");
        return;
      }
      setLoading(true);
      try {
        const formData = new FormData();
        if (file) {
          formData.append('file', file);
        } else {
          formData.append('filename', selectedMeasName);
          formData.append('device', device);
        }
        formData.append('component_type', componentType);
        formData.append('method', method);

        const response = await fetch('http://localhost:8080/api/utils/quick-extract', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) throw new Error('Error al extraer parámetros');
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
              tool_name: 'quick_extract',
              results: {
                nominal_value: data.nominal_value,
                unit: data.unit,
                srf_hz: data.srf_hz,
                esr: data.esr,
                quality: data.quality,
                quality_score: data.quality_score,
                selected_band_hz: data.selected_band_hz,
                selected_points: data.selected_points
              }
            })
          }).catch(err => console.error("Error auto-saving quick extract analysis:", err));
        }
      } catch (error) {
        console.error(error);
        toast.error('Error: ' + error);
      } finally {
        setLoading(false);
      }
    }
  };

  const chartData = useMemo(() => {
    if (!result) return [];
    
    const dataPoints = result.freq_hz.map((f: number, i: number) => {
      const selected = Boolean(result.selected_mask?.[i]);
      return {
        freqMHz: Number((f / 1e6).toFixed(6)),
        freqHz: f,
        magZ: result.mag_z[i],
        selectedMagZ: selected ? result.mag_z[i] : null,
        slope: result.slope[i]
      };
    });
    
    // Zoom filter: only include points up to the self-resonance frequency (SRF)
    if (result.srf_hz) {
      return dataPoints.filter(dp => dp.freqHz <= result.srf_hz);
    }
    
    // Fallback: zoom to the end of the selected nominal window
    if (result.selected_mask) {
      const lastSelectedIdx = result.selected_mask.lastIndexOf(true);
      if (lastSelectedIdx !== -1) {
        const limitFreq = result.freq_hz[lastSelectedIdx];
        return dataPoints.filter(dp => dp.freqHz <= limitFreq);
      }
    }
    
    return dataPoints;
  }, [result]);

  const quality = qualityCopy(result?.quality);
  const QualityIcon = quality.icon;

  return (
    <ToolShell
      title="Extractor Rápido C/L"
      description="Extraccion robusta de C/L nominal desde la ventana pre-resonante estable de la impedancia compleja."
      actions={[
        { id: 'extract', label: loading ? 'Extrayendo...' : 'Extraer Ahora', variant: 'default' },
      ]}
      onAction={handleAction}
    >
      <div className="space-y-6 text-zinc-900">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-900">Configuración</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-900">Tipo de Componente</Label>
                <Select value={componentType} onValueChange={setComponentType}>
                  <SelectTrigger className="text-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="capacitor">Condensador (C)</SelectItem>
                    <SelectItem value="inductor">Inductor (L)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-900">Método de Medida</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="text-zinc-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shunt">Shunt-through (2-puertos)</SelectItem>
                    <SelectItem value="series">Serie (2-puertos)</SelectItem>
                    <SelectItem value="oneport">1-Puerto (S11)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-card px-2 text-muted-foreground font-black tracking-wider">Biblioteca del Servidor</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Select value={device} onValueChange={setDevice} disabled={!!file}>
                  <SelectTrigger className="h-9 text-xs text-zinc-900">
                    <SelectValue placeholder="Dispositivo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NanoVNA-Izan">NanoVNA-Izan</SelectItem>
                    <SelectItem value="NanoVNA-LAB1">NanoVNA-LAB1</SelectItem>
                    <SelectItem value="NanoVNA-LAB2">NanoVNA-LAB2</SelectItem>
                  </SelectContent>
                </Select>
                <Select 
                  value={selectedMeasName} 
                  onValueChange={(val) => { setSelectedMeasName(val); setFile(null); }} 
                  disabled={!!file}
                >
                  <SelectTrigger className="h-9 text-xs text-zinc-900">
                    <SelectValue placeholder="Medición..." />
                  </SelectTrigger>
                  <SelectContent>
                    {measurements.map((m) => (
                      <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-card px-2 text-muted-foreground font-black tracking-wider">O Subir Archivo Local</span>
                </div>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.[0]) {
                    setFile(e.dataTransfer.files[0]);
                    setSelectedMeasName("");
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-4 transition-all flex flex-col items-center justify-center gap-1 cursor-pointer",
                  isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50"
                )}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept=".s1p,.s2p" 
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setFile(e.target.files[0]);
                      setSelectedMeasName("");
                    }
                  }} 
                />
                {file ? <FileCheck className="w-6 h-6 text-green-500" /> : <Upload className="w-6 h-6 text-muted-foreground" />}
                <p className="text-xs font-medium text-zinc-900">{file ? file.name : "Suelte archivo Touchstone"}</p>
              </div>
            </CardContent>
          </Card>

          <Card className={cn("transition-all", result ? "border-primary/50 bg-primary/5" : "opacity-50")}>
            <CardHeader>
              <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-zinc-900">
                <Zap className="w-4 h-4 text-yellow-500" />
                Resultados Estimados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {result ? (
                <div className="grid grid-cols-1 gap-4">
                  <div className="p-4 bg-background rounded-lg border border-primary/20 shadow-sm">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[10px] uppercase font-black text-muted-foreground text-zinc-900">Valor Nominal Extraido</p>
                      <Badge className={quality.className}>
                        <QualityIcon className="w-3 h-3" />
                        {quality.label}
                      </Badge>
                    </div>
                    <p className="text-4xl font-mono font-black text-primary">
                      {formatValue(result.nominal_value, result.unit)}
                    </p>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Confianza {(100 * (result.quality_score ?? 0)).toFixed(0)}% - Ventana: {formatBand(result.selected_band_hz)}
                    </p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-background rounded-lg border border-border">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1 text-zinc-900">
                        <TooltipProvider>
                          <UITooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dashed border-muted-foreground/50">SRF</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              Self-Resonant Frequency — frecuencia a la que la reactancia del componente es cero.
                            </TooltipContent>
                          </UITooltip>
                        </TooltipProvider>
                      </p>
                      <p className="text-xl font-mono font-bold text-zinc-900">{formatFreq(result.srf_hz ?? 0)}</p>
                    </div>
                    <div className="p-3 bg-background rounded-lg border border-border">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1 text-zinc-900">
                        <TooltipProvider>
                          <UITooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dashed border-muted-foreground/50">ESR</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              Equivalent Series Resistance — resistencia parásita serie en la resonancia.
                            </TooltipContent>
                          </UITooltip>
                        </TooltipProvider>
                        {' '}@ SRF
                      </p>
                      <p className="text-xl font-mono font-bold text-zinc-900">{typeof result.esr === 'number' ? result.esr.toFixed(3) : 'N/A'} Ω</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-background rounded-lg border border-border">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1 text-zinc-900">Banda usada</p>
                      <p className="text-sm font-mono font-bold text-zinc-900">{formatBand(result.selected_band_hz)}</p>
                    </div>
                    <div className="p-3 bg-background rounded-lg border border-border">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1 text-zinc-900">Puntos validos</p>
                      <p className="text-sm font-mono font-bold text-zinc-900">{result.selected_points ?? 0}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-muted-foreground text-xs italic">
                  Inicie la extracción para ver resultados
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {result && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-zinc-900">
                <Activity className="w-4 h-4" />
                Analisis de Ventana Nominal
              </CardTitle>
              <CardDescription className="text-xs">
                La traza naranja marca los puntos usados para estimar el nominal.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                    <XAxis dataKey="freqMHz" type="number" scale="log" domain={['auto', 'auto']} label={{ value: 'Freq (MHz)', position: 'insideBottom', offset: -5, fontSize: 10 }} tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left" scale="log" domain={['auto', 'auto']} tick={{ fontSize: 10 }} label={{ value: '|Z| (Ω)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" domain={[-2, 2]} tick={{ fontSize: 10 }} label={{ value: 'Pendiente', angle: 90, position: 'insideRight', fontSize: 10 }} />
                    <Tooltip />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                    <Line yAxisId="left" type="monotone" dataKey="magZ" name="|Z| (Ohm)" stroke="#8884d8" dot={false} strokeWidth={2} />
                    <Line yAxisId="left" type="monotone" dataKey="selectedMagZ" name="Ventana nominal" stroke="#f97316" dot={false} strokeWidth={4} connectNulls={false} />
                    <Line yAxisId="right" type="monotone" dataKey="slope" name="Slope" stroke="#82ca9d" dot={false} strokeWidth={1.5} strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 flex items-start gap-2 p-3 bg-muted/30 rounded-lg border border-border/50">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  <strong>Metodologia:</strong> se calcula {result.unit} punto a punto desde la reactancia compleja, se descartan regiones con signo o fase incompatibles y se elige la ventana pre-resonante donde el valor es mas estable.
                  La pendiente cercana a {componentType === 'capacitor' ? '-1 (20 dB/dec)' : '+1 (20 dB/dec)'} ayuda a puntuar la ventana, pero ya no fuerza una media global.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ToolShell>
  );
}
