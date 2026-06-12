import React, { useState, useEffect } from 'react';
import { 
  Library, 
  FileText, 
  Activity, 
  SlidersHorizontal, 
  FolderOpen, 
  Trash2, 
  Search,
  ExternalLink,
  Clock,
  HardDrive,
  Filter,
  FileCode,
  Table as TableIcon,
  FileSearch,
  Unlink,
  Eraser,
  Image as ImageIcon
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { motion } from 'motion/react';
import { useLanguage } from '../../lib/i18n';

interface LibraryItem {
  name: string;
  relative_path?: string;
  device?: string;
  component_type?: string | null;
  size?: number;
  mtime: number;
  fmin?: number;
  fmax?: number;
  fmin_hz?: number | null;
  fmax_hz?: number | null;
  points?: number;
  measurement_id?: string;
  averaging_count?: number;
  smoothing_window?: number;
  source?: string;
  datasheet?: {
    relative_path?: string;
    manufacturer_part_number?: string;
    title?: string;
    manufacturer?: string;
    supplier?: string;
    image_url?: string;
  };
  component_metadata?: {
    manufacturer?: string;
    manufacturer_part_number?: string;
    supplier?: string;
    supplier_part_number?: string;
    nominal_value?: string;
    tolerance?: string;
    voltage_rating?: string;
    current_rating?: string;
    power_rating?: string;
    temperature_range?: string;
    package?: string;
    dielectric_or_material?: string;
    operating_frequency_range?: string;
    product_description?: string;
    product_category?: string;
    mouser_product_url?: string;
    mouser_image_url?: string;
    mouser_availability?: string;
    mouser_attributes?: Record<string, string>;
    lifecycle_status?: string;
    metadata_source?: string;
    notes?: string;
  };
  analysis_history?: Record<string, any>;
}

interface LibraryToolProps {
  onAnalyze?: (name: string, device?: string, componentType?: string | null) => void;
}

export function LibraryTool({ onAnalyze }: LibraryToolProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('measurements');
  const [searchTerm, setSearchTerm] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [componentFilter, setComponentFilter] = useState('all');
  const [items, setItems] = useState<{
    measurements: LibraryItem[];
    calibrations: LibraryItem[];
    extractions: LibraryItem[];
  }>({
    measurements: [],
    calibrations: [],
    extractions: []
  });
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [pdfViewer, setPdfViewer] = useState<{ title: string; url: string } | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const handleGenerateReport = async (item: LibraryItem) => {
    setGeneratingReport(true);
    try {
      const response = await fetch('http://127.0.0.1:8080/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ measurement_relative_path: item.relative_path }),
      });
      if (!response.ok) {
        throw new Error('Error al generar el informe');
      }
      const data = await response.json();
      
      // Preview in new window
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(data.html_content);
        newWindow.document.close();
      } else {
        alert("El navegador bloqueó la ventana emergente de previsualización. Descargando informe...");
      }

      // Download file
      const blob = new Blob([data.html_content], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.suggested_filename;
      a.click();
      URL.revokeObjectURL(url);
      
      // Auto-save to server
      fetch('http://127.0.0.1:8080/api/reports/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          measurement_relative_path: item.relative_path,
          html_content: data.html_content
        }),
      }).catch(e => console.error("Error saving report to server:", e));

    } catch (err) {
      console.error(err);
      alert('Error al generar el informe: ' + err);
    } finally {
      setGeneratingReport(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, []);

  const fetchLibrary = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:8080/api/library/all');
      if (response.ok) {
        const data = await response.json();
        setItems(data);
      }
    } catch (error) {
      console.error('Error fetching library:', error);
    } finally {
      setLoading(false);
    }
  };

  const openLocation = async (item: LibraryItem) => {
    let type = activeTab === 'measurements' ? 'Mediciones' : 
               activeTab === 'calibrations' ? 'Calibraciones' : 'extracciones';
    
    // El backend organiza en: Biblioteca/{tipo}/{dispositivo}
    let path = `Biblioteca/${type}`;
    if (item.device && item.device !== 'General') {
      path += `/${item.device}`;
    }
    if (activeTab === 'measurements' && item.component_type) {
      const folder = item.component_type === 'capacitor' ? 'Capacitores' : item.component_type === 'inductor' ? 'Inductores' : 'Resistencias';
      path += `/${folder}`;
    }
    
    try {
      await fetch(`http://127.0.0.1:8080/api/utils/open-folder?path=${encodeURIComponent(path)}`);
    } catch (error) {
      console.error('Error opening folder:', error);
    }
  };

  const handleDelete = async (item: LibraryItem) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar "${item.name}"?`)) return;

    try {
      const componentParam = item.component_type ? `&component_type=${encodeURIComponent(item.component_type)}` : '';
      const response = await fetch(`http://127.0.0.1:8080/api/library/delete?filename=${encodeURIComponent(item.name)}&type=${activeTab}&device=${encodeURIComponent(item.device || 'General')}${componentParam}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchLibrary();
      } else {
        const err = await response.json();
        alert("Error: " + err.detail);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  };

  const handleAnalyze = (item: LibraryItem) => {
    if (onAnalyze) {
      onAnalyze(item.name, item.device, item.component_type);
    }
  };

  const openDatasheet = (item: LibraryItem) => {
    const relativePath = item.datasheet?.relative_path;
    if (!relativePath) return;
    fetch(`http://127.0.0.1:8080/api/datasheets/open?path=${encodeURIComponent(relativePath)}`)
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo abrir con el visor local');
      })
      .catch(() => {
        setPdfViewer({
          title: item.datasheet?.manufacturer_part_number || item.datasheet?.title || item.name,
          url: `http://127.0.0.1:8080/api/datasheets/file?path=${encodeURIComponent(relativePath)}#toolbar=1&navpanes=0`,
        });
      });
  };

  const parseError = async (response: Response, fallback: string) => {
    try {
      const err = await response.json();
      return err.detail || fallback;
    } catch {
      return `${fallback} (${response.status} ${response.statusText})`;
    }
  };

  const requestWithFallback = async (attempts: Array<{ url: string; init: RequestInit }>) => {
    let lastResponse: Response | null = null;
    for (const attempt of attempts) {
      const response = await fetch(attempt.url, attempt.init);
      if (response.ok) return response;
      lastResponse = response;
      if (![404, 405, 422].includes(response.status)) break;
    }
    return lastResponse;
  };

  const detachDatasheet = async (item: LibraryItem) => {
    if (!item.datasheet?.relative_path) return;
    if (!item.relative_path) return;
    if (!confirm(`¿Desanclar el datasheet de "${item.name}"? El PDF guardado no se elimina.`)) return;
    try {
      const payload = JSON.stringify({ measurement_relative_path: item.relative_path });
      const response = await requestWithFallback([
        {
          url: `http://127.0.0.1:8080/api/library/measurement/datasheet/detach?measurement_relative_path=${encodeURIComponent(item.relative_path)}`,
          init: { method: 'POST' },
        },
        {
          url: 'http://127.0.0.1:8080/api/library/measurement/datasheet',
          init: { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: payload },
        },
        {
          url: `http://127.0.0.1:8080/api/library/measurement/datasheet?measurement_relative_path=${encodeURIComponent(item.relative_path)}`,
          init: { method: 'DELETE' },
        },
      ]);
      if (!response.ok) {
        throw new Error(await parseError(response, 'No se pudo desanclar el datasheet'));
      }
      await fetchLibrary();
      setSelectedItem(null);
    } catch (error) {
      alert('Error desanclando datasheet: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const clearComponentValues = async (item: LibraryItem) => {
    if (!item.component_metadata) return;
    if (!item.relative_path) return;
    if (!confirm(`¿Borrar los valores de componente de "${item.name}"?`)) return;
    try {
      const payload = JSON.stringify({ measurement_relative_path: item.relative_path });
      const response = await requestWithFallback([
        {
          url: `http://127.0.0.1:8080/api/library/measurement/component-metadata/clear?measurement_relative_path=${encodeURIComponent(item.relative_path)}`,
          init: { method: 'POST' },
        },
        {
          url: 'http://127.0.0.1:8080/api/library/measurement/component-metadata',
          init: { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: payload },
        },
        {
          url: `http://127.0.0.1:8080/api/library/measurement/component-metadata?measurement_relative_path=${encodeURIComponent(item.relative_path)}`,
          init: { method: 'DELETE' },
        },
      ]);
      if (!response.ok) {
        throw new Error(await parseError(response, 'No se pudieron borrar los valores'));
      }
      await fetchLibrary();
      setSelectedItem(null);
    } catch (error) {
      alert('Error borrando valores: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const rebuildIndex = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://127.0.0.1:8080/api/library/index/rebuild', { method: 'POST' });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'No se pudo reconstruir el índice');
      }
      await fetchLibrary();
    } catch (error) {
      alert('Error reconstruyendo índice: ' + (error instanceof Error ? error.message : String(error)));
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  const formatFreq = (hz?: number | null) => {
    if (!hz) return '-';
    if (hz >= 1e9) return `${(hz / 1e9).toFixed(3)} GHz`;
    if (hz >= 1e6) return `${(hz / 1e6).toFixed(2)} MHz`;
    if (hz >= 1e3) return `${(hz / 1e3).toFixed(2)} kHz`;
    return `${hz.toFixed(0)} Hz`;
  };

  const devices = Array.from(new Set([
    ...items.measurements.map(i => i.device),
    ...items.calibrations.map(i => i.device)
  ].filter(Boolean) as string[]));
  const componentTypes = Array.from(new Set(items.measurements.map(i => i.component_type).filter(Boolean) as string[]));
  const componentLabel = (type?: string | null) => {
    if (type === 'capacitor') return 'Condensador';
    if (type === 'inductor') return 'Bobina';
    if (type === 'resistor') return 'Resistencia';
    return '-';
  };

  const componentMetadataChips = (item: LibraryItem) => {
    const md = item.component_metadata || {};
    return [
      md.nominal_value,
      md.tolerance,
      md.voltage_rating,
      md.current_rating,
      md.power_rating,
      md.package,
      md.dielectric_or_material,
      md.operating_frequency_range,
      md.lifecycle_status,
    ].filter(Boolean) as string[];
  };

  const metadataRows = (item: LibraryItem | null) => {
    if (!item) return [];
    const md = item.component_metadata || {};
    return [
      ['Archivo', item.name],
      ['Ruta biblioteca', item.relative_path],
      ['Dispositivo', item.device],
      ['Componente', componentLabel(item.component_type)],
      ['ID medición', item.measurement_id],
      ['Frecuencia', `${formatFreq(item.fmin_hz)} - ${formatFreq(item.fmax_hz)}`],
      ['Puntos', item.points ? `${item.points}` : undefined],
      ['Averaging', item.averaging_count ? `${item.averaging_count}` : undefined],
      ['Smoothing', item.smoothing_window ? `${item.smoothing_window}` : undefined],
      ['Fabricante', md.manufacturer || item.datasheet?.manufacturer],
      ['Referencia fabricante', md.manufacturer_part_number || item.datasheet?.manufacturer_part_number],
      ['Proveedor', md.supplier || item.datasheet?.supplier],
      ['Referencia proveedor', md.supplier_part_number],
      ['Descripción producto', md.product_description],
      ['Categoría producto', md.product_category],
      ['Valor nominal', md.nominal_value],
      ['Tolerancia', md.tolerance],
      ['Tensión nominal', md.voltage_rating],
      ['Corriente nominal', md.current_rating],
      ['Potencia nominal', md.power_rating],
      ['Temperatura', md.temperature_range],
      ['Encapsulado', md.package],
      ['Material / dieléctrico', md.dielectric_or_material],
      ['Rango funcionamiento', md.operating_frequency_range],
      ['Disponibilidad Mouser', md.mouser_availability],
      ['Ciclo de vida', md.lifecycle_status],
      ['Fuente metadata', md.metadata_source],
    ].filter(([, value]) => value && value !== '-');
  };

  const filteredItems = (activeTab === 'measurements' ? items.measurements : 
                        activeTab === 'calibrations' ? items.calibrations : 
                        items.extractions).filter(item => {
    const haystack = `${item.name} ${item.measurement_id || ''}`.toLowerCase();
    const matchesSearch = haystack.includes(searchTerm.toLowerCase());
    const matchesDevice = deviceFilter === 'all' || item.device === deviceFilter;
    const matchesComponent = activeTab !== 'measurements' || componentFilter === 'all' || item.component_type === componentFilter;
    return matchesSearch && matchesDevice && matchesComponent;
  });

  const getIcon = (name: string) => {
    if (name.endsWith('.s1p') || name.endsWith('.s2p')) return <Activity className="w-4 h-4 text-blue-500" />;
    if (name.endsWith('.cal') || (activeTab === 'calibrations' && name.endsWith('.json'))) return <SlidersHorizontal className="w-4 h-4 text-orange-500" />;
    if (name.endsWith('.cir')) return <FileCode className="w-4 h-4 text-green-500" />;
    return <FileText className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Library className="w-8 h-8 text-primary" />
            {t('library')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('library.desc')}
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder={t('library.search')}
              className="pl-10 h-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Select value={deviceFilter} onValueChange={setDeviceFilter}>
            <SelectTrigger className="w-[180px] h-9">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filtrar por VNA" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los dispositivos</SelectItem>
              {devices.map(dev => (
                <SelectItem key={dev} value={dev}>{dev}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activeTab === 'measurements' && (
            <Select value={componentFilter} onValueChange={setComponentFilter}>
              <SelectTrigger className="w-[170px] h-9">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Componente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los componentes</SelectItem>
                {componentTypes.map(type => (
                  <SelectItem key={type} value={type}>{componentLabel(type)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button variant="outline" size="icon" onClick={fetchLibrary} className="h-9 w-9">
            <Clock className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={rebuildIndex} className="h-9 gap-2">
            <HardDrive className="w-4 h-4" />
            Reindexar
          </Button>
        </div>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="px-4 pt-4 border-b border-border/50 bg-muted/30">
            <TabsList className="bg-transparent gap-6 h-10 p-0">
              <TabsTrigger 
                value="measurements" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-10 flex items-center gap-2"
              >
                <Activity className="w-4 h-4" />
                {t('library.measurements')}
                <Badge variant="secondary" className="ml-1 text-[10px] py-0 px-1.5 h-4">
                  {items.measurements.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger 
                value="calibrations" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-10 flex items-center gap-2"
              >
                <SlidersHorizontal className="w-4 h-4" />
                {t('library.calibrations')}
                <Badge variant="secondary" className="ml-1 text-[10px] py-0 px-1.5 h-4">
                  {items.calibrations.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger 
                value="extractions" 
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-10 flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                {t('library.extractions')}
                <Badge variant="secondary" className="ml-1 text-[10px] py-0 px-1.5 h-4">
                  {items.extractions.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="p-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <TabsContent value={activeTab} className="mt-0">
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="w-[390px]">Nombre</TableHead>
                        <TableHead className="w-[125px]">Dispositivo</TableHead>
                        {activeTab === 'measurements' && <TableHead className="w-[120px]">Componente</TableHead>}
                        {activeTab === 'measurements' && <TableHead>Metadata</TableHead>}
                        <TableHead className="w-[210px] text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: activeTab === 'measurements' ? 5 : 3 }).map((_, j) => (
                              <TableCell key={j}><div className="h-4 w-full bg-muted animate-pulse rounded" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : filteredItems.length > 0 ? (
                        filteredItems.map((item, idx) => (
                          <TableRow 
                            key={idx} 
                            className="group hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => setSelectedItem(item)}
                          >
                            <TableCell className="w-[420px] font-medium">
                              <div className="flex items-center gap-3">
                                {getIcon(item.name)}
                                <span className="truncate max-w-[320px]" title={item.name}>{item.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="w-[135px]">
                              {item.device ? (
                                <Badge variant="outline" className="font-normal text-[11px]">
                                  {item.device}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            {activeTab === 'measurements' && (
                              <TableCell className="w-[130px]">
                                {item.component_type ? (
                                  <Badge variant="secondary" className="font-normal text-[11px]">
                                    {componentLabel(item.component_type)}
                                  </Badge>
                                ) : '-'}
                              </TableCell>
                            )}
                            {activeTab === 'measurements' && (
                              <TableCell className="w-[260px] max-w-[260px] text-muted-foreground text-[11px]">
                                <div className="space-y-1">
                                  <div>{formatFreq(item.fmin_hz)} - {formatFreq(item.fmax_hz)}</div>
                                  <div>
                                    {item.points ? `${item.points} pts` : '-'}
                                    {item.averaging_count ? ` · avg ${item.averaging_count}` : ''}
                                    {item.smoothing_window ? ` · sm ${item.smoothing_window}` : ''}
                                  </div>
                                  {(item.component_metadata?.manufacturer || item.component_metadata?.manufacturer_part_number) && (
                                    <div className="truncate text-foreground" title={`${item.component_metadata?.manufacturer || ''} ${item.component_metadata?.manufacturer_part_number || ''}`}>
                                      {[item.component_metadata?.manufacturer, item.component_metadata?.manufacturer_part_number].filter(Boolean).join(' · ')}
                                    </div>
                                  )}
                                  {componentMetadataChips(item).length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {componentMetadataChips(item).slice(0, 5).map((value) => (
                                        <Badge key={value} variant="outline" className="h-5 max-w-[120px] truncate px-1.5 text-[10px] font-normal">
                                          {value}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                  {item.datasheet?.relative_path && (
                                    <div className="flex items-center gap-1 text-primary">
                                      <FileSearch className="h-3 w-3 shrink-0" />
                                      <span className="truncate">{item.datasheet.manufacturer_part_number || item.datasheet.title || 'Datasheet fijado'}</span>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            )}
                            <TableCell className="w-[210px] text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                                  onClick={() => openLocation(item)}
                                  title="Abrir ubicación"
                                >
                                  <FolderOpen className="w-4 h-4" />
                                </Button>
                                 <Button 
                                   variant="ghost" 
                                   size="icon" 
                                   className="h-8 w-8 hover:bg-primary/10 hover:text-primary relative"
                                   onClick={() => handleAnalyze(item)}
                                   title={item.analysis_history && Object.keys(item.analysis_history).length > 0
                                     ? `Analizar (Caracterizado por ${Object.keys(item.analysis_history).length}/5 herramientas)`
                                     : "Analizar"
                                   }
                                 >
                                   <ExternalLink className="w-4 h-4" />
                                   {item.analysis_history && Object.keys(item.analysis_history).length > 0 && (
                                     <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[8px] font-black text-white ring-1 ring-background">
                                       {Object.keys(item.analysis_history).length}
                                     </span>
                                   )}
                                 </Button>
                                {activeTab === 'measurements' && item.datasheet?.relative_path && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                                    onClick={() => openDatasheet(item)}
                                    title="Abrir datasheet"
                                  >
                                    <FileSearch className="w-4 h-4" />
                                  </Button>
                                )}
                                {activeTab === 'measurements' && item.datasheet?.relative_path && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-amber-500/10 hover:text-amber-600"
                                    onClick={() => detachDatasheet(item)}
                                    title="Desanclar datasheet"
                                  >
                                    <Unlink className="w-4 h-4" />
                                  </Button>
                                )}
                                {activeTab === 'measurements' && item.component_metadata && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-amber-500/10 hover:text-amber-600"
                                    onClick={() => clearComponentValues(item)}
                                    title="Borrar valores del componente"
                                  >
                                    <Eraser className="w-4 h-4" />
                                  </Button>
                                )}
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                                  onClick={() => handleDelete(item)}
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={activeTab === 'measurements' ? 5 : 3} className="h-64 text-center">
                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                              <Library className="w-12 h-12 mb-4 opacity-10" />
                              <p className="text-sm font-medium">{t('library.empty')}</p>
                              <p className="text-xs opacity-60">No hay archivos en esta categoría para el filtro actual.</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
              </motion.div>
            </AnimatePresence>
          </div>
        </Tabs>
      </Card>
      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="pr-8">{selectedItem?.name || 'Detalle de medición'}</DialogTitle>
            <DialogDescription>
              Características guardadas en la biblioteca y valores extraídos desde datasheet/API.
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
              <div className="space-y-3">
                <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-border bg-muted/20">
                  {(selectedItem.component_metadata?.mouser_image_url || selectedItem.datasheet?.image_url) ? (
                    <img
                      src={selectedItem.component_metadata?.mouser_image_url || selectedItem.datasheet?.image_url}
                      alt={selectedItem.component_metadata?.manufacturer_part_number || selectedItem.name}
                      className="h-full w-full object-contain p-2"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                      <ImageIcon className="h-8 w-8 opacity-50" />
                      Sin imagen
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedItem.component_type && <Badge variant="secondary">{componentLabel(selectedItem.component_type)}</Badge>}
                  {selectedItem.datasheet?.relative_path && <Badge variant="outline">Datasheet fijado</Badge>}
                  {selectedItem.component_metadata?.metadata_source && <Badge variant="outline">{selectedItem.component_metadata.metadata_source}</Badge>}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {selectedItem.analysis_history && Object.keys(selectedItem.analysis_history).length > 0 && (
                    <Button 
                      variant="default" 
                      size="sm" 
                      onClick={() => handleGenerateReport(selectedItem)} 
                      disabled={generatingReport}
                      className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700 font-bold shadow-sm"
                    >
                      <FileText className="h-4 w-4" />
                      {generatingReport ? "Generando..." : "Generar Informe"}
                    </Button>
                  )}
                  {selectedItem.datasheet?.relative_path && (
                    <Button variant="outline" size="sm" onClick={() => openDatasheet(selectedItem)} className="gap-2">
                      <FileSearch className="h-4 w-4" />
                      Abrir datasheet
                    </Button>
                  )}
                  {selectedItem.component_metadata?.mouser_product_url && (
                    <Button variant="outline" size="sm" onClick={() => window.open(selectedItem.component_metadata?.mouser_product_url, '_blank')} className="gap-2">
                      <ExternalLink className="h-4 w-4" />
                      Página Mouser
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => openLocation(selectedItem)} className="gap-2">
                    <FolderOpen className="h-4 w-4" />
                    Abrir carpeta
                  </Button>
                  {selectedItem.datasheet?.relative_path && (
                    <Button variant="outline" size="sm" onClick={() => detachDatasheet(selectedItem)} className="gap-2">
                      <Unlink className="h-4 w-4" />
                      Desanclar datasheet
                    </Button>
                  )}
                  {selectedItem.component_metadata && (
                    <Button variant="outline" size="sm" onClick={() => clearComponentValues(selectedItem)} className="gap-2">
                      <Eraser className="h-4 w-4" />
                      Borrar valores
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {metadataRows(selectedItem).map(([label, value]) => (
                    <div key={label} className="rounded-md border border-border bg-muted/20 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                      <div className="mt-1 break-words text-sm">{value}</div>
                    </div>
                  ))}
                </div>

                {/* Characterization Status Badges */}
                <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Estado de Caracterización (Herramientas)</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedItem.analysis_history?.s_params ? (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 cursor-help animate-in fade-in" title={`Analizado el: ${new Date(selectedItem.analysis_history.s_params.analyzed_at * 1000).toLocaleString()}`}>S-Params ✓</Badge>
                    ) : (
                      <Badge variant="outline" className="opacity-40 border-dashed">S-Params</Badge>
                    )}
                    {selectedItem.analysis_history?.cutoff_freq ? (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 cursor-help animate-in fade-in" title={`Analizado el: ${new Date(selectedItem.analysis_history.cutoff_freq.analyzed_at * 1000).toLocaleString()}`}>Cutoff Freq ✓</Badge>
                    ) : (
                      <Badge variant="outline" className="opacity-40 border-dashed">Cutoff Freq</Badge>
                    )}
                    {selectedItem.analysis_history?.compact_model_shunt ? (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 cursor-help animate-in fade-in" title={`Shunt - Analizado el: ${new Date(selectedItem.analysis_history.compact_model_shunt.analyzed_at * 1000).toLocaleString()}`}>RLC Shunt ✓</Badge>
                    ) : null}
                    {selectedItem.analysis_history?.compact_model_vf ? (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 cursor-help animate-in fade-in" title={`VF - Analizado el: ${new Date(selectedItem.analysis_history.compact_model_vf.analyzed_at * 1000).toLocaleString()}`}>RLC VF ✓</Badge>
                    ) : null}
                    {selectedItem.analysis_history?.compact_model && !selectedItem.analysis_history?.compact_model_shunt && !selectedItem.analysis_history?.compact_model_vf ? (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 cursor-help animate-in fade-in" title={`Analizado el: ${new Date(selectedItem.analysis_history.compact_model.analyzed_at * 1000).toLocaleString()}`}>RLC Model ✓</Badge>
                    ) : null}
                    {!selectedItem.analysis_history?.compact_model_shunt && !selectedItem.analysis_history?.compact_model_vf && !selectedItem.analysis_history?.compact_model ? (
                      <Badge variant="outline" className="opacity-40 border-dashed">RLC Model</Badge>
                    ) : null}
                    {selectedItem.analysis_history?.quick_extract ? (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 cursor-help animate-in fade-in" title={`Analizado el: ${new Date(selectedItem.analysis_history.quick_extract.analyzed_at * 1000).toLocaleString()}`}>Quick Extract ✓</Badge>
                    ) : (
                      <Badge variant="outline" className="opacity-40 border-dashed">Quick Extract</Badge>
                    )}
                    {selectedItem.analysis_history?.samm ? (
                      <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 cursor-help animate-in fade-in" title={`Analizado el: ${new Date(selectedItem.analysis_history.samm.analyzed_at * 1000).toLocaleString()}`}>SAMM ✓</Badge>
                    ) : (
                      <Badge variant="outline" className="opacity-40 border-dashed">SAMM</Badge>
                    )}
                  </div>
                </div>

                {selectedItem.component_metadata?.notes && (
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Notas</div>
                    <div className="mt-1 text-sm text-muted-foreground">{selectedItem.component_metadata.notes}</div>
                  </div>
                )}
                {selectedItem.component_metadata?.mouser_attributes && (
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Atributos Mouser</div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {Object.entries(selectedItem.component_metadata.mouser_attributes).slice(0, 16).map(([key, value]) => (
                        <div key={key} className="text-xs">
                          <span className="text-muted-foreground">{key}: </span>
                          <span>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!pdfViewer} onOpenChange={(open) => !open && setPdfViewer(null)}>
        <DialogContent className="h-[90vh] max-w-[min(96vw,1100px)] p-3">
          <DialogHeader className="px-1">
            <DialogTitle className="pr-8">{pdfViewer?.title || 'Datasheet'}</DialogTitle>
            <DialogDescription>PDF guardado en la biblioteca local.</DialogDescription>
          </DialogHeader>
          {pdfViewer && (
            <iframe
              title={pdfViewer.title}
              src={pdfViewer.url}
              className="h-full min-h-0 w-full rounded-md border border-border bg-background"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const AnimatePresence = ({ children, mode }: { children: React.ReactNode, mode?: "wait" | "popLayout" | "sync" }) => {
  return <>{children}</>;
};

