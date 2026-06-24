import React, { useEffect, useRef, useState } from 'react';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Upload, FileCheck, Download, RefreshCw,
  CheckCircle2, AlertCircle, Layers, X,
  ChevronLeft, ChevronRight, Library, ArrowRight,
} from 'lucide-react';
import { cn } from '../ui/utils';

// ──────────────────────────────────────────────────────────────────────────────
// Esquemático SVG dinámico del modelo de fixture
// ──────────────────────────────────────────────────────────────────────────────
function FixtureSchematic({ fixtureModel }: { fixtureModel: string }) {
  const style = `
    .w  { stroke: currentColor; stroke-width:1.5; fill:none; }
    .c  { stroke: currentColor; stroke-width:1.5; fill:none; }
    .lbl{ font-family:monospace; font-size:9px; text-anchor:middle; fill:currentColor; opacity:.65; }
    .nm { font-family:monospace; font-size:11px; font-weight:700; text-anchor:middle; fill:currentColor; }
    .dim{ opacity:.25; }
    .alg{ font-family:monospace; font-size:8px; text-anchor:middle; fill:currentColor; opacity:.4; }
  `;

  // Shared: ports and ground rail
  const Ports = () => (<>
    <circle cx="30"  cy="52" r="5" className="c" />
    <text x="30"  y="44" className="lbl">P1</text>
    <circle cx="610" cy="52" r="5" className="c" />
    <text x="610" y="44" className="lbl">P2</text>
    <line x1="30" y1="128" x2="610" y2="128" className="w dim" />
  </>);

  // Inductor bumps helper
  const Inductor = ({ x1, y }: { x1: number; y: number }) => (
    <>
      {[x1, x1+15, x1+30, x1+45, x1+60].map((x, i, a) => i < a.length - 1
        ? <path key={x} d={`M${x} ${y} Q${x+7.5} ${y-10} ${x+15} ${y}`} className="c" /> : null)}
    </>
  );

  // Capacitor symbol helper
  const Cap = ({ x, y1, y2 }: { x: number; y1: number; y2: number }) => (
    <>
      <line x1={x} y1={y1} x2={x} y2={(y1+y2)/2 - 3} className="w" />
      <line x1={x-20} y1={(y1+y2)/2 - 3} x2={x+20} y2={(y1+y2)/2 - 3} className="c" />
      <line x1={x-20} y1={(y1+y2)/2 + 3} x2={x+20} y2={(y1+y2)/2 + 3} className="c" />
      <line x1={x} y1={(y1+y2)/2 + 3} x2={x} y2={y2} className="w" />
    </>
  );

  // DUT box (shunt, vertical)
  const DutShunt = ({ x }: { x: number }) => (<>
    <line x1={x} y1="52" x2={x} y2="72" className="w" />
    <rect x={x-37} y="72" width="74" height="30" rx="4" className="c" />
    <text x={x} y="92" className="nm">DUT</text>
    <line x1={x} y1="102" x2={x} y2="128" className="w" />
  </>);

  if (fixtureModel === 'pi') {
    // π: Yp/2 | Z_series | Yp/2   (DUT shunt in middle)
    return (
      <svg viewBox="0 0 640 160" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-2xl mx-auto">
        <style>{style}</style>
        <Ports />
        {/* signal line */}
        <line x1="30" y1="52" x2="125" y2="52" className="w" />
        <line x1="125" y1="52" x2="148" y2="52" className="w" />
        <Inductor x1={148} y={52} />
        <line x1="228" y1="52" x2="265" y2="52" className="w" />
        <line x1="265" y1="52" x2="375" y2="52" className="w" />
        <line x1="375" y1="52" x2="610" y2="52" className="w" />
        {/* Yp/2 left */}
        <Cap x={125} y1={52} y2={128} />
        <text x="125" y="148" className="lbl">Yₚ/2 (OPEN)</text>
        {/* Yp/2 right */}
        <Cap x={375} y1={52} y2={128} />
        <text x="375" y="148" className="lbl">Yₚ/2 (OPEN)</text>
        {/* DUT */}
        <DutShunt x={265} />
        {/* labels */}
        <text x="188" y="40" className="lbl">Z_series (SHORT)</text>
        <text x="320" y="14" className="alg">Paso 1: Y_corr = Y_dut − Y_open  ·  Paso 2: Z_int = Z(Y_corr_dut) − Z(Y_corr_short)</text>
      </svg>
    );
  }

  if (fixtureModel === 't') {
    // T: Za | Y_shunt | Zb   (DUT shunt in middle)
    return (
      <svg viewBox="0 0 640 160" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-2xl mx-auto">
        <style>{style}</style>
        <Ports />
        <line x1="30" y1="52" x2="80" y2="52" className="w" />
        <Inductor x1={80} y={52} />
        <line x1="155" y1="52" x2="265" y2="52" className="w" />
        <line x1="265" y1="52" x2="375" y2="52" className="w" />
        <Inductor x1={375} y={52} />
        <line x1="450" y1="52" x2="610" y2="52" className="w" />
        {/* Yshunt */}
        <Cap x={265} y1={52} y2={128} />
        <text x="265" y="148" className="lbl">Y_shunt (OPEN)</text>
        {/* DUT */}
        <DutShunt x={530} />
        {/* labels */}
        <text x="117" y="40" className="lbl">Za (SHORT)</text>
        <text x="412" y="40" className="lbl">Zb (SHORT)</text>
        <text x="320" y="14" className="alg">Paso 1: Z_corr = Z_dut − Z_short  ·  Paso 2: Y_int = Y(Z_corr_dut) − Y(Z_corr_open)</text>
      </svg>
    );
  }

  if (fixtureModel === 'series_only') {
    // Series only: Z_fix in series, DUT series
    return (
      <svg viewBox="0 0 640 120" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-2xl mx-auto">
        <style>{style}</style>
        <Ports />
        <line x1="30" y1="52" x2="100" y2="52" className="w" />
        <Inductor x1={100} y={52} />
        <line x1="175" y1="52" x2="240" y2="52" className="w" />
        {/* DUT series box */}
        <rect x="240" y="38" width="100" height="28" rx="4" className="c" />
        <text x="290" y="57" className="nm">DUT</text>
        <line x1="340" y1="52" x2="420" y2="52" className="w" />
        <Inductor x1={420} y={52} />
        <line x1="495" y1="52" x2="610" y2="52" className="w" />
        <text x="137" y="40" className="lbl">Z_fix/2 (SHORT)</text>
        <text x="457" y="40" className="lbl">Z_fix/2 (SHORT)</text>
        <text x="320" y="14" className="alg">Z_int = Z(Y_dut) − Z(Y_short)  — solo requiere SHORT</text>
      </svg>
    );
  }

  // shunt_only: Yp shunt only, DUT shunt
  return (
    <svg viewBox="0 0 640 160" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-2xl mx-auto">
      <style>{style}</style>
      <Ports />
      <line x1="30" y1="52" x2="180" y2="52" className="w" />
      <line x1="180" y1="52" x2="320" y2="52" className="w" />
      <line x1="320" y1="52" x2="460" y2="52" className="w" />
      <line x1="460" y1="52" x2="610" y2="52" className="w" />
      {/* Yp left */}
      <Cap x={180} y1={52} y2={128} />
      <text x="180" y="148" className="lbl">Yₚ (OPEN)</text>
      {/* Yp right */}
      <Cap x={460} y1={52} y2={128} />
      <text x="460" y="148" className="lbl">Yₚ (OPEN)</text>
      {/* DUT */}
      <DutShunt x={320} />
      <text x="320" y="14" className="alg">Y_corr = Y_dut − Y_open;  Z_int = pinv(Y_corr)[0,0]  — solo requiere OPEN</text>
    </svg>
  );
}

