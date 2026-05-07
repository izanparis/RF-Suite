import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { UnitInput } from '../UnitInput';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { FREQ_UNITS, toBase } from '../../lib/units';
import { cn } from '../ui/utils';
import { Upload, FileText, RefreshCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useLanguage } from '../../lib/i18n';

export function MeasurementTool() {
  const { t } = useLanguage();
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
  const [isOnePort, setIsOnePort] = useState(false);
  const [measurementId, setMeasurementId] = useState('Medicion_VNA');
  const [device, setDevice] = useState('NanoVNA-Izan');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Calibraciones del servidor
  const [serverCalibrations, setServerCalibrations] = useState<{name: string, fmin: number, fmax: number, points: number}[]>([]);
  const [selectedCalName, setSelectedCalName] = useState<string>("");

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
      setStartV(cal.fmin.toString());
      setStartU('MHz');
      setStopV(cal.fmax.toString());
      setStopU('MHz');
      setPoints(cal.points.toString());
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

  const parseCalFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const lines = content.split('\n');
      const freqs: number[] = [];
      
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length > 0 && !line.startsWith('#') && !line.startsWith('!')) {
          const f = parseFloat(parts[0]);
          if (!isNaN(f)) freqs.push(f);
        }
      });

      if (freqs.length >= 2) {
        // Encontrar el último bloque coherente (por si hay múltiples calibraciones concatenadas)
        let startIdx = 0;
        for (let i = 1; i < freqs.length; i++) {
          if (freqs[i] < freqs[i-1]) startIdx = i;
        }
        const currentBlock = freqs.slice(startIdx);
        
        if (currentBlock.length >= 2) {
          setStartV((currentBlock[0] / 1e6).toString());
          setStartU('MHz');
          setStopV((currentBlock[currentBlock.length - 1] / 1e6).toString());
          setStopU('MHz');
          setPoints(currentBlock.length.toString());
        }
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.cal')) {
      setCalFile(file);
      setSelectedCalName("");
      parseCalFile(file); // Extraer parámetros
    } else {
      alert(t('alert.file_type'));
    }
  };

  const handleAction = async (id: string) => {
    if (id === 'check_connection') {
      try {
        const res = await fetch('http://localhost:8080/api/vna/connect');
        const data = await res.json();
        if (data.connected) {
          alert(t('alert.connect_success'));
        } else {
          alert(t('alert.connect_fail') + (data.error || ""));
        }
      } catch (e) {
        alert(t('alert.connect_error') + e);
      }
      return;
    }

    if (id === 'measure') {
      const start_hz = startHz || 0;
      const stop_hz = stopHz || 0;
      let pts = parseInt(points) || 201;

      if (pts > 1024) {
        alert("Límite de hardware excedido (máx 1024 puntos). Ajustando...");
        setPoints('1024');
        pts = 1024;
      }

      if (start_hz >= stop_hz) {
        alert(t('alert.freq_error'));
        return;
      }
      if (pts <= 0) {
        alert(t('alert.points_error'));
        return;
      }

      if (!calFile && !selectedCalName) {
        const proceed = window.confirm(t('alert.cal_warning'));
        if (!proceed) return;
      }

      setLoading(true);
      setResult(null);
      try {
        const formData = new FormData();
        formData.append('start_mhz', (start_hz / 1e6).toString());
        formData.append('stop_mhz', (stop_hz / 1e6).toString());
        formData.append('points', pts.toString());
        formData.append('is_one_port', isOnePort.toString());
        formData.append('device', device);
        
        if (calFile) {
          formData.append('cal_file', calFile);
        } else if (selectedCalName) {
          formData.append('server_cal_name', selectedCalName);
        }

        const response = await fetch('http://localhost:8080/api/vna/measurement', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Error al conectar con el NanoVNA');
        }

        const data = await response.json();
        setResult(data);
      } catch (error) {
        console.error(error);
        alert(t('alert.measure_error') + (error instanceof Error ? error.message : String(error)));
      } finally {
        setLoading(false);
      }
    }

    if (id === 'save') {
      if (!result || !result.touchstone_content) {
        alert(t('alert.no_measure'));
        return;
      }

      const ext = isOnePort ? '.s1p' : '.s2p';
      const filename = measurementId.endsWith(ext) ? measurementId : measurementId + ext;

      try {
        const res = await fetch(`http://localhost:8080/api/vna/measurement/save?device=${encodeURIComponent(device)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: filename,
            content: result.touchstone_content
          })
        });
        if (res.ok) {
          alert(`Medición guardada en el servidor (${device}): ${filename}`);
        } else {
          const err = await res.json();
          alert("Error al guardar: " + err.detail);
        }
      } catch (e) {
        alert("Error de conexión al guardar.");
      }
    }
  };

  return (
    <ToolShell
      title={t('measure.title')}
      description={t('measure.desc')}
      actions={[
        { id: 'check_connection', label: t('measure.action.check'), variant: 'secondary' },
        { id: 'measure', label: t('measure.action.measure'), variant: 'default' },
        { id: 'save', label: "Guardar Medición", variant: 'outline' },
      ]}
      onAction={handleAction}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('measure.input.title')}</CardTitle>
              <CardDescription>{t('measure.input.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Calibraciones en servidor</Label>
                  <button onClick={fetchCalibrations} className="text-muted-foreground hover:text-primary p-1">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
                <Select value={selectedCalName} onValueChange={handleCalChange}>
                  <SelectTrigger className="bg-input-background">
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
                  "relative group cursor-pointer border-2 border-dashed rounded-xl p-6 transition-all flex flex-col items-center justify-center gap-2",
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
                      const f = e.target.files[0];
                      setCalFile(f);
                      setSelectedCalName("");
                      parseCalFile(f);
                    }
                  }}
                />
                
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                  calFile ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary group-hover:bg-primary/20"
                )}>
                  {calFile ? <FileText className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                </div>

                <div className="text-center">
                  <p className="text-sm font-medium">
                    {calFile ? calFile.name : t('measure.drag.text')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('measure.drag.subtext')}
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
                    {t('measure.drag.remove')}
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1 flex flex-col">
            <CardHeader>
              <CardTitle>{t('measure.results.title')}</CardTitle>
              <CardDescription>
                {loading ? t('measure.results.loading') : result ? t('measure.results.success') : t('measure.results.idle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-[400px]">
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                  <p className="text-muted-foreground italic">{t('measure.results.communicating')}</p>
                </div>
              ) : result ? (
                <div className="space-y-4 flex-1 flex flex-col">
                  <div className="rounded-lg overflow-hidden border border-border flex-1 bg-muted/20 flex items-center justify-center">
                    <img 
                      src={`data:image/png;base64,${result.plot}`} 
                      alt="VNA Measurement Plot" 
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                  <p className="text-xs text-center text-muted-foreground">
                    {t('measure.results.completed', result.freqs.length)}
                  </p>
                </div>
              ) : (
                <div className="flex-1 rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground flex items-center justify-center">
                  {t('measure.results.placeholder')}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Dispositivo y Carpeta</CardTitle>
              <CardDescription>Selecciona el VNA que estás usando.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>VNA del Laboratorio</Label>
                <Select value={device} onValueChange={setDevice}>
                  <SelectTrigger className="bg-input-background">
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
                <Label htmlFor="measId">ID de Medición / Nombre Archivo</Label>
                <Input 
                  id="measId" 
                  value={measurementId} 
                  onChange={(e) => setMeasurementId(e.target.value)} 
                  placeholder="Ej: Antena_PCB_v1"
                  className="bg-input-background"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('measure.config.title')}</CardTitle>
              <CardDescription>{t('measure.config.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{t('measure.config.type')}</Label>
                <Select 
                  value={isOnePort ? "oneport" : "twoport"} 
                  onValueChange={(val) => setIsOnePort(val === "oneport")}
                >
                  <SelectTrigger className="bg-input-background">
                    <SelectValue placeholder={t('measure.config.type')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="twoport">{t('measure.config.two_port')}</SelectItem>
                    <SelectItem value="oneport">{t('measure.config.one_port')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <UnitInput
                  label={t('measure.config.start')}
                  value={startV}
                  unit={startU}
                  units={FREQ_UNITS}
                  onChangeValue={setStartV}
                  onChangeUnit={setStartU}
                  placeholder="1"
                  disabled={true}
                />
                <UnitInput
                  label={t('measure.config.stop')}
                  value={stopV}
                  unit={stopU}
                  units={FREQ_UNITS}
                  onChangeValue={setStopV}
                  onChangeUnit={setStopU}
                  placeholder="1000"
                  disabled={true}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label>{t('measure.config.points')}</Label>
                </div>
                <div className="grid grid-cols-12 gap-2 items-center">
                  <Input
                    className="col-span-9 bg-input-background"
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                    placeholder="401"
                    inputMode="numeric"
                    disabled={true}
                  />
                  <div className="col-span-3 h-9 w-full rounded-md border border-input bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                    Pts
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ToolShell>
  );
}
