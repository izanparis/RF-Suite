import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { OutputPickerPro } from '../OutputPickerPro';
import { cn } from '../ui/utils';
import { Upload, FileCheck, ChevronLeft, ChevronRight, Download, Activity, BarChart3, LineChart as ChartIcon, X, Trash2, GripHorizontal } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, 
  Legend, ResponsiveContainer, Brush, ReferenceLine, ReferenceDot 
} from 'recharts';
import type { DirectoryHandle } from '../../lib/fsAccess';

export function SParamAnalysisTool() {
  const [s2pFile, setS2pFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [outName, setOutName] = useState('');
  const [outDir, setOutDir] = useState<DirectoryHandle | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [activePlotIdx, setActivePlotIdx] = useState(0);
  const [markers, setMarkers] = useState<any[]>([]);
  
  // Dragging state for the markers panel
  const [panelPos, setPanelPos] = useState({ x: 24, y: 64 }); // Initial relative to top-right
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

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
    return result.data.freq_hz.map((f: number, i: number) => ({
      freqMHz: (f / 1e6).toFixed(2),
      s11: result.data.s11_db[i],
      s21: result.data.s21_db[i],
      phase11: result.data.s11_phase[i],
      phase21: result.data.s21_phase[i],
      vswr: result.data.vswr[i],
    }));
  }, [result]);

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
    if (file && (file.name.toLowerCase().endsWith('.s2p') || file.name.toLowerCase().endsWith('.ts'))) {
      setS2pFile(file);
    } else {
      alert('Por favor, sube un archivo Touchstone (.s2p)');
    }
  };

  const handleAction = async (id: string) => {
    if (id === 'analyze') {
      if (!s2pFile) {
        alert('Por favor, selecciona un archivo .s2p primero.');
        return;
      }

      setLoading(true);
      setResult(null);
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
        setResult(data);
      } catch (error) {
        console.error(error);
        alert('Error al analizar archivo: ' + (error instanceof Error ? error.message : String(error)));
      } finally {
        setLoading(false);
      }
    }

    if (id === 'report') {
      console.log('Attempting export. Result object keys:', result ? Object.keys(result) : 'null');
      if (!result || !result.zip_content) {
        alert('Error: No se han encontrado datos para exportar. Por favor, pulsa el botón "Analizar" de nuevo para generar el paquete ZIP.');
        return;
      }
      try {
        const { saveBase64File } = await import('../../lib/fsAccess');
        let filename = outName || 'analisis_completo';
        if (!filename.toLowerCase().endsWith('.zip')) {
          filename += '.zip';
        }

        await saveBase64File(outDir, filename, result.zip_content);
        alert('✅ Paquete ZIP exportado correctamente.');
      } catch (e) {
        alert('❌ Error al exportar ZIP: ' + e);
      }
    }
  };

  const downloadCurrentPlot = () => {
    const plot = result.plots[activePlotIdx];
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${plot.image}`;
    link.download = `${plot.id}_plot.png`;
    link.click();
  };

  const renderActiveChart = () => {
    if (!result) return null;
    const currentPlot = result.plots[activePlotIdx];

    // Cartesian dynamic charts for Mag, Phase, VSWR
    if (['mag', 'phase', 'vswr'].includes(currentPlot.id)) {
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
                tick={{fontSize: 11, fill: '#666', fontWeight: 500}}
                minTickGap={60}
                label={{
                  value: 'FRECUENCIA (MHz)', 
                  position: 'insideBottom', 
                  offset: -15, 
                  fontSize: 13, 
                  fontWeight: 'bold',
                  fill: '#333'
                }}
              />
              <YAxis 
                tick={{fontSize: 11, fill: '#666', fontWeight: 500}}
                domain={['auto', 'auto']}
                label={{
                  value: currentPlot.title.toUpperCase(), 
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
              
              {currentPlot.id === 'mag' && (
                <>
                  <Line type="monotone" dataKey="s11" name="S11" stroke="#3b82f6" strokeWidth={2.5} dot={false} isAnimationActive={false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="s21" name="S21" stroke="#ef4444" strokeWidth={2.5} dot={false} isAnimationActive={false} activeDot={{ r: 5 }} />
                  {markers.map((m, i) => (
                    <React.Fragment key={i}>
                      <ReferenceLine x={m.freqMHz} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'top', value: `M${i+1}`, fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                      <ReferenceDot x={m.freqMHz} y={m.s11} r={4} fill="#3b82f6" stroke="white" />
                      <ReferenceDot x={m.freqMHz} y={m.s21} r={4} fill="#ef4444" stroke="white" />
                    </React.Fragment>
                  ))}
                </>
              )}
              {currentPlot.id === 'phase' && (
                <>
                  <Line type="monotone" dataKey="phase11" name="Fase S11" stroke="#3b82f6" strokeWidth={2.5} dot={false} isAnimationActive={false} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="phase21" name="Fase S21" stroke="#ef4444" strokeWidth={2.5} dot={false} isAnimationActive={false} activeDot={{ r: 5 }} />
                  {markers.map((m, i) => (
                    <React.Fragment key={i}>
                      <ReferenceLine x={m.freqMHz} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'top', value: `M${i+1}`, fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                      <ReferenceDot x={m.freqMHz} y={m.phase11} r={4} fill="#3b82f6" stroke="white" />
                      <ReferenceDot x={m.freqMHz} y={m.phase21} r={4} fill="#ef4444" stroke="white" />
                    </React.Fragment>
                  ))}
                </>
              )}
              {currentPlot.id === 'vswr' && (
                <>
                  <Line type="monotone" dataKey="vswr" name="VSWR" stroke="#10b981" strokeWidth={2.5} dot={false} isAnimationActive={false} activeDot={{ r: 5 }} />
                  {markers.map((m, i) => (
                    <React.Fragment key={i}>
                      <ReferenceLine x={m.freqMHz} stroke="#64748b" strokeDasharray="3 3" label={{ position: 'top', value: `M${i+1}`, fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} />
                      <ReferenceDot x={m.freqMHz} y={m.vswr} r={4} fill="#10b981" stroke="white" />
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
                {/* Drag Handle */}
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

                {/* Markers List */}
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
                        
                        {currentPlot.id === 'mag' && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-blue-500">S11:</span>
                              <span className="font-mono font-bold">{m.s11.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-red-500">S21:</span>
                              <span className="font-mono font-bold">{m.s21.toFixed(2)}</span>
                            </div>
                          </>
                        )}
                        
                        {currentPlot.id === 'phase' && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-blue-500">P11:</span>
                              <span className="font-mono font-bold">{m.phase11.toFixed(1)}°</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-red-500">P21:</span>
                              <span className="font-mono font-bold">{m.phase21.toFixed(1)}°</span>
                            </div>
                          </>
                        )}
                        
                        {currentPlot.id === 'vswr' && (
                          <div className="flex justify-between">
                            <span className="text-emerald-500">VSWR:</span>
                            <span className="font-mono font-bold">{m.vswr.toFixed(2)}</span>
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

    // Static high-quality images for Smith Charts
    return (
      <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-border p-4 overflow-hidden group animate-in fade-in zoom-in duration-300">
        <img 
          key={currentPlot.id}
          src={`data:image/png;base64,${currentPlot.image}`} 
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
      title="Análisis de parámetros S (S2P)"
      description="Carga un archivo Touchstone (.s2p) y analiza magnitud/fase, VSWR y cartas de Smith."
      actions={[
        { id: 'analyze', label: 'Analizar', variant: 'default' },
        { id: 'report', label: 'Exportar todo (.zip)', variant: 'outline' },
      ]}
      onAction={handleAction}
    >
      <div className="space-y-6 text-zinc-900">
        {/* Top Grid: Input and Output only */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="flex flex-col">
            <CardHeader className="pb-3 text-zinc-900">
              <CardTitle className="text-lg">Entrada</CardTitle>
              <CardDescription>Archivo Touchstone (.s2p)</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative group cursor-pointer border-2 border-dashed rounded-xl p-6 h-full min-h-[140px] transition-all flex flex-col items-center justify-center gap-2",
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
                  "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                  s2pFile ? "bg-green-100 text-green-600" : "bg-primary/10 text-primary group-hover:bg-primary/20"
                )}>
                  {s2pFile ? <FileCheck className="w-5 h-5" /> : <Upload className="w-5 h-5" />}
                </div>

                <div className="text-center">
                  <p className="text-xs font-medium max-w-[150px] truncate">
                    {s2pFile ? s2pFile.name : "Haz clic o arrastra aquí"}
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
                    Quitar
                  </button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="pb-3 text-zinc-900">
              <CardTitle className="text-lg">Salida</CardTitle>
              <CardDescription>Configuración del reporte</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <OutputPickerPro
                label="Nombre del reporte"
                defaultName={outName}
                onChange={({ filename, dirHandle }) => {
                  setOutName(filename);
                  setOutDir(dirHandle);
                }}
              />
            </CardContent>
          </Card>
        </div>

        {/* Middle Section: Summary (Full width) */}
        <Card className={cn("transition-colors", result ? "bg-primary/5 border-primary/20" : "bg-muted/30")}>
          <CardHeader className="pb-2 text-zinc-900">
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Resumen de Métricas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex flex-col border-l-2 border-primary/20 pl-4">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold text-zinc-900">Min S11 (Return Loss)</p>
                  <p className="text-2xl font-mono font-bold text-primary">{result.summary.min_s11.toFixed(2)} dB</p>
                </div>
                <div className="flex flex-col border-l-2 border-primary/20 pl-4">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold text-zinc-900">Max S21 (Insertion Loss)</p>
                  <p className="text-2xl font-mono font-bold text-primary">{result.summary.max_s21.toFixed(2)} dB</p>
                </div>
                <div className="flex flex-col border-l-2 border-primary/20 pl-4">
                  <p className="text-[10px] text-muted-foreground uppercase font-bold text-zinc-900">Min VSWR</p>
                  <p className="text-2xl font-mono font-bold text-primary">{result.summary.min_vswr.toFixed(2)}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-xs text-muted-foreground italic">Analiza un archivo para ver los indicadores clave de rendimiento (KPIs)</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bottom Section: Plot Carousel */}
        <Card className="w-full flex flex-col overflow-hidden min-h-[500px]">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 bg-muted/10 px-6 py-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-zinc-900">
                <CardTitle className="text-xl">Visualización de Gráficas</CardTitle>
                {result && ['mag', 'phase', 'vswr'].includes(result.plots[activePlotIdx].id) && (
                  <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tight flex items-center gap-1">
                    <ChartIcon className="w-3 h-3" /> Dinámico
                  </span>
                )}
              </div>
              <CardDescription>
                {result ? `Gráfico: ${result.plots[activePlotIdx].title}` : 'Los resultados aparecerán aquí tras el análisis.'}
              </CardDescription>
            </div>
            {result && (
              <div className="flex items-center gap-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={downloadCurrentPlot}
                  className="h-9 gap-2 px-4 shadow-sm"
                >
                  <Download className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-xs text-zinc-900">Exportar PNG</span>
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
                    <span className="text-[10px] uppercase font-bold text-muted-foreground leading-tight text-zinc-900">Vista</span>
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
                  <p className="font-bold text-lg">Procesando datos RF...</p>
                  <p className="text-muted-foreground animate-pulse text-sm">Calculando VSWR y Diagramas de Smith en el motor Python</p>
                </div>
              </div>
            ) : result ? (
              <div className="w-full flex-1 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                
                {renderActiveChart()}

                <div className="mt-8 grid grid-cols-5 gap-2 w-full max-w-lg">
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
              </div>
            ) : (
              <div className="text-center space-y-6 py-20 animate-in fade-in duration-700">
                <div className="w-24 h-24 bg-muted/50 rounded-full flex items-center justify-center mx-auto text-muted-foreground/40 border-4 border-dashed border-muted">
                  <Activity className="w-12 h-12" />
                </div>
                <div className="max-w-md mx-auto space-y-2">
                  <h3 className="text-xl font-bold text-foreground/80 text-zinc-900">Analizador de Datos RF</h3>
                  <p className="text-sm text-muted-foreground">
                    Sube un archivo <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary text-zinc-900">.s2p</code> en el panel superior para generar los diagramas de Smith, VSWR y magnitud.
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