// FIXTURE_MODEL metadata
const FIXTURE_MODELS = [
  { value: 'pi',          label: 'Modelo π — Open-Short (Koolen)',        needs: ['open','short'], desc: 'Parásitos shunt (pads) + serie (trazas). Uso general.' },
  { value: 't',           label: 'Modelo T — Dual Open-Short',            needs: ['open','short'], desc: 'Fixture con inductancia dominante en las trazas.' },
  { value: 'series_only', label: 'Solo serie — Short únicamente',         needs: ['short'],        desc: 'Trazas inductivas, pads sin capacidad apreciable.' },
  { value: 'shunt_only',  label: 'Solo shunt — Open únicamente',          needs: ['open'],         desc: 'Capacidad de pad dominante, trazas muy cortas.' },
] as const;

function FixtureSchemaBadge({ fixtureModel, role }: { fixtureModel: string; role: 'open' | 'short' }) {
  const model = FIXTURE_MODELS.find(m => m.value === fixtureModel);
  const needed = model?.needs.includes(role) ?? true;
  if (needed) return null;
  return (
    <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
      no necesario
    </span>
  );
}


// ──────────────────────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────────────────────
interface Measurement { name: string; relative_path: string; device: string; }
type FileSource = 'upload' | 'library';

interface FileSlot {
  label:    React.ReactNode;
  sublabel: string;
  color:    'blue' | 'green' | 'amber';
  role:     'dut' | 'open' | 'short';
}

