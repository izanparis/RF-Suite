import React, { useState, useEffect, useRef } from 'react';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import {
  Library,
  RefreshCw,
  Activity,
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  CircuitBoard,
  FileUp,
  X,
  CheckCircle2,
  Maximize2,
  Loader2,
} from 'lucide-react';
import { useLanguage } from '../../lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";

export function CompactModelTool() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  
  // Library selection
  const [measurements, setMeasurements] = useState<{name: string, device: string}[]>([]);
  const [selectedMeas, setSelectedMeas] = useState("");
  const [device, setDevice] = useState('NanoVNA-Izan');
  
  // Custom file selection
  const [customFile, setCustomFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Extraction options
  const [method, setMethod] = useState("physical"); // 'physical' or 'vf'
  const [componentType, setComponentType] = useState("capacitor"); // 'capacitor' or 'inductor'
  const [topology, setTopology] = useState("shunt"); // 'shunt', 'series', 'oneport'
  const [modelName, setModelName] = useState("");

  // Auto-set default topology when component type changes
  const handleComponentTypeChange = (val: string) => {
    setComponentType(val);
    if (val === "inductor") setTopology("series");
    else setTopology("shunt");
  };

  // EDA export
  const [showEdaMenu, setShowEdaMenu] = useState(false);
  const [edaLoading, setEdaLoading] = useState(false);

  // Plot state
  const [activePlotIdx, setActivePlotIdx] = useState(0);

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

  const handleAction = async (id: string) => {
    if (id === 'extract') {
      if (!selectedMeas && !customFile) {
        toast.info(t('cm.alert.no_data'));
        return;
      }

      setLoading(true);
      setResult(null);
      setActivePlotIdx(0);

      try {
        const formData = new FormData();
        if (customFile) {
          formData.append('file', customFile);
        } else {
          formData.append('filename', selectedMeas);
          formData.append('device', device);
        }
        
        formData.append('method', method);
        formData.append('component_type', componentType);
        formData.append('topology', topology);
        formData.append('custom_name', modelName);
        formData.append('z0', "50.0");

        const response = await fetch('http://localhost:8080/api/compact-models/extract', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || 'Error en la extracción');
        }

        const data = await response.json();
        setResult(data);

        // Auto-save analysis results to server
        if (selectedMeas) {
          const matched = measurements.find((m: any) => m.name === selectedMeas) as any;
          const relativePath = matched?.relative_path || selectedMeas;
          fetch('http://localhost:8080/api/library/measurement/analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              measurement_relative_path: relativePath,
              tool_name: method === 'vf' ? 'compact_model_vf' : `compact_model_${componentType}`,
              results: {
                summary: {
                  method: data.summary.method || method,
                  c_eff: data.summary.c_eff,
                  l_eff: data.summary.l_eff,
                  nrms: data.summary.nrms
                },
                spice_netlist: data.spice_netlist,
                plots: data.plots.map((p: any) => ({ id: p.id, title: p.title, image: p.image }))
              }
            })
          }).catch(err => console.error("Error auto-saving compact model analysis:", err));
        }
      } catch (error) {
        console.error(error);
        toast.error('Error: ' + (error instanceof Error ? error.message : String(error)));
      } finally {
        setLoading(false);
      }
    }

    if (id === 'save') {
      if (!result || !result.spice_netlist) return;
      
      const blob = new Blob([result.spice_netlist], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const downloadName = modelName ? (modelName.endsWith('.cir') ? modelName : `${modelName}.cir`) : `${(selectedMeas || customFile?.name || 'modelo').split('.')[0]}_model.cir`;
      link.download = downloadName;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleEdaExport = async (format: string) => {
    if (!result?.spice_netlist) return;
    setShowEdaMenu(false);
    setEdaLoading(true);
    try {
      const res = await fetch('http://localhost:8080/api/eda/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          spice_netlist: result.spice_netlist,
          name: modelName || 'RF_MODEL',
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      const data = await res.json();
      const blob = new Blob([data.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || `model.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error('Error EDA export: ' + e.message);
    } finally {
      setEdaLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCustomFile(e.target.files[0]);
      setSelectedMeas("");
    }
  };

  return (
    <ToolShell
      title={t('compact_model')}
      actions={[
        { id: 'extract', label: t('cm.action.extract'), variant: 'default' },
        { id: 'save', label: t('cm.action.save_pc'), variant: 'outline', disabled: !result },
      ]}
      onAction={handleAction}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Library className="w-5 h-5 text-primary" />
                  {t('cm.input.title')}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 flex-1">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">{t('cm.input.library')}</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={device} onValueChange={setDevice} disabled={!!customFile}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Dispositivo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NanoVNA-Izan">NanoVNA-Izan</SelectItem>
                        <SelectItem value="NanoVNA-LAB1">NanoVNA-LAB1</SelectItem>
                        <SelectItem value="NanoVNA-LAB2">NanoVNA-LAB2</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={selectedMeas} onValueChange={(val) => { setSelectedMeas(val); setCustomFile(null); }} disabled={!!customFile}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Medición..." />
                      </SelectTrigger>
                      <SelectContent>
                        {measurements.map((m) => (
                          <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground font-bold">{t('cm.input.upload')}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  {!customFile ? (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-border rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                    >
                      <FileUp className="w-8 h-8 text-muted-foreground mb-2" />
                      <p className="text-xs text-center font-medium">{t('cm.input.drag')}</p>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept=".s1p,.s2p"
                        className="hidden" 
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 bg-primary/10 border border-primary/20 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/20 rounded-md">
                          <FileText className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold truncate max-w-[150px]">{customFile.name}</span>
                          <span className="text-[10px] text-muted-foreground">{(customFile.size / 1024).toFixed(1)} KB</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setCustomFile(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CircuitBoard className="w-5 h-5 text-primary" />
                {t('cm.output.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 flex-1">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Tipo de Componente</Label>
                  <Select value={componentType} onValueChange={handleComponentTypeChange}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="capacitor">Condensador</SelectItem>
                      <SelectItem value="inductor">Bobina (Inductor)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Topología de Medida</Label>
                  <Select value={topology} onValueChange={setTopology}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shunt">Shunt-Through (2 puertos, DUT a masa)</SelectItem>
                      <SelectItem value="series">Series-Through (2 puertos, DUT en serie)</SelectItem>
                      <SelectItem value="oneport">Un Puerto — S11</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">Método de Extracción</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physical">Modelo Físico (Foster RLC)</SelectItem>
                      <SelectItem value="vf">Vector Fitting (Modelo Racional)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-muted-foreground">{t('cm.output.name')}</Label>
                  <div className="relative">
                    <Input 
                      placeholder="Ej: cap_10nf_0805"
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      className="h-10"
                    />
                    {modelName && (
                       <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-[10px]">.cir</div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">{t('cm.output.help')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {loading ? (
           <Card className="p-12">
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-lg font-medium animate-pulse">Procesando y guardando modelo...</p>
            </div>
          </Card>
        ) : result ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="py-4">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">{t('cm.status.success')}</h4>
                      <p className="text-xs text-muted-foreground">{t('cm.status.saved')} <span className="font-mono text-primary">{result.saved_path.split(/[\\/]/).pop()}</span></p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center md:text-right">
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">
                        Error (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dashed border-muted-foreground/50">NRMS</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-xs">
                              Error cuadrático medio normalizado. &lt;5% excelente, &lt;15% bueno.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        )
                      </p>
                      <p className="text-sm font-mono font-bold text-primary">{result.summary.nrms.toExponential(3)}</p>
                    </div>
                    {result.summary.c_eff != null && (
                      <div className="text-center md:text-right border-l border-border pl-4">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Capacidad</p>
                        <p className="text-sm font-mono font-bold">
                          {result.summary.c_eff >= 1e-9
                            ? `${(result.summary.c_eff * 1e9).toFixed(3)} nF`
                            : `${(result.summary.c_eff * 1e12).toFixed(2)} pF`}
                        </p>
                      </div>
                    )}
                    {result.summary.l_eff != null && (
                      <div className="text-center md:text-right border-l border-border pl-4">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">Inductancia</p>
                        <p className="text-sm font-mono font-bold">
                          {result.summary.l_eff >= 1e-3
                            ? `${(result.summary.l_eff * 1e3).toFixed(3)} mH`
                            : result.summary.l_eff >= 1e-6
                            ? `${(result.summary.l_eff * 1e6).toFixed(3)} µH`
                            : `${(result.summary.l_eff * 1e9).toFixed(2)} nH`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="overflow-hidden flex flex-col">
                <CardHeader className="bg-muted/30 border-b px-4 py-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-bold">Visualización</CardTitle>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={activePlotIdx === 0} onClick={() => setActivePlotIdx(prev => prev - 1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-[10px] font-mono px-2">{activePlotIdx + 1} / {result.plots.length}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={activePlotIdx === result.plots.length - 1} onClick={() => setActivePlotIdx(prev => prev + 1)}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0 bg-white dark:bg-zinc-950 flex-1 flex items-center justify-center min-h-[400px]">
                  <img src={`data:image/png;base64,${result.plots[activePlotIdx].image}`} alt={result.plots[activePlotIdx].title} className="w-full h-auto" />
                </CardContent>
              </Card>

              <Card className="flex flex-col">
                <CardHeader className="bg-muted/30 border-b px-4 py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Netlist (.cir)
                    </CardTitle>
                    <div className="flex gap-2 items-center">
                      <Button variant="outline" size="sm" className="h-7 text-[10px] uppercase font-bold" onClick={() => handleAction('save')}>
                        <Download className="w-3 h-3 mr-1" /> SPICE
                      </Button>
                      <div className="relative">
                        <Button
                          variant="outline" size="sm"
                          className="h-7 text-[10px] uppercase font-bold"
                          onClick={() => setShowEdaMenu(v => !v)}
                          disabled={edaLoading}
                        >
                          {edaLoading
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <>EDA <ChevronDown className="w-3 h-3 ml-1" /></>}
                        </Button>
                        {showEdaMenu && (
                          <div className="absolute right-0 top-8 z-50 bg-popover border border-border rounded-md shadow-lg min-w-[180px] py-1">
                            {[
                              { format: 'kicad', label: 'KiCad Symbol',    ext: '.kicad_sym' },
                              { format: 'qucs',  label: 'Qucs-S Schematic', ext: '.sch' },
                              { format: 'ads',   label: 'ADS MDL Snippet', ext: '.mdl' },
                            ].map(opt => (
                              <button
                                key={opt.format}
                                className="w-full text-left px-4 py-1.5 text-xs hover:bg-muted transition-colors flex justify-between"
                                onClick={() => handleEdaExport(opt.format)}
                              >
                                <span>{opt.label}</span>
                                <span className="text-muted-foreground font-mono">{opt.ext}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0 flex-1">
                  <pre className="p-4 text-[11px] font-mono bg-zinc-900 text-zinc-100 overflow-auto h-[400px] custom-scrollbar">
                    {result.spice_netlist}
                  </pre>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <Card className="p-12 border-dashed border-2 flex flex-col items-center justify-center text-muted-foreground space-y-4">
            <Activity className="w-12 h-12 opacity-20" />
            <div className="text-center">
              <h3 className="text-lg font-medium">{t('cm.status.error')}</h3>
              <p className="text-sm">{t('cm.status.idle')}</p>
            </div>
          </Card>
        )}
      </div>
    </ToolShell>
  );
}
