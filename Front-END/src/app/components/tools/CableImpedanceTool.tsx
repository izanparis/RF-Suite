import React, { useState, useEffect } from 'react';
import { CalculatorFrame } from '../CalculatorFrame';
import { Zap, Info, Ruler, Activity } from 'lucide-react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Separator } from '../ui/separator';

const CABLE_PRESETS = [
  { name: 'Custom', D: 0, d: 0, er: 0 },
  { name: 'RG-58', D: 2.95, d: 0.9, er: 2.3 }, // PE
  { name: 'RG-59', D: 3.7, d: 0.58, er: 2.3 }, // PE
  { name: 'RG-174', D: 1.5, d: 0.48, er: 2.3 }, // PE
  { name: 'RG-213', D: 7.25, d: 2.25, er: 2.3 }, // PE
  { name: 'LMR-400', D: 7.24, d: 2.74, er: 1.56 }, // Foam PE
  { name: 'RG-6', D: 4.57, d: 1.02, er: 2.3 }, // PE
  { name: 'RG-316', D: 1.5, d: 0.51, er: 2.1 }, // PTFE
];

export function CableImpedanceTool() {
  const [D, setD] = useState('2.95'); // Outer diameter
  const [d, setd] = useState('0.9');  // Inner diameter
  const [er, setEr] = useState('2.3'); // Relative permittivity
  const [preset, setPreset] = useState('RG-58');

  const [z0, setZ0] = useState(0);
  const [vf, setVf] = useState(0);
  const [cap, setCap] = useState(0);
  const [ind, setInd] = useState(0);
  const [fc, setFc] = useState(0);

  useEffect(() => {
    const valD = parseFloat(D);
    const vald = parseFloat(d);
    const valEr = parseFloat(er);

    if (isNaN(valD) || isNaN(vald) || isNaN(valEr) || valD <= vald || vald <= 0 || valEr < 1) {
      setZ0(0);
      setVf(0);
      setCap(0);
      setInd(0);
      setFc(0);
      return;
    }

    // Z0 = (60 / sqrt(er)) * ln(D/d)
    // Or Z0 = (138 / sqrt(er)) * log10(D/d)
    const currentZ0 = (60 / Math.sqrt(valEr)) * Math.log(valD / vald);
    setZ0(currentZ0);

    // VF = 1 / sqrt(er)
    const currentVf = 1 / Math.sqrt(valEr);
    setVf(currentVf);

    // C = (24.11 * er) / log10(D/d)  [pF/m]
    // C = 2 * pi * epsilon0 * er / ln(D/d)
    // epsilon0 = 8.854e-12 F/m
    const currentCap = (2 * Math.PI * 8.854 * valEr) / Math.log(valD / vald);
    setCap(currentCap); // This gives pF/m because 2*pi*8.854 is ~55.6

    // L = 0.2 * ln(D/d) [uH/m]
    // L = (mu0 / 2*pi) * ln(D/d)
    // mu0 = 4*pi*1e-7 H/m
    // L = 2e-7 * ln(D/d) H/m = 0.2 * ln(D/d) uH/m
    const currentInd = 0.2 * Math.log(valD / vald);
    setInd(currentInd);

    // Cutoff frequency for TE11 mode
    // fc = c / (pi * (D + d) * sqrt(er) / 2) ? 
    // fc ~ 190.8 / ((D + d) * sqrt(er)) [GHz] with D, d in mm
    const currentFc = 190.8 / ((valD + vald) * Math.sqrt(valEr));
    setFc(currentFc);
  }, [D, d, er]);

  const handlePresetChange = (val: string) => {
    setPreset(val);
    const found = CABLE_PRESETS.find(p => p.name === val);
    if (found && found.name !== 'Custom') {
      setD(found.D.toString());
      setd(found.d.toString());
      setEr(found.er.toString());
    }
  };

  return (
    <CalculatorFrame
      title="Cable Impedance & Velocity Factor"
      description="Calculate characteristic impedance, velocity factor, and parasitic parameters for coaxial cables based on physical dimensions."
      icon={<Zap className="w-8 h-8 text-yellow-500" />}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Input Parameters</CardTitle>
              <CardDescription>Specify cable dimensions and dielectric.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Cable Preset</Label>
                <Select value={preset} onValueChange={handlePresetChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a preset" />
                  </SelectTrigger>
                  <SelectContent>
                    {CABLE_PRESETS.map(p => (
                      <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <div className="grid gap-2">
                <Label htmlFor="cable-D">Outer Conductor ID (D) [mm]</Label>
                <Input
                  id="cable-D"
                  type="number"
                  value={D}
                  onChange={(e) => {
                    setD(e.target.value);
                    setPreset('Custom');
                  }}
                  step="0.01"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cable-d">Inner Conductor OD (d) [mm]</Label>
                <Input
                  id="cable-d"
                  type="number"
                  value={d}
                  onChange={(e) => {
                    setd(e.target.value);
                    setPreset('Custom');
                  }}
                  step="0.01"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="cable-er">Dielectric Constant (εr)</Label>
                <Input
                  id="cable-er"
                  type="number"
                  value={er}
                  onChange={(e) => {
                    setEr(e.target.value);
                    setPreset('Custom');
                  }}
                  step="0.01"
                />
              </div>

              <div className="pt-4 p-4 bg-muted/50 rounded-lg border border-border flex items-start gap-3">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Solid PE:</strong> εr ≈ 2.3 (VF ≈ 0.66)</p>
                  <p><strong>Foam PE:</strong> εr ≈ 1.5 - 1.7 (VF ≈ 0.78 - 0.82)</p>
                  <p><strong>PTFE:</strong> εr ≈ 2.1 (VF ≈ 0.69)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardDescription className="text-primary/80 uppercase text-[10px] font-bold tracking-wider">Characteristic Impedance</CardDescription>
              <CardTitle className="text-5xl font-mono text-primary">
                {z0 > 0 ? z0.toFixed(2) : '--.--'} Ω
              </CardTitle>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="uppercase text-[10px] font-bold tracking-wider">Velocity Factor</CardDescription>
                <CardTitle className="text-2xl font-mono">
                  {vf > 0 ? vf.toFixed(3) : '---'}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="uppercase text-[10px] font-bold tracking-wider">Cutoff Freq (fc)</CardDescription>
                <CardTitle className="text-2xl font-mono">
                  {fc > 0 ? `${fc.toFixed(2)} GHz` : '---'}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                Distributed Parameters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground font-medium">Capacitance</span>
                <span className="text-lg font-mono font-bold">{cap > 0 ? cap.toFixed(1) : '--.-'} pF/m</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground font-medium">Inductance</span>
                <span className="text-lg font-mono font-bold">{ind > 0 ? ind.toFixed(3) : '--.---'} µH/m</span>
              </div>
            </CardContent>
          </Card>

          <div className="p-4 bg-muted/30 rounded-lg border border-border">
            <h4 className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
              <Ruler className="w-3 h-3" />
              Formula Reference
            </h4>
            <div className="text-[10px] font-mono text-muted-foreground space-y-1">
              <p>Z0 = (60 / √εr) * ln(D/d)</p>
              <p>VF = 1 / √εr</p>
              <p>C = (2π * ε0 * εr) / ln(D/d)</p>
              <p>L = (µ0 / 2π) * ln(D/d)</p>
            </div>
          </div>
        </div>
      </div>
    </CalculatorFrame>
  );
}
