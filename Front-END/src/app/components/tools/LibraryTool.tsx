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
  Table as TableIcon
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
import { motion } from 'motion/react';
import { useLanguage } from '../../lib/i18n';

interface LibraryItem {
  name: string;
  device?: string;
  size?: number;
  mtime: number;
  fmin?: number;
  fmax?: number;
  points?: number;
}

interface LibraryToolProps {
  onAnalyze?: (name: string, device?: string) => void;
}

export function LibraryTool({ onAnalyze }: LibraryToolProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('measurements');
  const [searchTerm, setSearchTerm] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('all');
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
    
    try {
      await fetch(`http://127.0.0.1:8080/api/utils/open-folder?path=${encodeURIComponent(path)}`);
    } catch (error) {
      console.error('Error opening folder:', error);
    }
  };

  const handleDelete = async (item: LibraryItem) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar "${item.name}"?`)) return;

    try {
      const response = await fetch(`http://127.0.0.1:8080/api/library/delete?filename=${encodeURIComponent(item.name)}&type=${activeTab}&device=${encodeURIComponent(item.device || 'General')}`, {
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
      onAnalyze(item.name, item.device);
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

  const devices = Array.from(new Set([
    ...items.measurements.map(i => i.device),
    ...items.calibrations.map(i => i.device)
  ].filter(Boolean) as string[]));

  const filteredItems = (activeTab === 'measurements' ? items.measurements : 
                        activeTab === 'calibrations' ? items.calibrations : 
                        items.extractions).filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDevice = deviceFilter === 'all' || item.device === deviceFilter;
    return matchesSearch && matchesDevice;
  });

  const getIcon = (name: string) => {
    if (name.endsWith('.s1p') || name.endsWith('.s2p')) return <Activity className="w-4 h-4 text-blue-500" />;
    if (name.endsWith('.cal')) return <SlidersHorizontal className="w-4 h-4 text-orange-500" />;
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

          <Button variant="outline" size="icon" onClick={fetchLibrary} className="h-9 w-9">
            <Clock className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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
                        <TableHead className="w-[400px]">Nombre</TableHead>
                        <TableHead>Dispositivo</TableHead>
                        <TableHead>Tamaño</TableHead>
                        <TableHead>Modificado</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            {Array.from({ length: 5 }).map((_, j) => (
                              <TableCell key={j}><div className="h-4 w-full bg-muted animate-pulse rounded" /></TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : filteredItems.length > 0 ? (
                        filteredItems.map((item, idx) => (
                          <TableRow 
                            key={idx} 
                            className="group hover:bg-muted/30 transition-colors cursor-pointer"
                            onClick={() => openLocation(item)}
                          >
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-3">
                                {getIcon(item.name)}
                                <span className="truncate max-w-[320px]" title={item.name}>{item.name}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {item.device ? (
                                <Badge variant="outline" className="font-normal text-[11px]">
                                  {item.device}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs">
                              {formatSize(item.size)}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                              {formatDate(item.mtime)}
                            </TableCell>
                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                                  className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                                  onClick={() => handleAnalyze(item)}
                                  title="Analizar"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </Button>
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
                          <TableCell colSpan={5} className="h-64 text-center">
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
    </div>
  );
}

const AnimatePresence = ({ children, mode }: { children: React.ReactNode, mode?: "wait" | "popLayout" | "sync" }) => {
  return <>{children}</>;
};
