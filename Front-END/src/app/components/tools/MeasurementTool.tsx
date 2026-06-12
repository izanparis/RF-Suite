import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { UnitInput } from '../UnitInput';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { FREQ_UNITS, toBase } from '../../lib/units';
import { cn } from '../ui/utils';
import { Upload, FileText, RefreshCw, Zap, Activity, Check, ArrowRight, Download, Wifi } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useLanguage } from '../../lib/i18n';

import { Checkbox } from '../ui/checkbox';

interface MeasurementToolProps {
  onBackToDashboard?: () => void;
}

export function MeasurementTool({ onBackToDashboard }: MeasurementToolProps) {
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
  const [isOnePort, setIsOnePort] = useState(true);
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [measurementId, setMeasurementId] = useState('Medicion_VNA');
  const [componentType, setComponentType] = useState('capacitor');
  const [averagingCount, setAveragingCount] = useState('1');
  const [smoothingWindow, setSmoothingWindow] = useState('1');
  const [device, setDevice] = useState('VNA-HP-8752A');

  const architecture = device.includes('HP') ? 'HP8752A' : device.includes('E5071C') ? 'E5071C' : 'NanoVNA';

  // E5071C specific states
  const [e5071cPort1, setE5071cPort1] = useState(1);
  const [e5071cPort2, setE5071cPort2] = useState(2);
  const [e5071cIp, setE5071cIp] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rf_e5071c_ip') || '192.168.1.12';
    }
    return '192.168.1.12';
  });
  const [e5071cAveragingCount, setE5071cAveragingCount] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rf_e5071c_averaging_count') || '16';
    }
    return '16';
  });
  const [e5071cSmoothingAperture, setE5071cSmoothingAperture] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rf_e5071c_smoothing_aperture') || '1.5';
    }
    return '1.5';
  });
  const [e5071cAveragingEnabled, setE5071cAveragingEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rf_e5071c_averaging_enabled') === 'true';
    }
    return false;
  });
  const [e5071cSmoothingEnabled, setE5071cSmoothingEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rf_e5071c_smoothing_enabled') === 'true';
    }
    return false;
  });
  const [e5071cSweepType, setE5071cSweepType] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('rf_e5071c_sweep_type') || 'LIN';
    }
    return 'LIN';
  });

  // Effects to save in localStorage
  useEffect(() => {
    localStorage.setItem('rf_e5071c_ip', e5071cIp);
  }, [e5071cIp]);
  useEffect(() => {
    localStorage.setItem('rf_e5071c_averaging_count', e5071cAveragingCount);
  }, [e5071cAveragingCount]);
  useEffect(() => {
    localStorage.setItem('rf_e5071c_smoothing_aperture', e5071cSmoothingAperture);
  }, [e5071cSmoothingAperture]);
  useEffect(() => {
    localStorage.setItem('rf_e5071c_averaging_enabled', String(e5071cAveragingEnabled));
  }, [e5071cAveragingEnabled]);
  useEffect(() => {
    localStorage.setItem('rf_e5071c_smoothing_enabled', String(e5071cSmoothingEnabled));
  }, [e5071cSmoothingEnabled]);
  useEffect(() => {
    localStorage.setItem('rf_e5071c_sweep_type', e5071cSweepType);
  }, [e5071cSweepType]);
  const componentPrefix = componentType === 'capacitor' ? 'cap' : componentType === 'inductor' ? 'ind' : 'res';
  const componentFolder = componentType === 'capacitor' ? 'Capacitores' : componentType === 'inductor' ? 'Inductores' : 'Resistencias';
  const cleanFilenamePart = (value: string, fallback: string) => {
    const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
    return cleaned || fallback;
  };
  const getTouchstoneExt = () => isOnePort ? '.s1p' : '.s2p';
  const buildNanoVnaFilename = () => {
    const fmaxMhz = stopHz ? `${Number(stopHz / 1e6).toString().replace('.', 'p')}MHz` : 'Fmax';
    return `${componentPrefix}_${cleanFilenamePart(measurementId, 'medicion')}_${cleanFilenamePart(device, 'NanoVNA')}_${fmaxMhz}${getTouchstoneExt()}`;
  };

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleReset = async () => {
    if (!window.confirm("¿Seguro que quieres reiniciar el VNA? Se perderá la configuración actual.")) return;
    setLoading(true);
    try {
      const endpoint = architecture === 'E5071C'
        ? `http://localhost:8080/api/vna/e5071c/reset?device=${encodeURIComponent(device)}`
        : `http://localhost:8080/api/vna/hp/reset?device=${encodeURIComponent(device)}`;
      const res = await fetch(endpoint, {
        method: 'POST'
      });
      if (res.ok) alert("VNA Reiniciado correctamente");
      else alert("Error al reiniciar VNA");
    } catch (e) {
      alert("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  // Calibraciones del servidor
  const [serverCalibrations, setServerCalibrations] = useState<{name: string, fmin: number, fmax: number, points: number}[]>([]);
  const [selectedCalName, setSelectedCalName] = useState<string>("");

  const [selectionMade, setSelectionMade] = useState(false);

  useEffect(() => {
    if (selectionMade) {
      fetchCalibrations();
    }
  }, [device, selectionMade]);

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

  const handleImportToVNA = async () => {
    if (architecture === 'NanoVNA') return;
    
    setLoading(true);
    try {
      let res;
      if (architecture === 'E5071C') {
        if (calFile) {
          const formData = new FormData();
          formData.append('file', calFile);
          formData.append('device', device);
          res = await fetch('http://localhost:8080/api/vna/e5071c/import_file', {
            method: 'POST',
            body: formData
          });
        } else if (selectedCalName) {
          res = await fetch('http://localhost:8080/api/vna/e5071c/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: selectedCalName, device })
          });
        } else {
          alert("Selecciona una calibración primero.");
          return;
        }
      } else {
        // HP8752A
        if (calFile) {
          const formData = new FormData();
          formData.append('file', calFile);
          formData.append('device', device);
          res = await fetch('http://localhost:8080/api/vna/hp/import_file', {
            method: 'POST',
            body: formData
          });
        } else if (selectedCalName) {
          res = await fetch('http://localhost:8080/api/vna/hp/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: selectedCalName, device })
          });
        } else {
          alert("Selecciona una calibración primero.");
          return;
        }
      }

      if (res.ok) {
        alert(t('measure.alert.import_success'));
      } else {
        let errorMsg = "Error desconocido";
        try {
          const err = await res.json();
          errorMsg = err.detail || "Error al importar";
        } catch (jsonErr) {
          // Si no es JSON, capturar el texto bruto (ej: traceback de python)
          const text = await res.text();
          errorMsg = text.substring(0, 100); // Mostrar solo el principio
        }
        throw new Error(errorMsg);
      }
    } catch (e: any) {
      alert(t('measure.alert.import_error') + e.message);
    } finally {
      setLoading(false);
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
      
      if (file.name.endsWith('.json')) {
        try {
          const data = JSON.parse(content);
          if (data.start_hz && data.stop_hz && data.points) {
            setStartV((data.start_hz / 1e6).toString());
            setStartU('MHz');
            setStopV((data.stop_hz / 1e6).toString());
            setStopU('MHz');
            setPoints(data.points.toString());
          }
        } catch (err) {
          console.error("Invalid JSON cal file");
        }
        return;
      }

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
    const isHP = architecture === 'HP8752A';
    const validExt = isHP ? '.json' : '.cal';

    if (file && (file.name.endsWith('.cal') || file.name.endsWith('.json'))) {
      setCalFile(file);
      setSelectedCalName("");
      parseCalFile(file); // Extraer parámetros
    } else {
      alert(`Tipo de archivo inválido. Se espera ${validExt}`);
    }
  };

  const handleAction = async (id: string) => {
    if (id === 'change_device') {
      setSelectionMade(false);
      return;
    }

    if (id === 'reset_vna') {
      await handleReset();
      return;
    }

    if (id === 'check_connection') {
      try {
        const queryParams = architecture === 'E5071C'
          ? `device=${encodeURIComponent(device)}&ip=${encodeURIComponent(e5071cIp)}`
          : `device=${encodeURIComponent(device)}`;
        const res = await fetch(`http://localhost:8080/api/vna/connect?${queryParams}`);
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

      const parsePointsValue = (val: string): number => {
        const clean = String(val).toLowerCase().trim();
        if (clean.endsWith('k')) {
          const num = parseFloat(clean.replace('k', ''));
          return isNaN(num) ? 201 : Math.round(num * 1000);
        }
        const parsed = parseInt(clean);
        return isNaN(parsed) ? 201 : parsed;
      };
      let pts = parsePointsValue(points) || 201;

      const maxPts = architecture === 'E5071C' ? 20001 : architecture === 'HP8752A' ? 1601 : 1024;

      if (pts > maxPts) {
        alert(`Límite de hardware excedido (máx ${maxPts} puntos). Ajustando...`);
        setPoints(maxPts.toString());
        pts = maxPts;
      }

      if (start_hz >= stop_hz) {
        alert(t('alert.freq_error'));
        return;
      }
      if (pts <= 0) {
        alert(t('alert.points_error'));
        return;
      }

      setLoading(true);
      setResult(null);
      try {
        if (architecture === 'E5071C') {
          // Aplicar la configuración de averaging y smoothing en el E5071C antes de medir
          try {
            await fetch('http://localhost:8080/api/vna/e5071c/setup', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                averaging_enabled: e5071cAveragingEnabled,
                averaging_count: parseInt(e5071cAveragingCount) || 16,
                smoothing_enabled: e5071cSmoothingEnabled,
                smoothing_aperture: parseFloat(e5071cSmoothingAperture) || 1.5,
                sweep_type: e5071cSweepType,
                device: device,
                ip_address: e5071cIp
              })
            });
          } catch (e) {
            console.warn("Error al pre-configurar setup de E5071C:", e);
          }
        }

        const formData = new FormData();
        formData.append('start_mhz', (start_hz / 1e6).toString());
        formData.append('stop_mhz', (stop_hz / 1e6).toString());
        formData.append('points', pts.toString());
        formData.append('is_one_port', isOnePort.toString());
        formData.append('device', device);
        formData.append('save_to_library', saveToLibrary.toString());
        formData.append('save_filename', measurementId);
        if (architecture === 'NanoVNA') {
          formData.append('component_type', componentType);
          formData.append('averaging_count', Math.max(1, Math.min(16, parseInt(averagingCount) || 1)).toString());
          formData.append('smoothing_window', Math.max(1, Math.min(51, parseInt(smoothingWindow) || 1)).toString());
        }
        if (architecture === 'E5071C') {
          formData.append('port1', e5071cPort1.toString());
          formData.append('port2', e5071cPort2.toString());
        }
        
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
          throw new Error(errorData.detail || 'Error al conectar con el VNA');
        }

        const data = await response.json();
        setResult(data);
        if (saveToLibrary) {
          alert(`Medición completada y guardada en la biblioteca${data.saved_filename ? `: ${data.saved_filename}` : "."}`);
        }
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

      const ext = getTouchstoneExt();
      const filename = architecture === 'NanoVNA'
        ? buildNanoVnaFilename()
        : (measurementId.endsWith(ext) ? measurementId : measurementId + ext);

      try {
        const res = await fetch(`http://localhost:8080/api/vna/measurement/save?device=${encodeURIComponent(device)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: filename,
            content: result.touchstone_content,
            component_type: architecture === 'NanoVNA' ? componentType : undefined
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

  const downloadTouchstone = () => {
    if (!result || !result.touchstone_content) return;
    const blob = new Blob([result.touchstone_content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ext = getTouchstoneExt();
    a.download = result.saved_filename || (architecture === 'NanoVNA'
      ? buildNanoVnaFilename()
      : (measurementId.endsWith(ext) ? measurementId : measurementId + ext));
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!selectionMade) {
    return (
      <div className="mx-auto max-w-[1100px] px-5 pb-4 pt-5">
        <div className="mb-3 rounded-lg border border-border bg-[var(--rf-panel)] p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight">Medicion Parametros S</h2>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
                Elige el equipo de trabajo y prepara el flujo de medicion antes de extraer parametros S.
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

        <div className="grid gap-3 md:grid-cols-[0.55fr_1.45fr]">
          <Card className="border-border/70 bg-[var(--rf-panel-soft)]">
            <CardHeader className="px-4 pb-2 pt-4">
              <CardTitle className="text-sm">Antes de medir</CardTitle>
              <CardDescription className="text-xs">Resumen rapido para elegir arquitectura y preparar la sesion.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4 text-sm">
              {[
                ['NanoVNA', 'Extraccion compacta para barridos rapidos y setups portatiles.'],
                ['E5071C', 'Analizador de alto rendimiento con calibracion SOLT y 20k puntos.'],
                ['HP 8752A', 'Medicion profesional con control GPIB y mayor trazabilidad.'],
                ['Calibracion', 'Importa desde biblioteca o archivo antes de iniciar la medida.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-md border border-border bg-card p-2">
                  <div className="text-sm font-semibold text-foreground">{title}</div>
                  <div className="mt-0.5 text-xs leading-4 text-muted-foreground">{body}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                  <p className="mt-1 max-w-[210px] text-xs text-muted-foreground leading-normal">
                    Arquitectura compacta para NanoVNA-H, H4, V2 y variantes.
                  </p>
                </div>
                <div className="grid w-full grid-cols-2 gap-1.5 text-left text-[11px] text-muted-foreground mt-auto">
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">S1P/S2P</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">1024 pts</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">USB/local</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">Rapido</span>
                </div>
                <div className="flex w-full items-center justify-between rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary mt-2">
                  Seleccionar NanoVNA
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </CardContent>
            </Card>

            <Card
              className="group relative flex min-h-[198px] cursor-pointer flex-col justify-center overflow-hidden border-2 transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:shadow-md"
              onClick={() => {
                setDevice('VNA-E5071C');
                setSelectionMade(true);
              }}
            >
              <div className="absolute right-0 top-0 p-4 opacity-10 transition-opacity group-hover:opacity-20">
                <Wifi size={72} />
              </div>
              <CardContent className="flex flex-col items-center space-y-2.5 p-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 transition-transform group-hover:scale-110">
                  <Wifi className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold uppercase tracking-tight">E5071C</h3>
                  <p className="mt-1 max-w-[210px] text-xs text-muted-foreground leading-normal">
                    Analizador ENA moderno con control IP ethernet de alta velocidad.
                  </p>
                </div>
                <div className="grid w-full grid-cols-2 gap-1.5 text-left text-[11px] text-muted-foreground mt-auto">
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">SOL/SOLT</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">20001 pts</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">TCP/IP</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">Averages</span>
                </div>
                <div className="flex w-full items-center justify-between rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary mt-2">
                  Seleccionar E5071C
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
                  <p className="mt-1 max-w-[210px] text-xs text-muted-foreground leading-normal">
                    Equipo legacy profesional con control via GPIB para laboratorio.
                  </p>
                </div>
                <div className="grid w-full grid-cols-2 gap-1.5 text-left text-[11px] text-muted-foreground mt-auto">
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">S1P/S2P</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">1601 pts</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">GPIB</span>
                  <span className="rounded border border-border bg-[var(--rf-panel-soft)] px-2 py-1">Servidor</span>
                </div>
                <div className="flex w-full items-center justify-between rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary mt-2">
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
      title={t('measure.title')}
      description={t('measure.desc')}
      actions={[
        { id: 'change_device', label: 'Cambiar Equipo', variant: 'ghost' },
        { id: 'reset_vna', label: 'Reset VNA', variant: 'outline' },
        { id: 'check_connection', label: t('measure.action.check'), variant: 'secondary' },
        { id: 'measure', label: "Iniciar Medición", variant: 'default' },
      ]}
      onAction={handleAction}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Configuración de Calibración</CardTitle>
                  <CardDescription>Importa los coeficientes para la medición.</CardDescription>
                </div>
                <div className="flex items-center gap-2 bg-muted/50 px-3 py-1 rounded-full border border-border">
                  <div className={cn("w-2 h-2 rounded-full animate-pulse", architecture === 'NanoVNA' ? "bg-blue-500" : "bg-orange-500")} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">{architecture}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Biblioteca del Servidor</Label>
                    <button onClick={fetchCalibrations} className="text-muted-foreground hover:text-primary p-1">
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                  <Select value={selectedCalName} onValueChange={handleCalChange}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Selecciona desde la biblioteca..." />
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

                <div className="space-y-2">
                  <Label className="text-xs">Importar desde Ordenador</Label>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "relative group cursor-pointer border-2 border-dashed rounded-lg p-4 transition-all flex flex-col items-center justify-center gap-1",
                      isDragging 
                        ? "border-primary bg-primary/5" 
                        : "border-border hover:border-primary/50 hover:bg-muted/50"
                    )}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept=".cal,.json"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          const f = e.target.files[0];
                          setCalFile(f);
                          setSelectedCalName("");
                          parseCalFile(f);
                        }
                      }}
                    />
                    
                    <Upload className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                    <p className="text-[10px] font-medium">
                      {calFile ? calFile.name : "Suelta o haz clic para subir"}
                    </p>
                  </div>
                </div>
                {(architecture === 'HP8752A' || architecture === 'E5071C') && (selectedCalName || calFile) && (
                  <Button 
                    onClick={handleImportToVNA} 
                    disabled={loading} 
                    className="w-full mt-2 text-xs h-8 bg-orange-600 hover:bg-orange-700 text-white font-semibold transition-colors"
                  >
                    {loading ? "Cargando..." : `Cargar Calibración en ${architecture}`}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1 flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{t('measure.results.title')}</CardTitle>
                </div>
                {result && (
                  <Button variant="outline" size="xs" onClick={downloadTouchstone} className="gap-1 h-7 text-[10px]">
                    <Download className="w-3 h-3" />
                    TOUCHSTONE
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col min-h-[350px]">
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-4">
                  <div className="relative">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
                    <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-primary animate-pulse" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold uppercase tracking-widest text-primary">Midiendo...</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Cargando calibración y extrayendo datos del VNA</p>
                  </div>
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
                  <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest">
                    {t('measure.results.completed', result.freqs.length)}
                  </p>
                </div>
              ) : (
                <div className="flex-1 rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground flex items-center justify-center text-sm italic">
                  Pulsa "Iniciar Medición" para capturar datos
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Parámetros de Medición</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">ID de Medición</Label>
                <Input 
                  value={measurementId} 
                  onChange={(e) => setMeasurementId(e.target.value)} 
                  placeholder="Ej: Antena_S11"
                  className="bg-input-background h-8 text-sm"
                />
              </div>

              {architecture === 'NanoVNA' && (
                <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Componente</Label>
                    <Select value={componentType} onValueChange={setComponentType}>
                      <SelectTrigger className="bg-input-background h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="capacitor">Condensador</SelectItem>
                        <SelectItem value="inductor">Bobina</SelectItem>
                        <SelectItem value="resistor">Resistencia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">Averaging</Label>
                      <Input
                        className="bg-input-background h-8 text-sm"
                        type="number"
                        min={1}
                        max={16}
                        value={averagingCount}
                        onChange={(e) => setAveragingCount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Smoothing</Label>
                      <Input
                        className="bg-input-background h-8 text-sm"
                        type="number"
                        min={1}
                        max={51}
                        step={2}
                        value={smoothingWindow}
                        onChange={(e) => setSmoothingWindow(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="rounded border border-border bg-background px-2 py-1.5 text-[10px] text-muted-foreground">
                    Carpeta: {componentFolder} - Archivo: {buildNanoVnaFilename()}
                  </div>
                </div>
              )}

              {architecture === 'E5071C' && (
                <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
                  <div className="space-y-2">
                    <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Dirección IP</Label>
                    <Input
                      value={e5071cIp}
                      onChange={(e) => setE5071cIp(e.target.value)}
                      placeholder="192.168.1.12"
                      disabled={loading}
                      className="bg-input-background h-8 text-sm font-mono"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Puerto 1</Label>
                      <Select 
                        value={String(e5071cPort1)} 
                        onValueChange={(v) => setE5071cPort1(parseInt(v))}
                        disabled={loading}
                      >
                        <SelectTrigger className="bg-input-background h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1,2,3,4].filter(p => p !== e5071cPort2).map(p => (
                            <SelectItem key={p} value={String(p)}>Puerto {p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Puerto 2</Label>
                      <Select 
                        value={String(e5071cPort2)} 
                        onValueChange={(v) => setE5071cPort2(parseInt(v))}
                        disabled={loading || isOnePort}
                      >
                        <SelectTrigger className="bg-input-background h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1,2,3,4].filter(p => p !== e5071cPort1).map(p => (
                            <SelectItem key={p} value={String(p)}>Puerto {p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Averaging</Label>
                        <div className="flex rounded-md bg-muted/50 p-0.5 border border-border scale-95 origin-right">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => setE5071cAveragingEnabled(false)}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] font-medium transition-all",
                              !e5071cAveragingEnabled ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            OFF
                          </button>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => {
                              setE5071cAveragingEnabled(true);
                              if (e5071cAveragingCount === '1' || !e5071cAveragingCount) {
                                setE5071cAveragingCount('16');
                              }
                            }}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] font-medium transition-all",
                              e5071cAveragingEnabled ? "bg-primary text-primary-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            ON
                          </button>
                        </div>
                      </div>
                      <Input
                        className="bg-input-background h-8 text-sm disabled:opacity-40"
                        type="number"
                        min={1}
                        max={999}
                        value={e5071cAveragingCount}
                        onChange={(e) => setE5071cAveragingCount(e.target.value)}
                        disabled={loading || !e5071cAveragingEnabled}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Smoothing</Label>
                        <div className="flex rounded-md bg-muted/50 p-0.5 border border-border scale-95 origin-right">
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => setE5071cSmoothingEnabled(false)}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] font-medium transition-all",
                              !e5071cSmoothingEnabled ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            OFF
                          </button>
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => {
                              setE5071cSmoothingEnabled(true);
                              if (e5071cSmoothingAperture === '1' || e5071cSmoothingAperture === '0' || !e5071cSmoothingAperture) {
                                setE5071cSmoothingAperture('1.5');
                              }
                            }}
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] font-medium transition-all",
                              e5071cSmoothingEnabled ? "bg-primary text-primary-foreground shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            ON
                          </button>
                        </div>
                      </div>
                      <Input
                        className="bg-input-background h-8 text-sm disabled:opacity-40"
                        type="number"
                        min={0.05}
                        max={25}
                        step={0.5}
                        value={e5071cSmoothingAperture}
                        onChange={(e) => setE5071cSmoothingAperture(e.target.value)}
                        disabled={loading || !e5071cSmoothingEnabled}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Tipo de Barrido</Label>
                    <Select 
                      value={e5071cSweepType} 
                      onValueChange={setE5071cSweepType}
                      disabled={loading}
                    >
                      <SelectTrigger className="bg-input-background h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LIN">Lineal</SelectItem>
                        <SelectItem value="LOG">Logarítmico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-2 bg-muted/30 p-2 rounded border border-border">
                <Checkbox 
                  id="save-lib" 
                  checked={saveToLibrary} 
                  onCheckedChange={(val) => setSaveToLibrary(!!val)} 
                />
                <label
                  htmlFor="save-lib"
                  className="text-xs font-medium leading-none cursor-pointer"
                >
                  Guardar automáticamente en biblioteca
                </label>
              </div>

              <div className="space-y-2 pt-2">
                <Label className="text-xs">{t('measure.config.type')}</Label>
                <Select 
                  value={isOnePort ? "oneport" : "twoport"} 
                  onValueChange={(val) => setIsOnePort(val === "oneport")}
                >
                  <SelectTrigger className="bg-input-background h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="twoport">
                      {architecture === 'NanoVNA' ? '2 Puertos' : 'Transmisión (S21)'}
                    </SelectItem>
                    <SelectItem value="oneport">
                      {architecture === 'NanoVNA' ? '1 Puerto' : 'Reflexión (S11)'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <UnitInput
                  label="Inicio"
                  value={startV}
                  unit={startU}
                  units={FREQ_UNITS}
                  onChangeValue={setStartV}
                  onChangeUnit={setStartU}
                  disabled={!!selectedCalName || !!calFile}
                />
                <UnitInput
                  label="Fin"
                  value={stopV}
                  unit={stopU}
                  units={FREQ_UNITS}
                  onChangeValue={setStopV}
                  onChangeUnit={setStopU}
                  disabled={!!selectedCalName || !!calFile}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Puntos</Label>
                <Input
                  className="bg-input-background h-8 text-sm"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  disabled={!!selectedCalName || !!calFile}
                />
              </div>

              {(selectedCalName || calFile) && (
                <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] text-blue-600 dark:text-blue-400 font-medium">
                  Los parámetros de barrido están bloqueados por el archivo de calibración seleccionado.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Información del Equipo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">VNA Activo</Label>
                <Select value={device} onValueChange={setDevice}>
                  <SelectTrigger className="bg-input-background h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NanoVNA-Izan">NanoVNA-Izan</SelectItem>
                    <SelectItem value="NanoVNA-LAB1">NanoVNA-LAB1</SelectItem>
                    <SelectItem value="NanoVNA-LAB2">NanoVNA-LAB2</SelectItem>
                    <SelectItem value="VNA-E5071C">VNA-E5071C (IP)</SelectItem>
                    <SelectItem value="VNA-HP-8752A">VNA-HP-8752A (GPIB)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ToolShell>
  );
}
