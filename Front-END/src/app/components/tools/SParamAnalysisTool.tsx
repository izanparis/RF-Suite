import React, { useState, useRef, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { OutputPickerPro } from '../OutputPickerPro';
import { cn } from '../ui/utils';
import { Upload, FileCheck, ChevronLeft, ChevronRight, Download, Activity, BarChart3, LineChart as ChartIcon, X, Trash2, GripHorizontal, Library, RefreshCw, Loader2, Tag, CheckCircle2, XCircle } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  Legend, ResponsiveContainer, Brush, ReferenceLine, ReferenceDot 
} from 'recharts';
import type { DirectoryHandle } from '../../lib/fsAccess';
import { useLanguage } from '../../lib/i18n';

interface SParamAnalysisToolProps {
  initialFile?: { name: string, device?: string, componentType?: string | null } | null;
  onFileProcessed?: () => void;
}

export function SParamAnalysisTool({ initialFile, onFileProcessed }: SParamAnalysisToolProps) {
  const { t } = useLanguage();
  const [s2pFile, setS2pFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [outName, setOutName] = useState('');
  const [outDir, setOutDir] = useState<DirectoryHandle | null>(null);

  const [loading, setLoading] = useState(false);
  const [activePlotIdx, setActivePlotIdx] = useState(0);
  const [markers, setMarkers] = useState<any[]>([]);
  const [rfMarkers, setRfMarkers] = useState<{ markers: Record<string, any>; display: any[]; summary: string } | null>(null);
  const [rfMarkersLoading, setRfMarkersLoading] = useState(false);
  const [currentRelPath, setCurrentRelPath] = useState<string | null>(null);

  interface ComparisonTrace {
    id: string;
    name: string;
    data: any;
    plots: any[];
    summary: any;
    zip_content: string;
    color: string;
    visible: boolean;
  }

  const [traces, setTraces] = useState<ComparisonTrace[]>([]);
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'individual' | 'comparison'>('individual');
  const [comparisonParam, setComparisonParam] = useState<'s11' | 's21' | 'phase11' | 'phase21' | 'vswr' | 'zmag_series' | 'zmag_shunt' | 'zmag'>('s11');

  const activeTrace = useMemo(() => {
    return traces.find(t => t.id === activeTraceId) || null;
  }, [traces, activeTraceId]);

  const result = useMemo(() => {
    return activeTrace ? {
      data: activeTrace.data,
      plots: activeTrace.plots,
      summary: activeTrace.summary,
      zip_content: activeTrace.zip_content
    } : null;
  }, [activeTrace]);

  const addTrace = (name: string, apiResult: any) => {
    const newId = Math.random().toString(36).substring(2, 9);
    const presetColors = [
      '#3b82f6', // blue
      '#ef4444', // red
      '#10b981', // green
      '#a855f7', // purple
      '#f59e0b', // amber
      '#06b6d4', // cyan
      '#ec4899', // pink
      '#14b8a6', // teal
    ];
    const newColor = presetColors[traces.length % presetColors.length];
    const newTrace: ComparisonTrace = {
      id: newId,
      name,
      data: apiResult.data,
      plots: apiResult.plots,
      summary: apiResult.summary,
      zip_content: apiResult.zip_content,
      color: newColor,
      visible: true
    };
    
    setTraces(prev => [...prev, newTrace]);
    setActiveTraceId(newId);
    setViewMode('individual');
  };

  const removeTrace = (id: string) => {
    setTraces(prev => {
      const next = prev.filter(t => t.id !== id);
      if (activeTraceId === id) {
        setActiveTraceId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  };

  const cycleColor = (id: string) => {
    const presetColors = ['#3b82f6', '#ef4444', '#10b981', '#a855f7', '#f59e0b', '#06b6d4', '#ec4899', '#14b8a6'];
    setTraces(prev => prev.map(t => {
      if (t.id === id) {
        const currIdx = presetColors.indexOf(t.color);
        const nextColor = presetColors[(currIdx + 1) % presetColors.length];
        return { ...t, color: nextColor };
      }
      return t;
    }));
  };

  // Biblioteca de mediciones del servidor
  const [measurements, setMeasurements] = useState<{name: string, size: number, mtime: number, component_type?: string | null}[]>([]);
  const [selectedMeasName, setSelectedMeasName] = useState<string>("");
  const [device, setDevice] = useState('NanoVNA-Izan');
  const [componentFilter, setComponentFilter] = useState('all');
  
  // Dragging state for the markers panel
  const [panelPos, setPanelPos] = useState({ x: 24, y: 64 }); // Initial relative to top-right
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    fetchMeasurements();
  }, [device, componentFilter]);

  // Manejar archivo inicial proveniente de la biblioteca
  useEffect(() => {
    if (initialFile) {
      if (initialFile.device) {
        setDevice(initialFile.device);
      }
      if (initialFile.componentType) {
        setComponentFilter(initialFile.componentType);
      }
      handleMeasSelect(initialFile.name, initialFile.device, initialFile.componentType);
      
      if (onFileProcessed) {
        onFileProcessed();
      }
    }
  }, [initialFile]);

  const fetchMeasurements = async () => {
    try {
      const componentParam = componentFilter !== 'all' ? `&component_type=${encodeURIComponent(componentFilter)}` : '';
      const response = await fetch(`http://localhost:8080/api/vna/measurements?device=${encodeURIComponent(device)}${componentParam}`);
      if (response.ok) {
        const data = await response.json();
        setMeasurements(data);
      }
    } catch (err) {
      console.error("Error fetching measurements:", err);
    }
  };

  const handleMeasSelect = async (val: string, customDevice?: string, customComponent?: string | null) => {
    setSelectedMeasName(val);
    if (!val) return;

    setLoading(true);
    setActivePlotIdx(0);
    setMarkers([]);
    setS2pFile(null); // Quitar archivo local si se elige biblioteca

    const targetDevice = customDevice || device;
    const targetComponent = customComponent || measurements.find(m => m.name === val)?.component_type || (componentFilter !== 'all' ? componentFilter : null);

    try {
      const componentParam = targetComponent ? `&component_type=${encodeURIComponent(targetComponent)}` : '';
      const response = await fetch(`http://localhost:8080/api/vna/measurements/analyze/${encodeURIComponent(val)}?device=${encodeURIComponent(targetDevice)}${componentParam}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Error al analizar la medición del servidor');
      }
      const data = await response.json();
      addTrace(val, data);

      // Auto-save analysis results to server
      const matched = measurements.find(m => m.name === val) as any;
      const relativePath = matched?.relative_path || val;
      setCurrentRelPath(relativePath);
      fetch('http://localhost:8080/api/library/measurement/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          measurement_relative_path: relativePath,
          tool_name: 's_params',
          results: {
            summary: data.summary,
            plots: data.plots.map((p: any) => ({ id: p.id, title: p.title, image: p.image }))
          }
        })
      }).catch(err => console.error("Error auto-saving S-params analysis:", err));

      // Auto-detect RF markers
      setRfMarkersLoading(true);
      setRfMarkers(null);
      fetch('http://localhost:8080/api/markers/detect-path', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: relativePath, component_type: targetComponent || '', topology: 'shunt' })
      }).then(r => r.json()).then(d => setRfMarkers(d)).catch(() => {}).finally(() => setRfMarkersLoading(false));
    } catch (error) {
      console.error(error);
      toast.error('Error: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  const onMouseDown = (e: React.MouseEvent) => {
    setIsDraggingPanel(true);
    dragStartPos.current = {
      x: e.clientX - panelPos.x,
      y: e.clientY - panelPos.y
    };
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingPanel) return;
      setPanelPos({
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y
      });
    };
    const onMouseUp = () => setIsDraggingPanel(false);

    if (isDraggingPanel) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingPanel]);

  // Transform backend data for Recharts
  const chartData = useMemo(() => {
    if (!result?.data) return [];
    const hasS21 = result.data.n_ports >= 2;
    return result.data.freq_hz.map((f: number, i: number) => {
      const entry: any = {
        freqMHz: Number((f / 1e6).toFixed(2)),
        s11: result.data.s11_db[i],
        phase11: result.data.s11_phase[i],
        vswr: result.data.vswr[i],
        zMag: result.data.z_mag ? result.data.z_mag[i] : null,
        zMagShunt: result.data.z_mag_shunt ? result.data.z_mag_shunt[i] : null,
      };
      if (hasS21 && result.data.s21_db) {
        entry.s21 = result.data.s21_db[i];
        entry.phase21 = result.data.s21_phase[i];
      }
      return entry;
    });
  }, [result]);

  const minZMag = useMemo(() => {
    if (!result?.data?.z_mag) return null;
    const vals = result.data.z_mag.filter((v: number) => v !== null && isFinite(v));
    return vals.length ? Math.min(...vals) : null;
  }, [result]);

  const minZMagShunt = useMemo(() => {
    if (!result?.data?.z_mag_shunt) return null;
    const vals = result.data.z_mag_shunt.filter((v: number) => v !== null && isFinite(v));
    return vals.length ? Math.min(...vals) : null;
  }, [result]);

  // Merge multiple frequency vectors for Recharts comparison
  const mergedData = useMemo(() => {
    if (traces.length === 0) return [];
    
    // Collect unique frequencies and sort them
    const freqSet = new Set<number>();
    traces.forEach(t => {
      if (t.visible) {
        t.data.freq_hz.forEach((f: number) => freqSet.add(f));
      }
    });
    const sortedFreqs = Array.from(freqSet).sort((a, b) => a - b);
    
    return sortedFreqs.map(f => {
      const entry: any = {
        freqMHz: Number((f / 1e6).toFixed(6)),
        freqHz: f,
      };
      traces.forEach(t => {
        if (t.visible) {
          // Find frequency point within 1 Hz tolerance
          const idx = t.data.freq_hz.findIndex((tf: number) => Math.abs(tf - f) < 1.0);
          if (idx !== -1) {
            entry[`${t.id}_s11`] = t.data.s11_db[idx];
            entry[`${t.id}_phase11`] = t.data.s11_phase[idx];
            entry[`${t.id}_vswr`] = t.data.vswr[idx];
            entry[`${t.id}_zMag`] = t.data.z_mag ? t.data.z_mag[idx] : null;
            if (t.data.n_ports >= 2) {
              if (t.data.s21_db) {
                entry[`${t.id}_s21`] = t.data.s21_db[idx];
                entry[`${t.id}_phase21`] = t.data.s21_phase[idx];
              }
              if (t.data.z_mag_shunt) {
                entry[`${t.id}_zMagShunt`] = t.data.z_mag_shunt[idx];
              }
            }
          }
        }
      });
      return entry;
    });
  }, [traces]);

  const hasAnyS21 = useMemo(() => {
    return traces.some(t => t.visible && t.data.n_ports >= 2);
  }, [traces]);

  const handleChartClick = (state: any) => {
    if (state && state.activePayload) {
      const dataPoint = state.activePayload[0].payload;
      if (!markers.find(m => m.freqMHz === dataPoint.freqMHz)) {
        if (markers.length >= 5) {
          setMarkers([...markers.slice(1), dataPoint]);
        } else {
          setMarkers([...markers, dataPoint]);
        }
      } else {
        setMarkers(markers.filter(m => m.freqMHz !== dataPoint.freqMHz));
      }
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
    if (file && (file.name.toLowerCase().endsWith('.s2p') || file.name.toLowerCase().endsWith('.s1p') || file.name.toLowerCase().endsWith('.ts'))) {
      setS2pFile(file);
      setSelectedMeasName("");
    } else {
      toast.info(t('sparam.alert.file_type'));
    }
  };

  const handleAction = async (id: string) => {
    if (id === 'analyze') {
      if (!s2pFile) {
        toast.info(t('sparam.alert.no_file'));
        return;
      }

      setLoading(true);
      setActivePlotIdx(0);
      setMarkers([]);
      try {
        const formData = new FormData();
        formData.append('file', s2pFile);

        const response = await fetch('http://localhost:8080/api/s-params/s2p', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Error en la respuesta del servidor');
        }

        const data = await response.json();
        addTrace(s2pFile.name, data);
      } catch (error) {
        console.error(error);
        toast.error(t('sparam.alert.error_analyze') + (error instanceof Error ? error.message : String(error)));
      } finally {
        setLoading(false);
      }
    }

    if (id === 'report') {
      if (!result || !result.zip_content) {
        toast.info(t('sparam.alert.no_data'));
        return;
      }
      try {
        const { saveBase64File } = await import('../../lib/fsAccess');
        let filename = outName || 'analisis_completo';
        if (!filename.toLowerCase().endsWith('.zip')) {
          filename += '.zip';
        }

        await saveBase64File(outDir, filename, result.zip_content);
        toast.success(t('sparam.alert.export_success'));
      } catch (e) {
        toast.error(t('sparam.alert.export_error') + e);
      }
    }
  };

  const downloadCurrentPlot = () => {
    const plot = result.plots[activePlotIdx];
    const link = document.createElement('a');
    link.href = `data:image/svg+xml;base64,${plot.image}`;
    link.download = `${plot.id}_plot.svg`;
    link.click();
  };

  const renderComparisonChart = () => {
    const visibleTraces = traces.filter(t => t.visible);
    if (visibleTraces.length === 0) {
      return (
        <div className="h-[400px] w-full flex flex-col items-center justify-center text-muted-foreground text-xs italic bg-white dark:bg-zinc-950/50 rounded-xl border border-border shadow-inner">
          <Activity className="w-8 h-8 opacity-30 animate-pulse mb-2" />
          Habilita al menos una traza en el panel lateral para visualizarla en el gráfico.
        </div>
      );
    }
    
    const isLogZ = ['zmag_series', 'zmag_shunt'].includes(comparisonParam);
    
    // Parameter display details
    let yLabel = '';
    if (comparisonParam === 's11') yLabel = 'S11 Magnitude (dB)';
    else if (comparisonParam === 's21') yLabel = 'S21 Magnitude (dB)';
    else if (comparisonParam === 'phase11') yLabel = 'S11 Phase (degrees)';
    else if (comparisonParam === 'phase21') yLabel = 'S21 Phase (degrees)';
    else if (comparisonParam === 'vswr') yLabel = 'VSWR';
    else if (comparisonParam === 'zmag_series') yLabel = 'Series Impedance |Z_series| (Ohm)';
    else if (comparisonParam === 'zmag_shunt') yLabel = 'Shunt Impedance |Z_shunt| (Ohm)';

    return (
      <div className="w-full h-[500px] bg-white dark:bg-zinc-950/50 rounded-xl p-4 border border-border shadow-inner animate-in fade-in zoom-in duration-300 relative group/chart">
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 text-center">
          <h3 className="text-xs font-black text-primary uppercase tracking-[0.25em]">{yLabel}</h3>
        </div>
        
        <ResponsiveContainer width="100%" height="100%">
          <LineChart 
            data={mergedData} 
            margin={{ top: 50, right: 30, left: 30, bottom: 30 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#888888" opacity={0.1} vertical={false} />
            <XAxis 
              dataKey="freqMHz" 
              type={isLogZ ? "number" : "category"}
              scale={isLogZ ? "log" : "auto"}
              domain={isLogZ ? ['dataMin', 'dataMax'] : undefined}
              tickFormatter={(val) => {
                return typeof val === 'number' ? val.toFixed(2) : val;
              }}
              tick={{fontSize: 11, fill: '#666', fontWeight: 500}}
              minTickGap={isLogZ ? 30 : 60}
              label={{
                value: 'Frequency (MHz)', 
                position: 'insideBottom', 
                offset: -15, 
                fontSize: 13, 
                fontWeight: 'bold',
                fill: '#333'
              }}
            />
            <YAxis 
              tick={{fontSize: 11, fill: '#666', fontWeight: 500}}
              domain={isLogZ ? [0.1, 'auto'] : ['auto', 'auto']}
              scale={isLogZ ? 'log' : 'auto'}
              tickFormatter={(val) => {
                if (!isLogZ) return val;
                if (val >= 1000) return `${(val/1000).toFixed(1)}k`;
                if (val < 1 && val > 0) return val.toFixed(1);
                return Math.round(val).toString();
              }}
              label={{
                value: isLogZ ? 'Impedance' : yLabel, 
                angle: -90, 
                position: 'insideLeft', 
                offset: -5,
                fontSize: 13, 
                fontWeight: 'bold',
                fill: '#333'
              }}
            />
            <Tooltip 
              contentStyle={{
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                border: '1px solid #cbd5e1', 
                boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
                fontSize: '11px'
              }}
              labelFormatter={(val) => `${val} MHz`}
              cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Legend 
              verticalAlign="bottom" 
              align="center" 
              iconSize={8}
              wrapperStyle={{
                padding: '4px 8px',
                fontSize: '10px',
                fontWeight: 'bold',
                bottom: 0,
                width: '100%'
              }}
            />
            
            {visibleTraces.map(t => {
              let dataKey = `${t.id}_s11`;
              if (comparisonParam === 's21') dataKey = `${t.id}_s21`;
              else if (comparisonParam === 'phase11') dataKey = `${t.id}_phase11`;
              else if (comparisonParam === 'phase21') dataKey = `${t.id}_phase21`;
              else if (comparisonParam === 'vswr') dataKey = `${t.id}_vswr`;
              else if (comparisonParam === 'zmag_series') dataKey = `${t.id}_zMag`;
              else if (comparisonParam === 'zmag_shunt') dataKey = `${t.id}_zMagShunt`;
              
              if (comparisonParam === 's21' && t.data.n_ports < 2) return null;
              if (comparisonParam === 'phase21' && t.data.n_ports < 2) return null;
              if (comparisonParam === 'zmag_shunt' && (t.data.n_ports < 2 || !t.data.z_mag_shunt)) return null;
              
              return (
                <Line
                  key={t.id}
                  type="monotone"
                  dataKey={dataKey}
                  name={t.name}
                  stroke={t.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={true}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderActiveChart = () => {
    if (!result) return null;
    const currentPlot = result.plots[activePlotIdx];
    const hasS21 = result.data.n_ports >= 2;
    const p1 = result.data.port1 ?? 1;
    const p2 = result.data.port2 ?? 2;
    const phase11Name = result.data.port1 !== undefined ? `S${p1}${p1} Phase` : 'S11 Phase';
    const phase21Name = result.data.port2 !== undefined ? `S${p2}${p1} Phase` : 'S21 Phase';
    const isZPlot = ['zmag_series', 'zmag_shunt', 'zmag'].includes(currentPlot.id);

    if (['s11', 's21', 'phase', 'zmag_series', 'zmag_shunt', 'zmag'].includes(currentPlot.id)) {
      return (
        <div className="w-full h-[500px] bg-white dark:bg-zinc-950/50 rounded-xl p-4 border border-border shadow-inner animate-in fade-in zoom-in duration-300 relative group/chart">
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10 text-center">
            <h3 className="text-sm font-black text-primary uppercase tracking-[0.3em]">{currentPlot.title}</h3>
          </div>
          
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={chartData} 
              margin={{ top: 50, right: 30, left: 30, bottom: 30 }}
              onClick={handleChartClick}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#888888" opacity={0.1} vertical={false} />
              <XAxis 
                dataKey="freqMHz" 
                type={isZPlot ? "number" : "category"}
                scale={isZPlot ? "log" : "auto"}
                domain={isZPlot ? ['dataMin', 'dataMax'] : undefined}
                tickFormatter={(val) => {
                  return typeof val === 'number' ? val.toFixed(2) : val;
                }}
                tick={{fontSize: 11, fill: '#666', fontWeight: 500}}
                minTickGap={isZPlot ? 30 : 60}
                label={{
                  value: 'Frequency (MHz)', 
                  position: 'insideBottom', 
                  offset: -15, 
                  fontSize: 13, 
                  fontWeight: 'bold',
                  fill: '#333'
                }}
              />
              <YAxis 
                tick={{fontSize: 11, fill: '#666', fontWeight: 500}}
                domain={isZPlot ? [0.1, 'auto'] : ['auto', 'auto']}
                scale={isZPlot ? 'log' : 'auto'}
                tickFormatter={(val) => {
                  if (!isZPlot) return val;
                  if (val >= 1000) return `${(val/1000).toFixed(1)}k`;
                  if (val < 1 && val > 0) return val.toFixed(1);
                  return Math.round(val).toString();
                }}
                label={{
                  value: isZPlot ? 'Impedance' : currentPlot.title.toUpperCase(), 
                  angle: -90, 
                  position: 'insideLeft', 
                  offset: -5,
                  fontSize: 13, 
                  fontWeight: 'bold',
                  fill: '#333'
                }}
              />
              <Tooltip 
                contentStyle={{
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.98)',
                  border: '1px solid #94a3b8', 
                  boxShadow: '0 4px 12px -2px rgb(0 0 0 / 0.15)',
                  fontSize: '12px'
                }}
                labelFormatter={(val) => `${val} MHz`}
                cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3' }}
              />
              <Legend 
                verticalAlign="bottom" 
                align="right" 
                iconSize={10}
                wrapperStyle={{
                  padding: '6px 10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  bottom: 120,
                  right: 40,
                  width: 'fit-content',
                  maxWidth: '140px'
                }}
              />
              
              {currentPlot.id === 's11' && (
                <>
                  <Line type="monotone" dataKey="s11" name={`S${p1}{p1}`} stroke="#3b82f6" strokeWidth={2.5} dot={false} isAnimationActive={false} activeDot={{ r: 5 }} />
                  {markers.map((m, i) => (
                    <React.Fragment key={i}>
                      <ReferenceLine x={m.freqMHz} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'top', value: `M${i+1}`, fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                      <ReferenceDot x={m.freqMHz} y={m.s11} r={4} fill="#3b82f6" stroke="white" />
                    </React.Fragment>
                  ))}
                </>
              )}
              {currentPlot.id === 's21' && hasS21 && (
                <>
                  <Line type="monotone" dataKey="s21" name={`S${p2}{p1}`} stroke="#ef4444" strokeWidth={2.5} dot={false} isAnimationActive={false} activeDot={{ r: 5 }} />
                  {markers.map((m, i) => (
                    <React.Fragment key={i}>
                      <ReferenceLine x={m.freqMHz} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'top', value: `M${i+1}`, fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                      <ReferenceDot x={m.freqMHz} y={m.s21} r={4} fill="#ef4444" stroke="white" />
                    </React.Fragment>
                  ))}
                </>
              )}
              {currentPlot.id === 'phase' && (
                <>
                  <Line type="monotone" dataKey="phase11" name={phase11Name} stroke="#3b82f6" strokeWidth={2.5} dot={false} isAnimationActive={false} activeDot={{ r: 5 }} />
                  {hasS21 && <Line type="monotone" dataKey="phase21" name={phase21Name} stroke="#ef4444" strokeWidth={2.5} dot={false} isAnimationActive={false} activeDot={{ r: 5 }} />}
                  {markers.map((m, i) => (
                    <React.Fragment key={i}>
                      <ReferenceLine x={m.freqMHz} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'top', value: `M${i+1}`, fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                      <ReferenceDot x={m.freqMHz} y={m.phase11} r={4} fill="#3b82f6" stroke="white" />
                      {hasS21 && <ReferenceDot x={m.freqMHz} y={m.phase21} r={4} fill="#ef4444" stroke="white" />}
                    </React.Fragment>
                  ))}
                </>
              )}
              {['zmag', 'zmag_series'].includes(currentPlot.id) && (
                <>
                  <Line type="monotone" dataKey="zMag" name={result.data.n_ports === 1 ? "|Z_in|" : "|Z_series|"} stroke="#a855f7" strokeWidth={2.5} dot={false} isAnimationActive={false} activeDot={{ r: 5 }} />
                  {minZMag !== null && (
                    <ReferenceLine 
                      y={minZMag} 
                      stroke="black" 
                      label={{ value: "ESR", fill: "black", position: "top", fontSize: 11, fontWeight: 'bold' }} 
                    />
                  )}
                  {markers.map((m, i) => (
                    <React.Fragment key={i}>
                      <ReferenceLine x={m.freqMHz} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'top', value: `M${i+1}`, fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                      <ReferenceDot x={m.freqMHz} y={m.zMag} r={4} fill="#a855f7" stroke="white" />
                    </React.Fragment>
                  ))}
                </>
              )}
              {currentPlot.id === 'zmag_shunt' && (
                <>
                  <Line type="monotone" dataKey="zMagShunt" name="|Z_shunt|" stroke="#92400e" strokeWidth={2.5} dot={false} isAnimationActive={false} activeDot={{ r: 5 }} />
                  {minZMagShunt !== null && (
                    <ReferenceLine 
                      y={minZMagShunt} 
                      stroke="black" 
                      label={{ value: "ESR", fill: "black", position: "top", fontSize: 11, fontWeight: 'bold' }} 
                    />
                  )}
                  {markers.map((m, i) => (
                    <React.Fragment key={i}>
                      <ReferenceLine x={m.freqMHz} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'top', value: `M${i+1}`, fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                      <ReferenceDot x={m.freqMHz} y={m.zMagShunt} r={4} fill="#92400e" stroke="white" />
                    </React.Fragment>
                  ))}
                </>
              )}
            </LineChart>
          </ResponsiveContainer>

          {markers.length > 0 && (
            <div 
              style={{ top: panelPos.y, left: panelPos.x }}
              className="absolute z-20 space-y-2 w-[160px]"
            >
              <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div 
                  onMouseDown={onMouseDown}
                  className="flex items-center justify-between bg-muted/50 px-2 py-1.5 cursor-grab active:cursor-grabbing border-b border-border/50 group"
                >
                  <div className="flex items-center gap-1.5">
                    <GripHorizontal className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-[9px] font-black uppercase text-muted-foreground tracking-wider">Markers</span>
                  </div>
                  <button 
                    onClick={() => setMarkers([])} 
                    className="p-0.5 hover:bg-destructive/10 hover:text-destructive rounded transition-all"
                    title="Limpiar todos"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>

                <div className="p-1.5 space-y-1.5 max-h-[250px] overflow-y-auto pr-1 custom-scrollbar">
                  {markers.map((m, i) => (
                    <div 
                      key={i} 
                      className="text-[9px] p-1.5 rounded-md bg-zinc-50 dark:bg-zinc-800/50 border border-border/50 group/item relative"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-primary px-1 py-0.5 bg-primary/10 rounded">M{i+1}</span>
                        <button 
                          onClick={() => setMarkers(markers.filter(curr => curr.freqMHz !== m.freqMHz))}
                          className="opacity-0 group-hover/item:opacity-100 p-0.5 hover:bg-destructive/10 hover:text-destructive rounded transition-all"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                      
                      <div className="space-y-0.5">
                        <div className="flex justify-between text-muted-foreground">
                          <span>Freq:</span>
                          <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100">{m.freqMHz}</span>
                        </div>
                        
                        {(currentPlot.id === 's11' || currentPlot.id === 's21') && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-blue-500">{`S${p1}${p1}:`}</span>
                              <span className="font-mono font-bold">{m.s11.toFixed(2)}</span>
                            </div>
                            {hasS21 && (
                              <div className="flex justify-between">
                                <span className="text-red-500">{`S${p2}${p1}:`}</span>
                                <span className="font-mono font-bold">{m.s21.toFixed(2)}</span>
                              </div>
                            )}
                          </>
                        )}
                        
                        {currentPlot.id === 'phase' && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-blue-500">{`P${p1}${p1}:`}</span>
                              <span className="font-mono font-bold">{m.phase11.toFixed(1)}°</span>
                            </div>
                            {hasS21 && (
                              <div className="flex justify-between">
                                <span className="text-red-500">{`P${p2}${p1}:`}</span>
                                <span className="font-mono font-bold">{m.phase21.toFixed(1)}°</span>
                              </div>
                            )}
                          </>
                        )}
                        
                        {['zmag', 'zmag_series'].includes(currentPlot.id) && (
                          <div className="flex justify-between">
                            <span className="text-purple-500">{result.data.n_ports === 1 ? '|Z_in|:' : '|Z_ser|:'}</span>
                            <span className="font-mono font-bold">{m.zMag ? m.zMag.toFixed(2) : '-'} Ω</span>
                          </div>
                        )}
                        {currentPlot.id === 'zmag_shunt' && (
                          <div className="flex justify-between">
                            <span className="text-amber-700">|Z_par|:</span>
                            <span className="font-mono font-bold">{m.zMagShunt ? m.zMagShunt.toFixed(2) : '-'} Ω</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-border p-4 overflow-hidden group animate-in fade-in zoom-in duration-300">
        <img 
          key={currentPlot.id}
          src={`data:image/svg+xml;base64,${currentPlot.image}`} 
          alt={currentPlot.title} 
          className="w-full h-auto object-contain max-h-[600px] rounded-lg"
        />
        <div className="absolute top-4 left-4">
          <span className="bg-primary/90 text-primary-foreground text-[10px] font-bold px-3 py-1 rounded-full uppercase shadow-lg">
            {currentPlot.title}
          </span>
        </div>
      </div>
    );
  };

  return (
    <ToolShell
      title={t('sparam.title')}
      description={t('sparam.desc')}
      actions={[
        { id: 'analyze', label: t('sparam.action.analyze'), variant: 'default' },
        { id: 'report', label: t('sparam.action.report'), variant: 'outline' },
      ]}
      onAction={handleAction}
    >
      <div className="space-y-6 text-zinc-900">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Column 1: Inputs */}
          <div className="space-y-6">
            <Card className="flex flex-col">
              <CardHeader className="pb-3 text-zinc-900">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Library className="w-5 h-5 text-primary" />
                    Biblioteca
                  </CardTitle>
                  <button onClick={fetchMeasurements} className="text-muted-foreground hover:text-primary p-1">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
                <CardDescription>Mediciones guardadas en el servidor.</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
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
                   <Label className="text-[10px] uppercase font-bold text-muted-foreground">Componente</Label>
                   <Select value={componentFilter} onValueChange={setComponentFilter}>
                      <SelectTrigger className="bg-input-background h-8 text-xs">
                        <SelectValue placeholder="Filtrar componente" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="capacitor">Condensador</SelectItem>
                        <SelectItem value="inductor">Bobina</SelectItem>
                        <SelectItem value="resistor">Resistencia</SelectItem>
                      </SelectContent>
                    </Select>
                 </div>
                 
                 <div className="space-y-2">
                   <Label className="text-[10px] uppercase font-bold text-muted-foreground">Medición</Label>
                   <Select value={selectedMeasName} onValueChange={handleMeasSelect}>
                      <SelectTrigger className="bg-input-background">
                        <SelectValue placeholder="Selecciona..." />
                      </SelectTrigger>
                      <SelectContent>
                        {measurements.map((m) => (
                          <SelectItem key={m.name} value={m.name}>
                            {m.component_type ? `${m.name} (${m.component_type})` : m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedMeasName && (
                    <div className="text-[10px] text-muted-foreground italic px-1">
                      Cargada: {selectedMeasName}
                    </div>
                  )}
              </CardContent>
            </Card>

            <Card className="flex flex-col">
              <CardHeader className="pb-3 text-zinc-900">
                <CardTitle className="text-lg">{t('sparam.input.title')}</CardTitle>
                <CardDescription>{t('sparam.input.desc')}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "relative group cursor-pointer border-2 border-dashed rounded-xl p-4 h-full min-h-[100px] transition-all flex flex-col items-center justify-center gap-2",
                    isDragging 
                      ? "border-primary bg-primary/5 scale-[1.01]" 
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".s2p,.s1p,.ts"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setS2pFile(e.target.files[0]);
                        setSelectedMeasName("");
                      }
                    }}
                  />
                  
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                    s2pFile ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary group-hover:bg-primary/20"
                  )}>
                    {s2pFile ? <FileCheck className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  </div>

                  <div className="text-center">
                    <p className="text-[10px] font-medium max-w-[120px] truncate">
                      {s2pFile ? s2pFile.name : t('sparam.drag.text')}
                    </p>
                  </div>

                  {s2pFile && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setS2pFile(null);
                      }}
                      className="absolute top-1 right-1 text-[10px] text-muted-foreground hover:text-destructive p-1"
                    >
                      {t('sparam.drag.remove')}
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Column 2: Loaded Traces */}
          <Card className="flex flex-col h-full border border-border">
            <CardHeader className="pb-3 text-zinc-900">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  Trazas Cargadas
                </CardTitle>
                {traces.length > 0 && (
                  <button
                    onClick={() => {
                      setTraces([]);
                      setActiveTraceId(null);
                    }}
                    className="text-[10px] font-bold text-muted-foreground hover:text-destructive transition-colors uppercase tracking-wider px-1.5 py-0.5 rounded hover:bg-destructive/5"
                  >
                    Limpiar todo
                  </button>
                )}
              </div>
              <CardDescription>Habilita, selecciona o elimina trazas.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-2 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
              {traces.length === 0 ? (
                <div className="h-full min-h-[150px] flex flex-col items-center justify-center text-center p-4">
                  <p className="text-xs text-muted-foreground italic">No hay trazas cargadas.</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1 max-w-[150px]">
                    Carga un archivo de la biblioteca o local para comenzar.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {traces.map((t) => (
                    <div 
                      key={t.id}
                      className={cn(
                        "flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all duration-200 group/trace",
                        activeTraceId === t.id 
                          ? "border-primary bg-primary/5 shadow-md shadow-primary/5 scale-[1.01]" 
                          : "border-border hover:border-primary/20 hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={t.visible}
                          onChange={() => {
                            setTraces(prev => prev.map(curr => curr.id === t.id ? { ...curr, visible: !curr.visible } : curr));
                          }}
                          className="rounded border-zinc-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                        />
                        <button
                          onClick={() => cycleColor(t.id)}
                          className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0 cursor-pointer transition-transform hover:scale-110 shadow-inner"
                          style={{ backgroundColor: t.color }}
                          title="Cambiar color"
                        />
                        <span 
                          onClick={() => {
                            setActiveTraceId(t.id);
                            setViewMode('individual');
                          }}
                          className={cn(
                            "font-bold truncate cursor-pointer transition-colors flex-1 text-zinc-900 select-none",
                            activeTraceId === t.id ? "text-primary" : "hover:text-primary animate-pulse-slow"
                          )}
                          title={t.name}
                        >
                          {t.name}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1 opacity-0 group-hover/trace:opacity-100 transition-opacity">
                        <button
                          onClick={() => removeTrace(t.id)}
                          className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Column 3: Outputs */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3 text-zinc-900">
              <CardTitle className="text-lg">{t('sparam.output.title')}</CardTitle>
              <CardDescription>{t('sparam.output.desc')}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <OutputPickerPro
                label={t('sparam.output.label')}
                defaultName={outName}
                onChange={({ filename, dirHandle }) => {
                  setOutName(filename);
                  setOutDir(dirHandle);
                }}
              />
            </CardContent>
          </Card>
        </div>

        <Card className={cn("transition-colors", result ? "bg-primary/5 border-primary/20" : "bg-muted/30")}>
          <CardHeader className="pb-2 text-zinc-900">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              {t('sparam.summary.title')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex flex-col border-l-2 border-primary/20 pl-4">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold text-zinc-900">
                    {t('sparam.summary.min_s11').replace('S11', `S${result.data.port1 ?? 1}${result.data.port1 ?? 1}`)}
                  </p>
                  <p className="text-2xl font-mono font-bold text-primary">{result.summary.min_s11.toFixed(2)} dB</p>
                </div>
                {result.data.n_ports >= 2 && result.summary.max_s21 !== null && (
                  <div className="flex flex-col border-l-2 border-primary/20 pl-4">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold text-zinc-900">
                      {t('sparam.summary.max_s21').replace('S21', `S${result.data.port2 ?? 2}${result.data.port1 ?? 1}`)}
                    </p>
                    <p className="text-2xl font-mono font-bold text-primary">{result.summary.max_s21.toFixed(2)} dB</p>
                  </div>
                )}
                <div className="flex flex-col border-l-2 border-primary/20 pl-4">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold text-zinc-900">{t('sparam.summary.min_vswr')}</p>
                  <p className="text-2xl font-mono font-bold text-primary">{result.summary.min_vswr.toFixed(2)}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-xs text-muted-foreground italic">{t('sparam.summary.placeholder')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="w-full flex flex-col overflow-hidden min-h-[500px]">
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between border-b border-border/50 bg-muted/10 px-6 py-4 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-zinc-900">
                <CardTitle className="text-xl">{t('sparam.plots.title')}</CardTitle>
                {viewMode === 'individual' && result && ['mag', 'phase', 'zmag'].includes(result.plots[activePlotIdx].id) && (
                  <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tight flex items-center gap-1">
                    <ChartIcon className="w-3 h-3" /> {t('sparam.plots.dynamic')}
                  </span>
                )}
                {viewMode === 'comparison' && (
                  <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tight flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Comparación
                  </span>
                )}
              </div>
              <CardDescription>
                {viewMode === 'comparison' 
                  ? "Visualiza y compara múltiples trazas superpuestas en tiempo real."
                  : result 
                    ? t('sparam.plots.desc_result', result.plots[activePlotIdx].title) 
                    : t('sparam.plots.desc_idle')}
              </CardDescription>
            </div>
            
            {traces.length >= 2 && (
              <div className="flex items-center bg-zinc-200/50 dark:bg-zinc-800/50 p-1 rounded-xl border border-border shadow-inner shrink-0">
                <button
                  onClick={() => setViewMode('individual')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer select-none",
                    viewMode === 'individual'
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-muted-foreground hover:text-zinc-900"
                  )}
                >
                  Vista Individual
                </button>
                <button
                  onClick={() => setViewMode('comparison')}
                  className={cn(
                    "px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer select-none",
                    viewMode === 'comparison'
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-muted-foreground hover:text-zinc-900"
                  )}
                >
                  Comparar Trazas ({traces.length})
                </button>
              </div>
            )}

            {viewMode === 'individual' && result && (
              <div className="flex items-center gap-3 shrink-0">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={downloadCurrentPlot}
                  className="h-9 gap-2 px-4 shadow-sm"
                >
                  <Download className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-xs text-zinc-900">{t('sparam.plots.export_svg')}</span>
                </Button>
                <div className="flex items-center bg-background rounded-lg p-1 border border-border shadow-sm">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 hover:bg-muted" 
                    disabled={activePlotIdx === 0}
                    onClick={() => setActivePlotIdx(prev => prev - 1)}
                  >
                    <ChevronLeft className="w-5 h-5 text-zinc-900" />
                  </Button>
                  <div className="px-3 flex flex-col items-center justify-center min-w-[60px] border-x border-border/50 mx-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-tight text-zinc-900">{t('sparam.plots.view')}</span>
                    <span className="text-sm font-mono font-bold leading-tight text-zinc-900">
                      {activePlotIdx + 1} / {result.plots.length}
                    </span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 hover:bg-muted" 
                    disabled={activePlotIdx === result.plots.length - 1}
                    onClick={() => setActivePlotIdx(prev => prev + 1)}
                  >
                    <ChevronRight className="w-5 h-5 text-zinc-900" />
                  </Button>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-50/50 dark:bg-zinc-950/20">
            {loading ? (
              <div className="flex flex-col items-center justify-center space-y-6 py-20">
                <div className="relative">
                  <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary"></div>
                  <Activity className="absolute inset-0 m-auto w-6 h-6 text-primary/50" />
                </div>
                <div className="text-center space-y-2">
                  <p className="font-bold text-lg">{t('sparam.loading.title')}</p>
                  <p className="text-muted-foreground animate-pulse text-sm">{t('sparam.loading.desc')}</p>
                </div>
              </div>
            ) : viewMode === 'comparison' ? (
              <div className="w-full flex-1 flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Comparison parameter selector */}
                <div className="flex flex-wrap gap-2 justify-center bg-zinc-200/30 p-1.5 rounded-2xl border border-border/55 max-w-fit mx-auto shadow-inner">
                  <button
                    onClick={() => setComparisonParam('s11')}
                    className={cn(
                      "px-3.5 py-1.5 text-xs font-black rounded-xl cursor-pointer select-none transition-all duration-200",
                      comparisonParam === 's11' ? "bg-primary text-white shadow-md shadow-primary/20 scale-[1.03]" : "text-muted-foreground hover:text-zinc-900"
                    )}
                  >
                    S11 Mag (dB)
                  </button>
                  <button
                    onClick={() => setComparisonParam('s21')}
                    disabled={!hasAnyS21}
                    className={cn(
                      "px-3.5 py-1.5 text-xs font-black rounded-xl cursor-pointer select-none transition-all duration-200",
                      !hasAnyS21 ? "opacity-40 cursor-not-allowed" : "",
                      comparisonParam === 's21' ? "bg-primary text-white shadow-md shadow-primary/20 scale-[1.03]" : "text-muted-foreground hover:text-zinc-900"
                    )}
                    title={!hasAnyS21 ? "No visible trace has 2 ports" : ""}
                  >
                    S21 Mag (dB)
                  </button>
                  <button
                    onClick={() => setComparisonParam('phase11')}
                    className={cn(
                      "px-3.5 py-1.5 text-xs font-black rounded-xl cursor-pointer select-none transition-all duration-200",
                      comparisonParam === 'phase11' ? "bg-primary text-white shadow-md shadow-primary/20 scale-[1.03]" : "text-muted-foreground hover:text-zinc-900"
                    )}
                  >
                    S11 Phase (°)
                  </button>
                  <button
                    onClick={() => setComparisonParam('phase21')}
                    disabled={!hasAnyS21}
                    className={cn(
                      "px-3.5 py-1.5 text-xs font-black rounded-xl cursor-pointer select-none transition-all duration-200",
                      !hasAnyS21 ? "opacity-40 cursor-not-allowed" : "",
                      comparisonParam === 'phase21' ? "bg-primary text-white shadow-md shadow-primary/20 scale-[1.03]" : "text-muted-foreground hover:text-zinc-900"
                    )}
                    title={!hasAnyS21 ? "No visible trace has 2 ports" : ""}
                  >
                    S21 Phase (°)
                  </button>
                  <button
                    onClick={() => setComparisonParam('vswr')}
                    className={cn(
                      "px-3.5 py-1.5 text-xs font-black rounded-xl cursor-pointer select-none transition-all duration-200",
                      comparisonParam === 'vswr' ? "bg-primary text-white shadow-md shadow-primary/20 scale-[1.03]" : "text-muted-foreground hover:text-zinc-900"
                    )}
                  >
                    VSWR
                  </button>
                  <button
                    onClick={() => setComparisonParam('zmag_series')}
                    className={cn(
                      "px-3.5 py-1.5 text-xs font-black rounded-xl cursor-pointer select-none transition-all duration-200",
                      comparisonParam === 'zmag_series' ? "bg-primary text-white shadow-md shadow-primary/20 scale-[1.03]" : "text-muted-foreground hover:text-zinc-900"
                    )}
                  >
                    Series Impedance |Z_series|
                  </button>
                  <button
                    onClick={() => setComparisonParam('zmag_shunt')}
                    disabled={!hasAnyS21}
                    className={cn(
                      "px-3.5 py-1.5 text-xs font-black rounded-xl cursor-pointer select-none transition-all duration-200",
                      !hasAnyS21 ? "opacity-40 cursor-not-allowed" : "",
                      comparisonParam === 'zmag_shunt' ? "bg-primary text-white shadow-md shadow-primary/20 scale-[1.03]" : "text-muted-foreground hover:text-zinc-900"
                    )}
                    title={!hasAnyS21 ? "No visible trace has 2 ports" : ""}
                  >
                    Shunt Impedance |Z_shunt|
                  </button>
                </div>

                {renderComparisonChart()}

                {/* Comparison Summary Table */}
                <div className="w-full bg-white dark:bg-zinc-900 border border-border/60 rounded-2xl p-4 shadow-sm">
                  <h4 className="text-[10px] uppercase font-black text-muted-foreground tracking-wider mb-3 select-none">Resumen de Comparación</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-border text-[10px] text-muted-foreground uppercase font-black">
                          <th className="py-2.5">Traza</th>
                          <th className="py-2.5 text-right">Rango de Freq (MHz)</th>
                          <th className="py-2.5 text-right">Valor Mínimo</th>
                          <th className="py-2.5 text-right">Valor Máximo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {traces.filter(t => t.visible).map(t => {
                          let valArray: number[] = [];
                          if (comparisonParam === 's11') valArray = t.data.s11_db;
                          else if (comparisonParam === 's21') valArray = t.data.s21_db || [];
                          else if (comparisonParam === 'phase11') valArray = t.data.s11_phase;
                          else if (comparisonParam === 'phase21') valArray = t.data.s21_phase || [];
                          else if (comparisonParam === 'vswr') valArray = t.data.vswr;
                          else if (comparisonParam === 'zmag_series') valArray = t.data.z_mag || [];
                          else if (comparisonParam === 'zmag_shunt') valArray = t.data.z_mag_shunt || [];
                          
                          const validVals = valArray.filter((v: number) => v !== null && isFinite(v));
                          const minVal = validVals.length ? Math.min(...validVals).toFixed(2) : 'N/A';
                          const maxVal = validVals.length ? Math.max(...validVals).toFixed(2) : 'N/A';
                          const unitStr = ['s11', 's21'].includes(comparisonParam) ? ' dB' : ['phase11', 'phase21'].includes(comparisonParam) ? '°' : ['zmag_series', 'zmag_shunt'].includes(comparisonParam) ? ' Ω' : '';
                          
                          const fMin = (Math.min(...t.data.freq_hz) / 1e6).toFixed(1);
                          const fMax = (Math.max(...t.data.freq_hz) / 1e6).toFixed(1);
                          
                          return (
                            <tr key={t.id} className="border-b border-border/40 hover:bg-muted/10 transition-colors">
                              <td className="py-2.5 font-bold flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full shrink-0 shadow-inner" style={{ backgroundColor: t.color }} />
                                <span className="truncate max-w-[200px]" title={t.name}>{t.name}</span>
                              </td>
                              <td className="py-2.5 text-right font-mono text-muted-foreground">{fMin} - {fMax} ({t.data.freq_hz.length} pts)</td>
                              <td className="py-2.5 text-right font-mono font-bold text-zinc-900">{minVal}{unitStr}</td>
                              <td className="py-2.5 text-right font-mono font-bold text-zinc-900">{maxVal}{unitStr}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : result ? (
              <div className="w-full flex-1 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                {renderActiveChart()}

                <div 
                  className="mt-8 grid gap-2 w-full max-w-lg"
                  style={{ gridTemplateColumns: `repeat(${result.plots.length}, minmax(0, 1fr))` }}
                >
                  {result.plots.map((p: any, i: number) => (
                    <button
                      key={p.id}
                      onClick={() => setActivePlotIdx(i)}
                      className={cn(
                        "h-1.5 rounded-full transition-all duration-300",
                        activePlotIdx === i ? "bg-primary w-full" : "bg-muted hover:bg-primary/30 w-full"
                      )}
                      title={p.title}
                    />
                  ))}
                </div>

                {/* RF Auto-Markers Panel */}
                {(rfMarkersLoading || rfMarkers) && (
                  <div className="w-full mt-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center gap-2 mb-3">
                      <Tag className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold text-foreground">RF Auto-Markers</span>
                      {rfMarkersLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-1" />}
                      {rfMarkers?.summary && !rfMarkersLoading && (
                        <span className="text-xs text-muted-foreground ml-auto">{rfMarkers.summary}</span>
                      )}
                    </div>

                    {rfMarkersLoading ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {[...Array(6)].map((_, i) => (
                          <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
                        ))}
                      </div>
                    ) : rfMarkers?.display && rfMarkers.display.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {rfMarkers.display.map((m: any) => {
                          const passFail = rfMarkers.pass_fail?.[m.key];
                          const hasMask = passFail !== undefined && passFail !== null;
                          const passed = passFail === true;
                          return (
                            <div
                              key={m.key}
                              className={cn(
                                "rounded-lg border px-3 py-2 flex flex-col gap-0.5",
                                hasMask
                                  ? passed
                                    ? "border-emerald-500/40 bg-emerald-500/5"
                                    : "border-red-500/40 bg-red-500/5"
                                  : "border-border bg-muted/20"
                              )}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wide leading-tight truncate">{m.label}</span>
                                {hasMask && (
                                  passed
                                    ? <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                    : <XCircle className="w-3 h-3 text-red-500 shrink-0" />
                                )}
                              </div>
                              <span className="text-sm font-semibold text-foreground leading-tight">
                                {m.value ?? '—'}
                                {m.unit ? <span className="text-xs font-normal text-muted-foreground ml-1">{m.unit}</span> : null}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : !rfMarkersLoading ? (
                      <p className="text-xs text-muted-foreground">No se detectaron marcadores.</p>
                    ) : null}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center space-y-6 py-20 animate-in fade-in duration-700">
                <div className="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mx-auto text-muted-foreground/40 border-4 border-dashed border-muted">
                  <Activity className="w-12 h-12" />
                </div>
                <div className="max-w-md mx-auto space-y-2">
                  <h3 className="text-xl font-bold text-foreground/80 text-zinc-900">{t('sparam.empty.title')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('sparam.empty.desc')}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ToolShell>
  );
}


