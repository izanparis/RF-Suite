import React, { useMemo, useState } from 'react';
import { ToolShell } from '../ToolShell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { UnitInput } from '../UnitInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { FREQ_UNITS, CAP_UNITS, IND_UNITS, toBase } from '../../lib/units';

type CompType = 'C' | 'L';

type CompRow = {
  id: string;
  type: CompType;
  value: string;
  unit: string;
};

export function SammTool() {
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
      } catch (error) {
        console.error(error);
        alert('Error al calcular: ' + (error instanceof Error ? error.message : String(error)));
      } finally {
        setLoading(false);
      }
    }

    if (id === 'export') {
      if (!result || !result.report_content) {
        alert('Primero realiza el cálculo.');
        return;
      }
      try {
        const { saveTextFile } = await import('../../lib/fsAccess');
        // Usamos un nombre por defecto ya que SammTool no tiene un selector de nombre aún,
        // o podemos añadir uno. Por ahora 'samm_report.csv'.
        await saveTextFile(null, 'samm_report.csv', result.report_content);
        alert('Reporte exportado.');
      } catch (e) {
        alert('Error al exportar: ' + e);
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
      title="Selección Automática del Modelo de Medición (SAMM)"
      description="Introduce tu rango de frecuencia y los límites de S21, y define componentes para estimar el modelo de medición recomendado."
      actions={[
        { id: 'calc', label: 'Calcular', variant: 'default' },
        { id: 'export', label: 'Exportar', variant: 'outline' },
      ]}
      onAction={handleAction}
    >
      <Card>
        <CardHeader>
          <CardTitle>Parámetros de entrada</CardTitle>
          <CardDescription></CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <UnitInput
            label="Fmin"
            value={fmin}
            unit={fminUnit}
            units={FREQ_UNITS}
            onChangeValue={setFmin}
            onChangeUnit={setFminUnit}
          />
          <UnitInput
            label="Fmax"
            value={fmax}
            unit={fmaxUnit}
            units={FREQ_UNITS}
            onChangeValue={setFmax}
            onChangeUnit={setFmaxUnit}
          />
          <UnitInput
            label="Frecuencia de resonancia"
            value={f0}
            unit={f0Unit}
            units={FREQ_UNITS}
            onChangeValue={setF0}
            onChangeUnit={setF0Unit}
          />

          <div className="space-y-2">
            <Label>S21 min (dB)</Label>
            <div className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-7 h-10 w-full rounded-md border border-input bg-input-background flex items-center px-3 focus-within:ring-1 focus-within:ring-ring">
                <input
                  className="w-full bg-transparent outline-none text-sm text-zinc-900"
                  value={s21min}
                  onChange={(e) => setS21min(e.target.value)}
                />
              </div>
              <div className="col-span-5 h-10 w-full rounded-md border border-input bg-input-background flex items-center justify-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                dB
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label>S21 max (dB)</Label>
            <div className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-7 h-10 w-full rounded-md border border-input bg-input-background flex items-center px-3 focus-within:ring-1 focus-within:ring-ring">
                <input
                  className="w-full bg-transparent outline-none text-sm text-zinc-900"
                  value={s21max}
                  onChange={(e) => setS21max(e.target.value)}
                />
              </div>
              <div className="col-span-5 h-10 w-full rounded-md border border-input bg-input-background flex items-center justify-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                dB
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Componentes</CardTitle>
          <CardDescription>
          
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground">
            <div className="col-span-2">Tipo</div>
            <div className="col-span-6">Valor</div>
            <div className="col-span-2">Unidad</div>
            <div className="col-span-2 text-right">Acciones</div>
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
                <SelectTrigger className="col-span-2">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="C">C</SelectItem>
                  <SelectItem value="L">L</SelectItem>
                </SelectContent>
              </Select>

              <Input
                className="col-span-6"
                value={r.value}
                onChange={(e) => updateRow(idx, { value: e.target.value })}
                placeholder={r.type === 'C' ? '100' : '10'}
                inputMode="decimal"
              />

              <Select value={r.unit} onValueChange={(u) => updateRow(idx, { unit: u })}>
                <SelectTrigger className="col-span-2">
                  <SelectValue placeholder="Unidad" />
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
                <Button variant="ghost" onClick={() => removeRow(idx)}>
                  Eliminar
                </Button>
              </div>
            </div>
          ))}

          <Button variant="secondary" onClick={addRow}>
            Añadir componente
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Resultado</CardTitle>
          <CardDescription>
            {loading ? 'Calculando...' : result ? 'Análisis completado con éxito.' : 'Presiona Calcular para ver los resultados.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-muted-foreground italic">Procesando con el backend de Python...</p>
            </div>
          ) : result ? (
            <div className="space-y-6">
              <div className="rounded-lg overflow-hidden border border-border">
                <img 
                  src={`data:image/png;base64,${result.plot}`} 
                  alt="SAMM Analysis Plot" 
                  className="w-full h-auto"
                />
              </div>
              
              <div className="space-y-4">
                <h4 className="font-semibold text-sm">Tabla de recomendaciones:</h4>
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-muted-foreground text-left">
                      <tr>
                        <th className="p-2 font-medium">Componente</th>
                        <th className="p-2 font-medium">Z min/max</th>
                        <th className="p-2 font-medium">Modelo Recomendado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {result.resultados.map((res: any, i: number) => (
                        <tr key={i}>
                          <td className="p-2">{res.valor_str} ({res.tipo})</td>
                          <td className="p-2">{res.Zmin_str} - {res.Zmax_str}</td>
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
              Aquí se mostrará el mapa/rango recomendado por SAMM tras realizar el cálculo.
            </div>
          )}
        </CardContent>
      </Card>
    </ToolShell>
  );
}
