import React, { useState, useEffect } from 'react';
import { CalculatorFrame } from '../CalculatorFrame';
import { Ruler, Info } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

export function TransmissionLineCalculator() {
  const [lineType, setLineType] = useState('microstrip');

  // Microstrip States
  const [msW, setMsW] = useState('2.0');
  const [msH, setMsH] = useState('1.6');
  const [msEr, setMsEr] = useState('4.4'); // FR4
  const [msZ0, setMsZ0] = useState(0);
  const [msEeff, setMsEeff] = useState(0);

  // Coaxial States
  const [coaxD, setCoaxD] = useState('3.5'); // Outer
  const [coaxd, setCoaxd] = useState('0.9'); // Inner
  const [coaxEr, setCoaxEr] = useState('2.1'); // PTFE
  const [coaxZ0, setCoaxZ0] = useState(0);

  // Parallel Wire States
  const [pwD, setPwD] = useState('10.0'); // Spacing
  const [pwd, setPwd] = useState('1.0'); // Diameter
  const [pwEr, setPwEr] = useState('1.0'); // Air
  const [pwZ0, setPwZ0] = useState(0);

  const calculateMicrostrip = () => {
    const w = parseFloat(msW);
    const h = parseFloat(msH);
    const er = parseFloat(msEr);

    if (isNaN(w) || isNaN(h) || isNaN(er) || w <= 0 || h <= 0) return;

    const u = w / h;
    const e_eff = (er + 1) / 2 + ((er - 1) / 2) * Math.pow(1 + 12 / u, -0.5);
    setMsEeff(e_eff);

    let z0 = 0;
    if (u <= 1) {
      z0 = (60 / Math.sqrt(e_eff)) * Math.log(8 / u + u / 4);
    } else {
      z0 = (120 * Math.PI) / (Math.sqrt(e_eff) * (u + 1.393 + 0.667 * Math.log(u + 1.444)));
    }
    setMsZ0(z0);
  };

  const calculateCoaxial = () => {
    const D = parseFloat(coaxD);
    const d = parseFloat(coaxd);
    const er = parseFloat(coaxEr);

    if (isNaN(D) || isNaN(d) || isNaN(er) || D <= d || d <= 0) return;

    const z0 = (60 / Math.sqrt(er)) * Math.log(D / d);
    setCoaxZ0(z0);
  };

  const calculateParallelWire = () => {
    const D = parseFloat(pwD);
    const d = parseFloat(pwd);
    const er = parseFloat(pwEr);

    if (isNaN(D) || isNaN(d) || isNaN(er) || D <= d || d <= 0) return;

    // Z0 = (120 / sqrt(er)) * acosh(D/d)
    const x = D / d;
    const z0 = (120 / Math.sqrt(er)) * Math.log(x + Math.sqrt(x * x - 1));
    setPwZ0(z0);
  };

  useEffect(() => {
    calculateMicrostrip();
  }, [msW, msH, msEr]);

  useEffect(() => {
    calculateCoaxial();
  }, [coaxD, coaxd, coaxEr]);

  useEffect(() => {
    calculateParallelWire();
  }, [pwD, pwd, pwEr]);

  return (
    <CalculatorFrame
      title="Transmission Line Calculator"
      description="Calculate characteristic impedance and other parameters for various transmission line topologies."
      icon={<Ruler className="w-8 h-8" />}
    >
      <Tabs defaultValue="microstrip" onValueChange={setLineType} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="microstrip">Microstrip</TabsTrigger>
          <TabsTrigger value="coaxial">Coaxial</TabsTrigger>
          <TabsTrigger value="parallel">Parallel Wire</TabsTrigger>
        </TabsList>

        <TabsContent value="microstrip" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="ms-w">Width (w) [mm]</Label>
                <Input
                  id="ms-w"
                  type="number"
                  value={msW}
                  onChange={(e) => setMsW(e.target.value)}
                  step="0.1"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ms-h">Height (h) [mm]</Label>
                <Input
                  id="ms-h"
                  type="number"
                  value={msH}
                  onChange={(e) => setMsH(e.target.value)}
                  step="0.1"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ms-er">Relative Permittivity (εr)</Label>
                <Input
                  id="ms-er"
                  type="number"
                  value={msEr}
                  onChange={(e) => setMsEr(e.target.value)}
                  step="0.1"
                />
              </div>
              
              <div className="pt-4 p-4 bg-muted/50 rounded-lg border border-border flex items-start gap-3">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>FR-4:</strong> εr ≈ 4.4</p>
                  <p><strong>Rogers 4350B:</strong> εr ≈ 3.66</p>
                  <p><strong>Alumina:</strong> εr ≈ 9.8</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-center gap-4">
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardDescription className="text-primary/80 uppercase text-[10px] font-bold tracking-wider">Characteristic Impedance</CardDescription>
                  <CardTitle className="text-4xl font-mono text-primary">{msZ0.toFixed(2)} Ω</CardTitle>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="uppercase text-[10px] font-bold tracking-wider">Effective Permittivity (εeff)</CardDescription>
                  <CardTitle className="text-2xl font-mono">{msEeff.toFixed(3)}</CardTitle>
                </CardHeader>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="coaxial" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="coax-D">Outer Diameter (D) [mm]</Label>
                <Input
                  id="coax-D"
                  type="number"
                  value={coaxD}
                  onChange={(e) => setCoaxD(e.target.value)}
                  step="0.1"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="coax-d">Inner Diameter (d) [mm]</Label>
                <Input
                  id="coax-d"
                  type="number"
                  value={coaxd}
                  onChange={(e) => setCoaxd(e.target.value)}
                  step="0.1"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="coax-er">Dielectric Constant (εr)</Label>
                <Input
                  id="coax-er"
                  type="number"
                  value={coaxEr}
                  onChange={(e) => setCoaxEr(e.target.value)}
                  step="0.1"
                />
              </div>

              <div className="pt-4 p-4 bg-muted/50 rounded-lg border border-border flex items-start gap-3">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>PTFE (Teflon):</strong> εr ≈ 2.1</p>
                  <p><strong>PE (Solid):</strong> εr ≈ 2.3</p>
                  <p><strong>Air:</strong> εr = 1.0</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-center gap-4">
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardDescription className="text-primary/80 uppercase text-[10px] font-bold tracking-wider">Characteristic Impedance</CardDescription>
                  <CardTitle className="text-4xl font-mono text-primary">{coaxZ0.toFixed(2)} Ω</CardTitle>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="uppercase text-[10px] font-bold tracking-wider">Velocity Factor (Vf)</CardDescription>
                  <CardTitle className="text-2xl font-mono">{(1 / Math.sqrt(parseFloat(coaxEr) || 1)).toFixed(3)}</CardTitle>
                </CardHeader>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="parallel" className="space-y-6">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="pw-D">Center-to-Center Spacing (D) [mm]</Label>
                <Input
                  id="pw-D"
                  type="number"
                  value={pwD}
                  onChange={(e) => setPwD(e.target.value)}
                  step="0.1"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pw-d">Wire Diameter (d) [mm]</Label>
                <Input
                  id="pw-d"
                  type="number"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  step="0.1"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pw-er">Dielectric Constant (εr)</Label>
                <Input
                  id="pw-er"
                  type="number"
                  value={pwEr}
                  onChange={(e) => setPwEr(e.target.value)}
                  step="0.1"
                />
              </div>

              <div className="pt-4 p-4 bg-muted/50 rounded-lg border border-border flex items-start gap-3">
                <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><strong>Air:</strong> εr = 1.0</p>
                  <p><strong>300 Ω Twin-lead:</strong> Typical D/d ≈ 5-10</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-center gap-4">
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardDescription className="text-primary/80 uppercase text-[10px] font-bold tracking-wider">Characteristic Impedance</CardDescription>
                  <CardTitle className="text-4xl font-mono text-primary">{pwZ0.toFixed(2)} Ω</CardTitle>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="uppercase text-[10px] font-bold tracking-wider">Velocity Factor (Vf)</CardDescription>
                  <CardTitle className="text-2xl font-mono">{(1 / Math.sqrt(parseFloat(pwEr) || 1)).toFixed(3)}</CardTitle>
                </CardHeader>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </CalculatorFrame>
  );
}
