import React, { useState, useEffect } from 'react';
import { CalculatorFrame } from '../CalculatorFrame';
import { Signal, Info } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label
} from 'recharts';

export function FreeSpacePathLoss() {
  const [distance, setDistance] = useState<string>('1');
  const [distUnit, setDistUnit] = useState<string>('km');
  const [frequency, setFrequency] = useState<string>('2.4');
  const [freqUnit, setFreqUnit] = useState<string>('GHz');
  const [pathLoss, setPathLoss] = useState<number | null>(null);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    calculateFSPL();
  }, [distance, distUnit, frequency, freqUnit]);

  const calculateFSPL = () => {
    const d = parseFloat(distance);
    const f = parseFloat(frequency);

    if (isNaN(d) || isNaN(f) || d <= 0 || f <= 0) {
      setPathLoss(null);
      setChartData([]);
      return;
    }

    // Convert to base units (km, MHz) for the standard formula: 32.44 + 20log(d_km) + 20log(f_MHz)
    let d_km = d;
    if (distUnit === 'm') d_km = d / 1000;
    if (distUnit === 'mi') d_km = d * 1.60934;

    let f_mhz = f;
    if (freqUnit === 'Hz') f_mhz = f / 1e6;
    if (freqUnit === 'kHz') f_mhz = f / 1e3;
    if (freqUnit === 'GHz') f_mhz = f * 1000;

    const loss = 32.44 + 20 * Math.log10(d_km) + 20 * Math.log10(f_mhz);
    setPathLoss(loss);

    // Generate chart data (from 0.1 * d to 2 * d)
    const data = [];
    const steps = 20;
    const startDist = d_km * 0.1;
    const endDist = d_km * 2;
    const stepSize = (endDist - startDist) / steps;

    for (let i = 0; i <= steps; i++) {
      const dist = startDist + i * stepSize;
      const l = 32.44 + 20 * Math.log10(dist) + 20 * Math.log10(f_mhz);
      // Convert back to user unit for display on axis
      let displayDist = dist;
      if (distUnit === 'm') displayDist = dist * 1000;
      if (distUnit === 'mi') displayDist = dist / 1.60934;
      
      data.push({
        distance: parseFloat(displayDist.toFixed(2)),
        loss: parseFloat(l.toFixed(2))
      });
    }
    setChartData(data);
  };

  return (
    <CalculatorFrame 
      title="Free Space Path Loss" 
      description="Calculate signal strength loss over distance in free space."
      icon={<Signal className="w-8 h-8" />}
    >
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          {/* Inputs */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Distance</label>
            <div className="flex rounded-md shadow-sm">
              <input
                type="number"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                className="flex-1 min-w-0 block w-full px-3 py-2 rounded-l-md border border-r-0 border-input bg-background focus:ring-2 focus:ring-primary focus:outline-hidden"
              />
              <select
                value={distUnit}
                onChange={(e) => setDistUnit(e.target.value)}
                className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-input bg-muted text-muted-foreground hover:bg-muted/80 focus:ring-2 focus:ring-primary focus:outline-hidden cursor-pointer"
              >
                <option value="m">m</option>
                <option value="km">km</option>
                <option value="mi">mi</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Frequency</label>
            <div className="flex rounded-md shadow-sm">
              <input
                type="number"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="flex-1 min-w-0 block w-full px-3 py-2 rounded-l-md border border-r-0 border-input bg-background focus:ring-2 focus:ring-primary focus:outline-hidden"
              />
              <select
                value={freqUnit}
                onChange={(e) => setFreqUnit(e.target.value)}
                className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-input bg-muted text-muted-foreground hover:bg-muted/80 focus:ring-2 focus:ring-primary focus:outline-hidden cursor-pointer"
              >
                <option value="Hz">Hz</option>
                <option value="kHz">kHz</option>
                <option value="MHz">MHz</option>
                <option value="GHz">GHz</option>
              </select>
            </div>
          </div>

          <div className="pt-4">
             <div className="bg-primary/10 border border-primary/20 rounded-lg p-6 text-center">
                <p className="text-sm text-muted-foreground mb-1 uppercase tracking-wider font-semibold">Path Loss</p>
                <p className="text-4xl font-bold text-primary">
                  {pathLoss !== null ? `${pathLoss.toFixed(2)} dB` : '-'}
                </p>
             </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-64 w-full bg-background rounded-lg p-2 border border-border/50">
           {chartData.length > 0 ? (
             <ResponsiveContainer width="100%" height="100%">
               <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
                 <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                 <XAxis 
                    dataKey="distance" 
                    label={{ value: `Distance (${distUnit})`, position: 'bottom', offset: 0, fill: 'currentColor', fontSize: 12 }} 
                    stroke="currentColor"
                    fontSize={12}
                    tickFormatter={(val) => val}
                    opacity={0.7}
                  />
                 <YAxis 
                    label={{ value: 'Loss (dB)', angle: -90, position: 'insideLeft', fill: 'currentColor', fontSize: 12 }} 
                    stroke="currentColor"
                    fontSize={12}
                    domain={['auto', 'auto']}
                    opacity={0.7}
                 />
                 <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)', color: 'var(--color-foreground)' }}
                    itemStyle={{ color: 'var(--color-primary)' }}
                    labelStyle={{ color: 'var(--color-muted-foreground)' }}
                    formatter={(value: number) => [`${value} dB`, 'Loss']}
                    labelFormatter={(label) => `Dist: ${label} ${distUnit}`}
                 />
                 <Line type="monotone" dataKey="loss" stroke="var(--color-primary)" strokeWidth={2} dot={false} activeDot={{ r: 6 }} />
               </LineChart>
             </ResponsiveContainer>
           ) : (
             <div className="h-full flex items-center justify-center text-muted-foreground">
               Enter valid parameters to see chart
             </div>
           )}
        </div>
      </div>
      
      <div className="mt-4 flex gap-2 items-start p-4 bg-muted/30 rounded-lg text-xs text-muted-foreground">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>FSPL assumes clear line-of-sight with no obstacles. Real-world path loss will likely be higher due to multipath, diffraction, and atmospheric absorption.</p>
      </div>
    </CalculatorFrame>
  );
}
