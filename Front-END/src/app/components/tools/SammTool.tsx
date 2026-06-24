import React, { useMemo, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { UnitInput } from '../UnitInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { FREQ_UNITS, CAP_UNITS, IND_UNITS, toBase } from '../../lib/units';
import { useLanguage } from '../../lib/i18n';

type CompType = 'C' | 'L';

type CompRow = {
  id: string;
  type: CompType;
  value: string;
  unit: string;
};

export function SammTool() {
  const { t } = useLanguage();
  const [fmin, setFmin] = useState('1');
  const [fminUnit, setFminUnit] = useState('MHz');
  const [fmax, setFmax] = useState('1');
  const [fmaxUnit, setFmaxUnit] = useState('GHz');
  const [f0, setF0] = useState('100');
  const [f0Unit, setF0Unit] = useState('MHz');

  const [s21min, setS21min] = useState('-88');
  const [s21max, setS21max] = useState('-1');

  const [rows, setRows] = useState<CompRow[]>([
    { id: '1', type: 'C', value: '100', unit: 'nF' },
  ]);

  const fminHz = useMemo(() => toBase(fmin, fminUnit, FREQ_UNITS), [fmin, fminUnit]);
  const fmaxHz = useMemo(() => toBase(fmax, fmaxUnit, FREQ_UNITS), [fmax, fmaxUnit]);
  const f0Hz = useMemo(() => toBase(f0, f0Unit, FREQ_UNITS), [f0, f0Unit]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Server measurements library linkage
  const [measurements, setMeasurements] = useState<{name: string, device: string, relative_path?: string}[]>([]);
  const [selectedMeasName, setSelectedMeasName] = useState<string>("none");
  const [device, setDevice] = useState('NanoVNA-Izan');

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
    if (id === 'calc') {
      setLoading(true);
      setResult(null);
      try {
        const payload = {
          fmin: parseFloat(fminHz),
          fmax: parseFloat(fmaxHz),
          f0: parseFloat(f0Hz),
          s21_min_db: parseFloat(s21min),
          s21_max_db: parseFloat(s21max),
          components: rows.map(r => ({
            tipo: r.type,
            valor: toBase(r.value, r.unit, r.type === 'C' ? CAP_UNITS : IND_UNITS)
          }))
        };

        const response = await fetch('http://localhost:8080/api/samm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error('Error en la respuesta del servidor');
        const data = await response.json();
        setResult(data);

        // Auto-save analysis results to server
        if (selectedMeasName && selectedMeasName !== "none") {
          const matched = measurements.find((m: any) => m.name === selectedMeasName) as any;
          const relativePath = matched?.relative_path || selectedMeasName;
          fetch('http://localhost:8080/api/library/measurement/analysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              measurement_relative_path: relativePath,
              tool_name: 'samm',
              results: {
                fmin: parseFloat(fminHz),
                fmax: parseFloat(fmaxHz),
                f0: parseFloat(f0Hz),
                s21_min_db: parseFloat(s21min),
                s21_max_db: parseFloat(s21max),
                resultados: data.resultados,
                plot: data.plot
              }
            })
          }).catch(err => console.error("Error auto-saving SAMM analysis:", err));
        }
      } catch (error) {
        console.error(error);
        toast.error(t('samm.alert.error_calc') + (error instanceof Error ? error.message : String(error)));
      } finally {
        setLoading(false);
      }
    }

    if (id === 'export') {
      if (!result || !result.report_content) {
        toast.info(t('samm.alert.no_calc'));
        return;
      }
      try {
        const { saveTextFile } = await import('../../lib/fsAccess');
        await saveTextFile(null, 'samm_report.csv', result.report_content);
        toast.info(t('samm.alert.exported'));
      } catch (e) {
        toast.error(t('samm.alert.error_export') + e);
      }
    }
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: String(prev.length + 1),
        type: 'C',
        value: '10',
        unit: 'nF',
      },
    ]);
  };

  const updateRow = (idx: number, patch: Partial<CompRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const unitOptionsFor = (t: CompType) => (t === 'C' ? CAP_UNITS : IND_UNITS);

  return (
    <ToolShell
      title={t('samm.title')}
      description={t('samm.desc')}
      actions={[
        { id: 'calc', label: t('samm.action.calc'), variant: 'default' },
        { id: 'export', label: t('samm.action.export'), variant: 'outline' },
      ]}
      onAction={handleAction}
    >
      <div className="space-y-6 text-zinc-900">
        <Card>
          <CardHeader>
            <CardTitle className="text-zinc-900">{t('samm.input.title')}</CardTitle>
            <CardDescription></CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UnitInput
              label={t('samm.input.fmin')}
              value={fmin}
              unit={fminUnit}
              units={FREQ_UNITS}
              onChangeValue={setFmin}
              onChangeUnit={setFminUnit}
            />
            <UnitInput
              label={t('samm.input.fmax')}
              value={fmax}
              unit={fmaxUnit}
              units={FREQ_UNITS}
              onChangeValue={setFmax}
              onChangeUnit={setFmaxUnit}
            />
            <UnitInput
              label={t('samm.input.f0')}
              value={f0}
              unit={f0Unit}
              units={FREQ_UNITS}
              onChangeValue={setF0}
              onChangeUnit={setF0Unit}
            />

            <div className="space-y-2 col-span-1">
              <Label className="text-zinc-900">{t('samm.input.s21min')}</Label>
              <div className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-7 h-10 w-full rounded-md border border-input bg-input-background flex items-center px-3 focus-within:ring-1 focus-within:ring-ring">
                  <input
                    className="w-full bg-transparent outline-none text-sm text-zinc-900"
                    value={s21min}
                    onChange={(e) => setS21min(e.target.value)}
                  />
                </div>
                <div className="col-span-5 h-10 w-full rounded-md border border-input bg-input-background flex items-center justify-center text-xs font-medium text-muted-foreground tracking-wider">
                  dB
                </div>
              </div>
            </div>
            <div className="space-y-2 col-span-1">
              <Label className="text-zinc-900">{t('samm.input.s21max')}</Label>
              <div className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-7 h-10 w-full rounded-md border border-input bg-input-background flex items-center px-3 focus-within:ring-1 focus-within:ring-ring">
                  <input
                    className="w-full bg-transparent outline-none text-sm text-zinc-900"
                    value={s21max}
                    onChange={(e) => setS21max(e.target.value)}
                  />
                </div>
                <div className="col-span-5 h-10 w-full rounded-md border border-input bg-input-background flex items-center justify-center text-xs font-medium text-muted-foreground tracking-wider">
                  dB
                </div>
              </div>
            </div>

            {/* Biblioteca Linkage */}
            <div className="col-span-3 border-t border-border pt-4 mt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 text-zinc-900">Vincular a Medición de Biblioteca</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-zinc-900">VNA / Dispositivo</Label>
                  <Select value={device} onValueChange={setDevice}>
                    <SelectTrigger className="h-10 text-xs text-zinc-900">
                      <SelectValue placeholder="Dispositivo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NanoVNA-Izan">NanoVNA-Izan</SelectItem>
                      <SelectItem value="NanoVNA-LAB1">NanoVNA-LAB1</SelectItem>
                      <SelectItem value="NanoVNA-LAB2">NanoVNA-LAB2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-900">Medición</Label>
                  <Select value={selectedMeasName} onValueChange={setSelectedMeasName}>
                    <SelectTrigger className="h-10 text-xs text-zinc-900">
                      <SelectValue placeholder="Ninguna (Vincular...)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">(Ninguna)</SelectItem>
                      {measurements.map((m) => (
                        <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-zinc-900">{t('samm.comp.title')}</CardTitle>
            <CardDescription></CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground">
              <div className="col-span-2 text-zinc-900">{t('samm.comp.header_type')}</div>
              <div className="col-span-6 text-zinc-900">{t('samm.comp.header_val')}</div>
              <div className="col-span-2 text-zinc-900">{t('samm.comp.header_unit')}</div>
              <div className="col-span-2 text-right text-zinc-900">{t('samm.comp.header_action')}</div>
            </div>

            {rows.map((r, idx) => (
              <div key={r.id} className="grid grid-cols-12 gap-2 items-center">
                <Select
                  value={r.type}
                  onValueChange={(v) => {
                    const t = v as CompType;
                    const firstUnit = unitOptionsFor(t)[0]?.label ?? (t === 'C' ? 'F' : 'H');
                    updateRow(idx, { type: t, unit: firstUnit });
                  }}
                >
                  <SelectTrigger className="col-span-2 text-zinc-900">
                    <SelectValue placeholder={t('samm.comp.placeholder_type')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="C">C</SelectItem>
                    <SelectItem value="L">L</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  className="col-span-6 text-zinc-900"
                  value={r.value}
                  onChange={(e) => updateRow(idx, { value: e.target.value })}
                  placeholder={r.type === 'C' ? '100' : '10'}
                  inputMode="decimal"
                />

                <Select value={r.unit} onValueChange={(u) => updateRow(idx, { unit: u })}>
                  <SelectTrigger className="col-span-2 text-zinc-900">
                    <SelectValue placeholder={t('samm.comp.placeholder_unit')} />
                  </SelectTrigger>
                  <SelectContent>
                    {unitOptionsFor(r.type).map((u) => (
                      <SelectItem key={u.label} value={u.label}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="col-span-2 flex justify-end">
                  <Button variant="ghost" className="text-zinc-900 hover:text-destructive" onClick={() => removeRow(idx)}>
                    {t('samm.comp.btn_remove')}
                  </Button>
                </div>
              </div>
            ))}

            <Button variant="secondary" className="text-zinc-900" onClick={addRow}>
              {t('samm.comp.btn_add')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-zinc-900">{t('samm.result.title')}</CardTitle>
            <CardDescription>
              {loading ? t('samm.result.loading') : result ? t('samm.result.success') : t('samm.result.idle')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                <p className="text-muted-foreground italic">{t('samm.result.processing')}</p>
              </div>
            ) : result ? (
              <div className="space-y-6">
                <div className="rounded-lg overflow-hidden border border-border bg-white">
                  <img 
                    src={`data:image/png;base64,${result.plot}`} 
                    alt="SAMM Analysis Plot" 
                    className="w-full h-auto"
                  />
                </div>
                
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm text-zinc-900">{t('samm.result.table_title')}</h4>
                  <div className="rounded-md border border-border overflow-hidden bg-white">
                    <table className="w-full text-sm">
                      <thead className="bg-muted text-muted-foreground text-left">
                        <tr>
                          <th className="p-2 font-medium text-zinc-900">{t('samm.result.col_comp')}</th>
                          <th className="p-2 font-medium text-zinc-900">{t('samm.result.col_z')}</th>
                          <th className="p-2 font-medium text-zinc-900">{t('samm.result.col_model')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {result.resultados.map((res: any, i: number) => (
                          <tr key={i}>
                            <td className="p-2 text-zinc-900">{res.valor_str} ({res.tipo})</td>
                            <td className="p-2 text-zinc-900">{res.Zmin_str} - {res.Zmax_str}</td>
                            <td className="p-2 font-medium text-primary">{res.modelo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
                {t('samm.result.placeholder')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ToolShell>
  );
}