const FILE_SLOTS: FileSlot[] = [
  { label: 'DUT — Componente medido',       sublabel: 'archivo raw con el componente', color: 'blue',  role: 'dut'   },
  { label: 'OPEN — Circuito abierto',       sublabel: 'fixture sin componente',         color: 'green', role: 'open'  },
  { label: 'SHORT — Cortocircuito',         sublabel: 'fixture con puentes soldados',   color: 'amber', role: 'short' },
];

const COLOR: Record<string, { border: string; bg: string; text: string }> = {
  blue:  { border: 'border-blue-400',   bg: 'bg-blue-50 dark:bg-blue-950/20',   text: 'text-blue-600 dark:text-blue-400'  },
  green: { border: 'border-green-400',  bg: 'bg-green-50 dark:bg-green-950/20', text: 'text-green-600 dark:text-green-400'},
  amber: { border: 'border-amber-400',  bg: 'bg-amber-50 dark:bg-amber-950/20', text: 'text-amber-600 dark:text-amber-400'},
};

// ──────────────────────────────────────────────────────────────────────────────
// Zona de un único archivo
// ──────────────────────────────────────────────────────────────────────────────
interface FileZoneProps extends FileSlot {
  file:           File | null;
  libraryPath:    string;
  measurements:   Measurement[];
  inputRef:       React.RefObject<HTMLInputElement>;
  onFileChange:   (f: File | null) => void;
  onLibraryPick:  (path: string) => void;
}

