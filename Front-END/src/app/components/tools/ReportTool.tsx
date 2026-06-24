import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { cn } from '../ui/utils';
import {
  FileText, Download, Save, RefreshCw, Search, Eye, ChevronLeft,
  Loader2, CheckCircle2, AlertCircle, Filter
} from 'lucide-react';

interface Measurement {
  name: string;
  relative_path: string;
  device?: string;
  component_type?: string;
  fmin_hz?: number;
  fmax_hz?: number;
}

type Step = 'select' | 'preview';

export function ReportTool() {
  const [step, setStep] = useState<Step>('select');
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [filtered, setFiltered] = useState<Measurement[]>([]);
  const [search, setSearch] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('all');
  const [devices, setDevices] = useState<string[]>([]);
  const [selected, setSelected] = useState<Measurement | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [htmlContent, setHtmlContent] = useState('');
  const [suggestedFilename, setSuggestedFilename] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    fetch('http://localhost:8080/api/library')
      .then(r => r.json())
      .then(data => {
        const list: Measurement[] = Object.values(data.measurements || {}) as Measurement[];
        setMeasurements(list);
        setFiltered(list);
        const devSet = Array.from(new Set(list.map(m => m.device).filter(Boolean))) as string[];
        setDevices(devSet);
      })
      .catch(() => toast.error('No se pudo cargar la biblioteca'));
  }, []);

  useEffect(() => {
    let result = measurements;
    if (deviceFilter !== 'all') result = result.filter(m => m.device === deviceFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        m.name?.toLowerCase().includes(q) ||
        m.device?.toLowerCase().includes(q) ||
        m.component_type?.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [search, deviceFilter, measurements]);

  async function generateReport() {
    if (!selected) return;
    setGenerating(true);
    try {
      const res = await fetch('http://localhost:8080/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ measurement_relative_path: selected.relative_path })
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Error');
      const data = await res.json();
      setHtmlContent(data.html_content);
      setSuggestedFilename(data.suggested_filename);
      setStep('preview');
    } catch (e: any) {
      toast.error('Error al generar informe: ' + e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function saveToServer() {
    if (!selected || !htmlContent) return;
    setSaving(true);
    try {
      const res = await fetch('http://localhost:8080/api/reports/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          measurement_relative_path: selected.relative_path,
          html_content: htmlContent
        })
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Error');
      const data = await res.json();
      toast.success('Informe guardado: ' + data.relative_path);
    } catch (e: any) {
      toast.error('Error al guardar: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  function downloadHtml() {
    const blob = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedFilename || 'report.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  function openInNewTab() {
    const blob = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  function fmtHz(hz?: number) {
    if (!hz) return '—';
    if (hz >= 1e9) return `${(hz / 1e9).toFixed(2)} GHz`;
    if (hz >= 1e6) return `${(hz / 1e6).toFixed(1)} MHz`;
    return `${(hz / 1e3).toFixed(1)} kHz`;
  }

  if (step === 'preview') {
    return (
      <ToolShell title="Informe RF" description={suggestedFilename}>
        <div className="flex flex-col gap-3 h-full">
          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setStep('select')}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Volver
            </Button>
            <Button variant="outline" size="sm" onClick={openInNewTab}>
              <Eye className="w-4 h-4 mr-1" /> Abrir en pestaña
            </Button>
            <Button variant="outline" size="sm" onClick={downloadHtml}>
              <Download className="w-4 h-4 mr-1" /> Descargar HTML
            </Button>
            <Button size="sm" onClick={saveToServer} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Guardar en biblioteca
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              Para PDF: Archivo → Imprimir → Guardar como PDF
            </span>
          </div>

          {/* Preview iframe */}
          <div className="flex-1 border border-border rounded-lg overflow-hidden min-h-[600px]">
            <iframe
              ref={iframeRef}
              srcDoc={htmlContent}
              className="w-full h-full"
              style={{ minHeight: 600 }}
              sandbox="allow-same-origin allow-scripts allow-popups"
              title="RF Report Preview"
            />
          </div>
        </div>
      </ToolShell>
    );
  }

  return (
    <ToolShell
      title="Generador de Informes"
      description="Selecciona una medida de la biblioteca y genera un informe profesional IEEE."
    >
      <div className="max-w-4xl mx-auto space-y-5 px-4 pb-8">
        {/* Filters */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="w-4 h-4" /> Filtros
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 flex gap-3 flex-wrap">
            <div className="flex-1 min-w-48 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar medida..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Select value={deviceFilter} onValueChange={setDeviceFilter}>
              <SelectTrigger className="w-48 h-9 text-sm">
                <SelectValue placeholder="Todos los equipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los equipos</SelectItem>
                {devices.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Measurement list */}
        <Card>
          <CardHeader className="py-3 px-4 border-b border-border">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Medidas disponibles ({filtered.length})</span>
              {selected && (
                <span className="text-xs text-primary font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {selected.name}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 max-h-80 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                <AlertCircle className="w-6 h-6 mx-auto mb-2 opacity-40" />
                No se encontraron medidas
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filtered.map(m => (
                  <button
                    key={m.relative_path}
                    onClick={() => setSelected(m)}
                    className={cn(
                      "w-full text-left px-4 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors text-sm",
                      selected?.relative_path === m.relative_path && "bg-primary/5 border-l-2 border-primary"
                    )}
                  >
                    <div>
                      <div className="font-medium text-foreground">{m.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {m.device && <span className="mr-3">{m.device}</span>}
                        {m.component_type && <span className="mr-3 capitalize">{m.component_type}</span>}
                        {m.fmin_hz && <span>{fmtHz(m.fmin_hz)} – {fmtHz(m.fmax_hz)}</span>}
                      </div>
                    </div>
                    {selected?.relative_path === m.relative_path && (
                      <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Generate button */}
        <div className="flex justify-end gap-3">
          {selected && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mr-auto">
              <FileText className="w-4 h-4" />
              <span className="truncate max-w-xs">{selected.name}</span>
            </div>
          )}
          <Button
            onClick={generateReport}
            disabled={!selected || generating}
            className="min-w-40"
          >
            {generating
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generando…</>
              : <><FileText className="w-4 h-4 mr-2" /> Generar Informe</>}
          </Button>
        </div>
      </div>
    </ToolShell>
  );
}
