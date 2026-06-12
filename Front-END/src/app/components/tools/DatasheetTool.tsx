import React, { useEffect, useMemo, useState } from 'react';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Download, ExternalLink, FileSearch, Info, KeyRound, Link as LinkIcon, RefreshCw } from 'lucide-react';

interface MeasurementItem {
  name: string;
  relative_path: string;
  device?: string;
  component_type?: string | null;
  datasheet?: {
    relative_path?: string;
    manufacturer?: string;
    manufacturer_part_number?: string;
    supplier?: string;
    title?: string;
  };
  component_metadata?: ComponentMetadata;
}

interface ComponentMetadata {
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
  lifecycle_status?: string;
  notes?: string;
  datasheet_url?: string;
  supplier_url?: string;
}

interface DatasheetResult {
  supplier: string;
  manufacturer_part_number?: string;
  supplier_part_number?: string;
  manufacturer?: string;
  description?: string;
  category?: string;
  datasheet_url?: string;
  product_url?: string;
  image_url?: string;
  availability?: string;
  lifecycle_status?: string;
  attributes?: Record<string, string>;
}

export function DatasheetTool() {
  const [measurements, setMeasurements] = useState<MeasurementItem[]>([]);
  const [selectedMeasurement, setSelectedMeasurement] = useState('');
  const [query, setQuery] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [supplier, setSupplier] = useState('mouser');
  const [results, setResults] = useState<DatasheetResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [metadata, setMetadata] = useState<ComponentMetadata>({});
  const [mouserKey, setMouserKey] = useState('');
  const [mouserStatus, setMouserStatus] = useState<{ configured: boolean; source?: string; masked_key?: string | null }>({ configured: false });
  const [showProviderConfig, setShowProviderConfig] = useState(false);

  const selectedEntry = useMemo(
    () => measurements.find((item) => item.relative_path === selectedMeasurement),
    [measurements, selectedMeasurement],
  );

  useEffect(() => {
    fetchMeasurements();
    fetchProviderStatus();
  }, []);

  useEffect(() => {
    if (selectedEntry) {
      setMetadata({
        ...(selectedEntry.component_metadata || {}),
        manufacturer: selectedEntry.component_metadata?.manufacturer || selectedEntry.datasheet?.manufacturer || '',
        manufacturer_part_number: selectedEntry.component_metadata?.manufacturer_part_number || selectedEntry.datasheet?.manufacturer_part_number || '',
        supplier: selectedEntry.component_metadata?.supplier || selectedEntry.datasheet?.supplier || '',
        datasheet_url: selectedEntry.component_metadata?.datasheet_url || selectedEntry.datasheet?.url || '',
        supplier_url: selectedEntry.component_metadata?.supplier_url || selectedEntry.component_metadata?.mouser_product_url || '',
      });
    } else {
      setMetadata({});
    }
  }, [selectedEntry]);

  const fetchMeasurements = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8080/api/vna/measurements');
      if (response.ok) {
        const data = await response.json();
        setMeasurements(data);
      }
    } catch (error) {
      console.error('Error loading measurements:', error);
    }
  };

  const fetchProviderStatus = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8080/api/datasheets/providers');
      if (response.ok) {
        const data = await response.json();
        setMouserStatus(data.mouser || { configured: false });
      }
    } catch (error) {
      console.error('Error loading datasheet provider status:', error);
    }
  };

  const saveMouserKey = async () => {
    if (!mouserKey.trim()) {
      alert('Introduce la API key de Mouser.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('http://127.0.0.1:8080/api/datasheets/providers/mouser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: mouserKey.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'No se pudo guardar la API key');
      }
      setMouserStatus(data.mouser);
      setMouserKey('');
      setMessage('API key de Mouser guardada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const search = async () => {
    if (!query.trim()) {
      alert('Introduce una referencia de componente.');
      return;
    }
    setLoading(true);
    setMessage('');
    setResults([]);
    try {
      const response = await fetch(`http://127.0.0.1:8080/api/datasheets/search?query=${encodeURIComponent(query)}&supplier=${encodeURIComponent(supplier)}&limit=10`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Error buscando datasheets');
      }
      setResults(data.results || []);
      if (!data.results?.length) {
        setMessage('No se encontraron datasheets para esa referencia.');
      } else if (data.datasheet_count === 0) {
        setMessage('Mouser encontró componentes, pero ninguno incluye URL de datasheet en la respuesta.');
      } else {
        setMessage(`${data.results.length} resultado(s), ${data.datasheet_count} con datasheet.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const downloadAndAttach = async (result: DatasheetResult) => {
    if (!result.datasheet_url) return;
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('http://127.0.0.1:8080/api/datasheets/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasheet_url: result.datasheet_url,
          supplier: result.supplier,
          manufacturer: result.manufacturer,
          manufacturer_part_number: result.manufacturer_part_number,
          supplier_part_number: result.supplier_part_number,
          measurement_relative_path: selectedMeasurement || undefined,
          title: result.description,
          image_url: result.image_url,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'No se pudo descargar el datasheet');
      }
      setMessage(selectedMeasurement ? `Datasheet descargado y fijado: ${data.name}` : `Datasheet descargado: ${data.name}`);
      await fetchMeasurements();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const downloadManual = async () => {
    if (!manualUrl.trim()) {
      alert('Introduce una URL de datasheet.');
      return;
    }
    await downloadAndAttach({
      supplier: 'manual',
      datasheet_url: manualUrl.trim(),
      manufacturer_part_number: query.trim() || undefined,
      description: query.trim() || 'Manual datasheet',
    });
  };

  const openDatasheet = (relativePath?: string) => {
    if (!relativePath) return;
    const url = `http://127.0.0.1:8080/api/datasheets/file?path=${encodeURIComponent(relativePath)}`;
    window.open(url, '_blank');
  };

  const updateMetadataField = (field: keyof ComponentMetadata, value: string) => {
    setMetadata((current) => ({ ...current, [field]: value }));
  };

  const saveMetadata = async () => {
    if (!selectedMeasurement) {
      alert('Selecciona una medición antes de guardar metadatos.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('http://127.0.0.1:8080/api/library/measurement/component-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          measurement_relative_path: selectedMeasurement,
          ...metadata,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'No se pudieron guardar los metadatos');
      }
      setMessage('Metadatos del componente actualizados.');
      await fetchMeasurements();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const extractMetadata = async () => {
    if (!selectedMeasurement || !selectedEntry?.datasheet?.relative_path) {
      alert('Selecciona una medición con datasheet fijado.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('http://127.0.0.1:8080/api/datasheets/extract-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          measurement_relative_path: selectedMeasurement,
          datasheet_relative_path: selectedEntry.datasheet.relative_path,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'No se pudo extraer metadata del datasheet');
      }
      setMetadata(data.measurement?.component_metadata || data.metadata || {});
      setMessage('Metadatos extraídos del datasheet. Revísalos antes de usarlos como definitivos.');
      await fetchMeasurements();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const completeFromMouser = async (result?: DatasheetResult) => {
    if (!selectedMeasurement) {
      alert('Selecciona una medición antes de completar datos desde Mouser.');
      return;
    }
    if (!result && !query.trim()) {
      alert('Introduce una referencia o selecciona un resultado de Mouser.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('http://127.0.0.1:8080/api/datasheets/enrich-from-mouser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          measurement_relative_path: selectedMeasurement,
          query: result ? undefined : query.trim(),
          result,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'No se pudieron completar los datos desde Mouser');
      }
      setMetadata(data.metadata || {});
      setMessage('Datos completados desde Mouser. Revisa los campos antes de usarlos como definitivos.');
      await fetchMeasurements();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolShell
      title="Datasheets"
      description="Busca hojas de datos por referencia y fíjalas a una medición de la biblioteca."
      actions={[
        { id: 'refresh', label: 'Actualizar mediciones', variant: 'outline' },
        { id: 'search', label: 'Buscar', variant: 'default' },
      ]}
      onAction={(id) => {
        if (id === 'refresh') fetchMeasurements();
        if (id === 'search') search();
      }}
    >
      <div className="mb-3 grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground sm:grid-cols-4">
        <div className="flex items-center gap-2"><Info className="h-3.5 w-3.5 text-primary" /> 1. Selecciona medición</div>
        <div>2. Busca por referencia</div>
        <div>3. Completa datos o descarga PDF</div>
        <div>4. Revisa y guarda</div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.78fr_1.22fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <LinkIcon className="h-5 w-5 text-primary" />
                Componente vinculado
              </CardTitle>
              <CardDescription>Selecciona la medición a la que quieres fijar el datasheet.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={selectedMeasurement} onValueChange={setSelectedMeasurement}>
                <SelectTrigger className="bg-input-background">
                  <SelectValue placeholder="Selecciona una medición..." />
                </SelectTrigger>
                <SelectContent>
                  {measurements.map((item) => (
                    <SelectItem key={item.relative_path || item.name} value={item.relative_path}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedEntry && (
                <div className="rounded-md border border-border bg-muted/20 p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{selectedEntry.device || 'Sin dispositivo'}</Badge>
                    {selectedEntry.component_type && <Badge variant="secondary">{selectedEntry.component_type}</Badge>}
                  </div>
                  {selectedEntry.datasheet?.relative_path && (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded border border-border bg-background px-2 py-2">
                      <span className="truncate">{selectedEntry.datasheet.manufacturer_part_number || selectedEntry.datasheet.title || 'Datasheet fijado'}</span>
                      <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={() => openDatasheet(selectedEntry.datasheet?.relative_path)}>
                        <ExternalLink className="h-3.5 w-3.5" />
                        Abrir
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Datos del componente</CardTitle>
              <CardDescription>Extrae datos del PDF y corrige manualmente los campos importantes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Marca / fabricante</Label>
                  <Input value={metadata.manufacturer || ''} onChange={(e) => updateMetadataField('manufacturer', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Referencia fabricante</Label>
                  <Input value={metadata.manufacturer_part_number || ''} onChange={(e) => updateMetadataField('manufacturer_part_number', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Valor nominal</Label>
                  <Input value={metadata.nominal_value || ''} onChange={(e) => updateMetadataField('nominal_value', e.target.value)} placeholder="Ej: 100 nF, 10 uH, 50 Ohm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Tolerancia</Label>
                  <Input value={metadata.tolerance || ''} onChange={(e) => updateMetadataField('tolerance', e.target.value)} placeholder="Ej: ±5%" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Tensión nominal</Label>
                  <Input value={metadata.voltage_rating || ''} onChange={(e) => updateMetadataField('voltage_rating', e.target.value)} placeholder="Ej: 50 V" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Corriente nominal</Label>
                  <Input value={metadata.current_rating || ''} onChange={(e) => updateMetadataField('current_rating', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Potencia nominal</Label>
                  <Input value={metadata.power_rating || ''} onChange={(e) => updateMetadataField('power_rating', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Temperatura</Label>
                  <Input value={metadata.temperature_range || ''} onChange={(e) => updateMetadataField('temperature_range', e.target.value)} placeholder="-55 °C to +125 °C" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Encapsulado</Label>
                  <Input value={metadata.package || ''} onChange={(e) => updateMetadataField('package', e.target.value)} placeholder="0603, 0805..." />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Material / dieléctrico</Label>
                  <Input value={metadata.dielectric_or_material || ''} onChange={(e) => updateMetadataField('dielectric_or_material', e.target.value)} placeholder="X7R, C0G, ferrite..." />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Rango de funcionamiento</Label>
                <Input value={metadata.operating_frequency_range || ''} onChange={(e) => updateMetadataField('operating_frequency_range', e.target.value)} placeholder="Ej: 1 MHz to 1 GHz" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Descripción producto API</Label>
                <Input value={metadata.product_description || ''} onChange={(e) => updateMetadataField('product_description', e.target.value)} placeholder="Descripción Mouser / fabricante" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Notas</Label>
                <Input value={metadata.notes || ''} onChange={(e) => updateMetadataField('notes', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Enlace Web Datasheet (URL)</Label>
                <Input value={metadata.datasheet_url || ''} onChange={(e) => updateMetadataField('datasheet_url', e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Enlace Web Producto</Label>
                <Input value={metadata.supplier_url || ''} onChange={(e) => updateMetadataField('supplier_url', e.target.value)} placeholder="https://..." />
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={extractMetadata} disabled={loading || !selectedEntry?.datasheet?.relative_path}>
                  Extraer del datasheet
                </Button>
                <Button onClick={saveMetadata} disabled={loading || !selectedMeasurement}>
                  Guardar datos
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileSearch className="h-5 w-5 text-primary" />
                Búsqueda
              </CardTitle>
              <CardDescription>
                {mouserStatus.configured
                  ? `Mouser configurado (${mouserStatus.source || 'config'}: ${mouserStatus.masked_key || 'key guardada'}).`
                  : 'Configura una API key de Mouser o usa URL manual.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowProviderConfig((value) => !value)} className="h-7 gap-2">
                  <KeyRound className="h-3.5 w-3.5" />
                  API key
                </Button>
              </div>
              {(!mouserStatus.configured || showProviderConfig) && (
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                  <Input
                    value={mouserKey}
                    onChange={(e) => setMouserKey(e.target.value)}
                    type="password"
                    placeholder="Mouser API key"
                  />
                  <Button variant="outline" onClick={saveMouserKey} disabled={loading}>
                    Guardar key
                  </Button>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Se guarda localmente en Biblioteca/config/datasheet_providers.json. Si existe MOUSER_API_KEY en el entorno, esa tiene prioridad.
                </p>
              </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px]">
                <div className="space-y-2">
                  <Label className="text-xs">Referencia</Label>
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej: GRM188R71H104KA93D" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Proveedor</Label>
                  <Select value={supplier} onValueChange={setSupplier}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mouser">Mouser</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button onClick={search} disabled={loading} className="gap-2">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  Buscar
                </Button>
                <Button variant="outline" onClick={() => completeFromMouser()} disabled={loading || !selectedMeasurement} className="gap-2">
                  <FileSearch className="h-4 w-4" />
                  Completar
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                <Input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="URL manual de datasheet PDF" />
                <Button variant="outline" onClick={downloadManual} disabled={loading} className="gap-2">
                  <Download className="h-4 w-4" />
                  Fijar PDF
                </Button>
              </div>
            </CardContent>
          </Card>

          {/*
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">URL manual</CardTitle>
              <CardDescription>Útil para datasheets del fabricante o cuando no hay API key.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="https://.../datasheet.pdf" />
              <Button variant="outline" onClick={downloadManual} disabled={loading} className="w-full gap-2">
                <Download className="h-4 w-4" />
                Descargar y fijar URL
              </Button>
            </CardContent>
          */}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Resultados</CardTitle>
            <CardDescription>Descarga el PDF y fíjalo a la medición seleccionada.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {message && (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                {message}
              </div>
            )}

            {results.map((result, index) => (
              <div key={`${result.supplier_part_number || result.manufacturer_part_number}-${index}`} className="rounded-md border border-border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 gap-3">
                    {result.image_url && (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/20">
                        <img src={result.image_url} alt={result.manufacturer_part_number || 'Componente'} className="h-full w-full object-contain p-1" />
                      </div>
                    )}
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{result.manufacturer_part_number || result.supplier_part_number || 'Sin referencia'}</h3>
                      <Badge variant="outline">{result.supplier}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{result.description || result.category || 'Sin descripción'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{result.manufacturer}</p>
                    {result.attributes && Object.keys(result.attributes).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(result.attributes).slice(0, 5).map(([key, value]) => (
                          <Badge key={key} variant="secondary" className="max-w-[180px] truncate text-[10px] font-normal">
                            {key}: {value}
                          </Badge>
                        ))}
                      </div>
                    )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => completeFromMouser(result)} disabled={loading || !selectedMeasurement} className="gap-2">
                      <FileSearch className="h-4 w-4" />
                      Completar datos
                    </Button>
                    <Button size="sm" onClick={() => downloadAndAttach(result)} disabled={loading || !result.datasheet_url} className="gap-2">
                      <Download className="h-4 w-4" />
                      {result.datasheet_url ? 'Descargar' : 'Sin PDF'}
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {result.supplier_part_number && <Badge variant="secondary">{result.supplier_part_number}</Badge>}
                  {result.availability && <Badge variant="outline">{result.availability}</Badge>}
                  {result.lifecycle_status && <Badge variant="outline">{result.lifecycle_status}</Badge>}
                  {result.product_url && (
                    <a className="text-primary underline-offset-4 hover:underline" href={result.product_url} target="_blank" rel="noreferrer">
                      Página producto
                    </a>
                  )}
                  {result.datasheet_url && (
                    <a className="text-primary underline-offset-4 hover:underline" href={result.datasheet_url} target="_blank" rel="noreferrer">
                      Datasheet original
                    </a>
                  )}
                </div>
              </div>
            ))}

            {!loading && !message && results.length === 0 && (
              <div className="flex min-h-[260px] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
                Busca una referencia para ver resultados.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ToolShell>
  );
}