function FileZone({
  label, sublabel, color, file, libraryPath, measurements, inputRef, onFileChange, onLibraryPick,
}: FileZoneProps) {
  const { border, bg, text } = COLOR[color];
  const hasSelection = !!file || !!libraryPath;
  const selectedName = file ? file.name : measurements.find(m => m.relative_path === libraryPath)?.name ?? '';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-bold uppercase tracking-wide">{label}</Label>
        <span className="text-[10px] text-muted-foreground italic">{sublabel}</span>
      </div>

      {/* selector de biblioteca */}
      {measurements.length > 0 && (
        <Select
          value={libraryPath || '__none__'}
          onValueChange={(v) => {
            if (v === '__none__') { onLibraryPick(''); return; }
            onLibraryPick(v);
            onFileChange(null);
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <Library className="w-3 h-3 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Seleccionar de la biblioteca…" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— ninguno —</SelectItem>
            {measurements.map((m) => (
              <SelectItem key={m.relative_path} value={m.relative_path}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* separador */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-[10px] uppercase">
          <span className="bg-card px-2 text-muted-foreground font-bold">o sube un archivo</span>
        </div>
      </div>

      {/* zona drag / upload */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-3 flex items-center gap-3 cursor-pointer transition-all',
          hasSelection
            ? `${border} border-solid ${bg}`
            : 'border-border hover:border-primary/50 hover:bg-primary/5',
        )}
        onClick={() => inputRef.current?.click()}
      >
        <input
          type="file"
          ref={inputRef}
          className="hidden"
          accept=".s1p,.s2p"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onFileChange(f);
            if (f) onLibraryPick('');
          }}
        />
        {hasSelection ? (
          <>
            <FileCheck className={cn('w-5 h-5 shrink-0', text)} />
            <span className={cn('text-sm font-medium truncate flex-1', text)}>{selectedName}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFileChange(null);
                onLibraryPick('');
              }}
              className="text-muted-foreground hover:text-destructive shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <Upload className="w-5 h-5 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">
              Haz clic para subir <span className="font-semibold">.s1p / .s2p</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Componente principal
// ──────────────────────────────────────────────────────────────────────────────
interface DeembedToolProps {
  onSendToCompactModel?: (touchstoneContent: string, filename: string) => void;
}

export function DeembedTool({ onSendToCompactModel }: DeembedToolProps = {}) {
  // Archivos por upload
  const [dutFile,   setDutFile]   = useState<File | null>(null);
  const [openFile,  setOpenFile]  = useState<File | null>(null);
  const [shortFile, setShortFile] = useState<File | null>(null);

  // Rutas de biblioteca seleccionadas
  const [dutPath,   setDutPath]   = useState('');
  const [openPath,  setOpenPath]  = useState('');
  const [shortPath, setShortPath] = useState('');

  const dutRef   = useRef<HTMLInputElement>(null);
  const openRef  = useRef<HTMLInputElement>(null);
  const shortRef = useRef<HTMLInputElement>(null);

  // Biblioteca
  const [device,       setDevice]       = useState('NanoVNA-Izan');
  const [measurements, setMeasurements] = useState<Measurement[]>([]);

  // Opciones
  const [topology,      setTopology]      = useState('shunt');
  const [fixtureModel,  setFixtureModel]  = useState('pi');
  const [z0,            setZ0]            = useState('50');
  const [saveName,  setSaveName]  = useState('');
  const [compType,  setCompType]  = useState('capacitor');

  // Estado proceso
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<any>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [plotIdx, setPlotIdx] = useState(0);

  // Cargar mediciones de la biblioteca cuando cambia el dispositivo
  useEffect(() => {
    setMeasurements([]);
    fetch(`http://localhost:8080/api/vna/measurements?device=${encodeURIComponent(device)}`)
      .then(r => r.ok ? r.json() : [])
      .then((data: Measurement[]) => setMeasurements(data))
      .catch(() => setMeasurements([]));
  }, [device]);

  const canProcess =
    (!!dutFile   || !!dutPath)  &&
    (!!openFile  || !!openPath) &&
    (!!shortFile || !!shortPath);

  const handleProcess = async () => {
    if (!canProcess) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setPlotIdx(0);

    const fd = new FormData();

    // DUT
    if (dutFile)       fd.append('dut_file', dutFile);
    else               fd.append('dut_path', dutPath);
    // OPEN
    if (openFile)      fd.append('open_file', openFile);
    else               fd.append('open_path', openPath);
    // SHORT
    if (shortFile)     fd.append('short_file', shortFile);
    else               fd.append('short_path', shortPath);

    fd.append('topology',       topology);
    fd.append('fixture_model',  fixtureModel);
    fd.append('z0',             z0);
    fd.append('save_name',      saveName);
    fd.append('device',         device);
    fd.append('component_type', compType);

    try {
      const res = await fetch('http://localhost:8080/api/deembedding/process', {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? `Error ${res.status}`);
      }
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!result?.touchstone_content) return;
    const blob = new Blob([result.touchstone_content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const base = saveName || (dutFile?.name?.replace(/\.[^.]+$/, '') ?? 'deembedded');
    a.download = base.endsWith('.s2p') ? base : `${base}_deembedded.s2p`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ToolShell
      title="De-embedding Open-Short"
      description="Elimina los parásitos del fixture midiendo OPEN y SHORT. Genera el .s2p limpio del componente intrínseco."
    >
      <div className="space-y-6">

        {/* Esquemático dinámico */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                {FIXTURE_MODELS.find(m => m.value === fixtureModel)?.label ?? 'Modelo de fixture'}
              </CardTitle>
              {/* Selector de modelo inline */}
              <Select value={fixtureModel} onValueChange={setFixtureModel}>
                <SelectTrigger className="h-7 text-xs w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIXTURE_MODELS.map(m => (
                    <SelectItem key={m.value} value={m.value}>
                      <div>
                        <div className="font-medium">{m.label}</div>
                        <div className="text-[10px] text-muted-foreground">{m.desc}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-4">
            <FixtureSchematic fixtureModel={fixtureModel} />
            <p className="text-[11px] text-muted-foreground text-center mt-1 leading-relaxed">
              {fixtureModel === 'pi'          && <><strong>OPEN</strong> → elimina Y_shunt · <strong>SHORT</strong> → elimina Z_serie</>}
              {fixtureModel === 't'           && <><strong>SHORT</strong> → elimina Z_serie · <strong>OPEN</strong> → elimina Y_shunt</>}
              {fixtureModel === 'series_only' && <><strong>Solo SHORT</strong> — elimina inductancia serie del fixture</>}
              {fixtureModel === 'shunt_only'  && <><strong>Solo OPEN</strong> — elimina capacidad de pad del fixture</>}
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ── Archivos ────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" />
                  Archivos de medida
                </CardTitle>
                {/* Selector de dispositivo compartido */}
                <Select value={device} onValueChange={(v) => {
                  setDevice(v);
                  setDutPath(''); setOpenPath(''); setShortPath('');
                }}>
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NanoVNA-Izan">NanoVNA-Izan</SelectItem>
                    <SelectItem value="NanoVNA-LAB1">NanoVNA-LAB1</SelectItem>
                    <SelectItem value="NanoVNA-LAB2">NanoVNA-LAB2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <FileZone
                {...FILE_SLOTS[0]}
                file={dutFile}           libraryPath={dutPath}
                measurements={measurements}
                inputRef={dutRef}
                onFileChange={setDutFile}   onLibraryPick={setDutPath}
              />
              <div className={FIXTURE_MODELS.find(m=>m.value===fixtureModel)?.needs.includes('open') ? '' : 'opacity-40 pointer-events-none'}>
                <FileZone
                  {...FILE_SLOTS[1]}
                  label={<span className="flex items-center gap-1">OPEN — Circuito abierto<FixtureSchemaBadge fixtureModel={fixtureModel} role="open" /></span> as any}
                  file={openFile}          libraryPath={openPath}
                  measurements={measurements}
                  inputRef={openRef}
                  onFileChange={setOpenFile}  onLibraryPick={setOpenPath}
                />
              </div>
              <div className={FIXTURE_MODELS.find(m=>m.value===fixtureModel)?.needs.includes('short') ? '' : 'opacity-40 pointer-events-none'}>
                <FileZone
                  {...FILE_SLOTS[2]}
                  label={<span className="flex items-center gap-1">SHORT — Cortocircuito<FixtureSchemaBadge fixtureModel={fixtureModel} role="short" /></span> as any}
                  file={shortFile}         libraryPath={shortPath}
                  measurements={measurements}
                  inputRef={shortRef}
                  onFileChange={setShortFile} onLibraryPick={setShortPath}
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Opciones ────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Opciones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wide">Topología del DUT</Label>
                <Select value={topology} onValueChange={setTopology}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="shunt">Shunt-Through (DUT entre pista y masa)</SelectItem>
                    <SelectItem value="series">Series-Through (DUT en serie)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wide">Z₀ (Ω)</Label>
                  <Input value={z0} onChange={(e) => setZ0(e.target.value)}
                    className="h-9 font-mono" placeholder="50" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wide">Tipo componente</Label>
                  <Select value={compType} onValueChange={setCompType}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="capacitor">Condensador</SelectItem>
                      <SelectItem value="inductor">Inductor</SelectItem>
                      <SelectItem value="resistor">Resistencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wide">Nombre archivo salida</Label>
                <div className="relative">
                  <Input
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    placeholder={
                      dutFile ? dutFile.name.replace(/\.[^.]+$/, '') + '_deembedded'
                      : measurements.find(m => m.relative_path === dutPath)?.name?.replace(/\.[^.]+$/, '') + '_deembedded'
                      ?? 'nombre_salida'
                    }
                    className="h-9 pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-mono">.s2p</span>
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  Se guardará en Biblioteca/Mediciones/{device}
                </p>
              </div>

              <Button className="w-full mt-2" onClick={handleProcess}
                disabled={!canProcess || loading}>
                {loading
                  ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Procesando…</>
                  : <><CheckCircle2 className="w-4 h-4 mr-2" />Aplicar De-embedding</>}
              </Button>

              {!canProcess && (
                <p className="text-[11px] text-muted-foreground text-center">
                  Selecciona los tres archivos para habilitar el proceso
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="text-sm">{error}</div>
          </div>
        )}

        {/* Avisos de coherencia de frecuencias */}
        {result?.warnings?.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 p-3 rounded-lg flex items-start gap-2 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="space-y-1">
              {result.warnings.map((w: string, i: number) => <p key={i}>{w}</p>)}
            </div>
          </div>
        )}

        {/* Resultados */}
        {result && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="py-4">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">De-embedding completado</h4>
                      <p className="text-xs text-muted-foreground">
                        Guardado en{' '}
                        <span className="font-mono text-primary">
                          {result.saved_path?.split(/[\\/]/).slice(-2).join('/')}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 text-center items-center">
                    {[
                      ['Puntos',   result.summary.n_points,                         ''],
                      ['F_max',    result.summary.fmax_mhz?.toFixed(0),             ' MHz'],
                      ['SRF est.', result.summary.srf_mhz?.toFixed(1)  ?? '—',     ' MHz'],
                      ['C est.',   result.summary.c_est_nf?.toFixed(3) ?? '—',     ' nF'],
                    ].map(([lbl, val, unit]) => (
                      <div key={String(lbl)} className="min-w-[60px]">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold">{lbl}</p>
                        <p className="text-sm font-mono font-bold">{val}{unit}</p>
                      </div>
                    ))}
                    <Button variant="default" size="sm" onClick={handleDownload}
                      className="bg-green-600 hover:bg-green-700 text-white">
                      <Download className="w-4 h-4 mr-2" />.s2p
                    </Button>
                    {onSendToCompactModel && (
                      <Button
                        variant="outline" size="sm"
                        onClick={() => {
                          const base = saveName || (dutFile?.name?.replace(/\.[^.]+$/, '') ?? 'deembedded');
                          const fname = base.endsWith('.s2p') ? base : `${base}_deembedded.s2p`;
                          onSendToCompactModel(result.touchstone_content, fname);
                        }}
                      >
                        <ArrowRight className="w-4 h-4 mr-2" />Modelo Compacto
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="bg-muted/30 border-b px-4 py-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold">
                  {result.plots[plotIdx]?.title}
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    disabled={plotIdx === 0} onClick={() => setPlotIdx(p => p - 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-[10px] font-mono px-2">
                    {plotIdx + 1} / {result.plots.length}
                  </span>
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    disabled={plotIdx === result.plots.length - 1} onClick={() => setPlotIdx(p => p + 1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0 bg-white dark:bg-zinc-950">
                <img
                  src={`data:image/png;base64,${result.plots[plotIdx]?.image}`}
                  alt={result.plots[plotIdx]?.title}
                  className="w-full h-auto"
                />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Estado vacío */}
        {!result && !loading && !error && (
          <Card className="p-10 border-dashed border-2 flex flex-col items-center justify-center text-muted-foreground space-y-3">
            <Layers className="w-10 h-10 opacity-20" />
            <p className="text-sm text-center">
              Selecciona los tres archivos y pulsa <strong>Aplicar De-embedding</strong>
              <br />para obtener el .s2p limpio del componente
            </p>
          </Card>
        )}
      </div>
    </ToolShell>
  );
}
