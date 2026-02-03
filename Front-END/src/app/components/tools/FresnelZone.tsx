import React, { useState, useEffect } from 'react';
import { CalculatorFrame } from '../CalculatorFrame';
import { Radio } from 'lucide-react';

export function FresnelZone() {
  const [frequency, setFrequency] = useState<string>('2.4');
  const [distance, setDistance] = useState<string>('10');
  const [obstacleDist, setObstacleDist] = useState<string>('5');
  const [radius, setRadius] = useState<number | null>(null);
  const [clearance60, setClearance60] = useState<number | null>(null);

  useEffect(() => {
    calculateFresnel();
  }, [frequency, distance, obstacleDist]);

  const calculateFresnel = () => {
    const f = parseFloat(frequency);
    const d = parseFloat(distance);
    const d1 = parseFloat(obstacleDist);

    if (isNaN(f) || isNaN(d) || isNaN(d1) || f <= 0 || d <= 0 || d1 < 0 || d1 > d) {
      setRadius(null);
      setClearance60(null);
      return;
    }

    // Formula: r = 17.32 * sqrt( (d1 * d2) / (f_GHz * d_total) )
    // All distances in km, freq in GHz. Result in meters.
    
    const d2 = d - d1;
    const r = 17.32 * Math.sqrt((d1 * d2) / (f * d));
    
    setRadius(r);
    setClearance60(r * 0.6);
  };

  return (
    <CalculatorFrame 
      title="Fresnel Zone" 
      description="Calculate the First Fresnel Zone radius to ensure line-of-sight clearance."
      icon={<Radio className="w-8 h-8" />}
    >
      <div className="grid md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Frequency (GHz)</label>
            <input
              type="number"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="block w-full px-3 py-2 rounded-md border border-input bg-background focus:ring-2 focus:ring-primary focus:outline-hidden"
              placeholder="2.4"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Total Link Distance (km)</label>
            <input
              type="number"
              value={distance}
              onChange={(e) => {
                setDistance(e.target.value);
                // Auto-update obstacle distance to midpoint if it looks like user is typing a new total
                // Actually, that might be annoying. Let's just validate.
              }}
              className="block w-full px-3 py-2 rounded-md border border-input bg-background focus:ring-2 focus:ring-primary focus:outline-hidden"
              placeholder="10"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Obstacle Distance from TX (km)</label>
            <div className="flex gap-2">
                <input
                type="number"
                value={obstacleDist}
                onChange={(e) => setObstacleDist(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 rounded-md border border-input bg-background focus:ring-2 focus:ring-primary focus:outline-hidden"
                placeholder="5"
                />
                <button 
                    onClick={() => {
                        const d = parseFloat(distance);
                        if(!isNaN(d)) setObstacleDist((d/2).toString());
                    }}
                    className="px-3 py-2 bg-muted hover:bg-muted/80 text-xs font-medium rounded-md transition-colors"
                >
                    Set Midpoint
                </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
             <div className="bg-card border border-border rounded-lg p-6 shadow-xs">
                <div className="mb-4">
                    <p className="text-sm text-muted-foreground mb-1">1st Fresnel Zone Radius</p>
                    <p className="text-3xl font-bold text-foreground">
                    {radius !== null ? `${radius.toFixed(2)} m` : '-'}
                    </p>
                </div>
                <div>
                    <p className="text-sm text-muted-foreground mb-1">60% Clearance Required</p>
                    <p className="text-2xl font-semibold text-primary">
                    {clearance60 !== null ? `${clearance60.toFixed(2)} m` : '-'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                        For reliable operation, at least 60% of the first Fresnel zone should be clear of obstacles.
                    </p>
                </div>
             </div>

             {/* Visualization simplified */}
             <div className="relative h-32 w-full border-b border-border flex items-end justify-between px-4 pb-0 overflow-hidden">
                <div className="flex flex-col items-center">
                    <div className="w-2 h-8 bg-foreground/80 rounded-t-sm"></div>
                    <span className="text-xs text-muted-foreground">TX</span>
                </div>
                
                {/* Visual representation of the zone ellipse */}
                <div className="absolute bottom-4 left-0 right-0 h-24 flex items-center justify-center pointer-events-none opacity-20">
                    <div className="w-[80%] h-full border-2 border-primary rounded-[100%]"></div>
                </div>

                 <div className="flex flex-col items-center z-10">
                    <div className="w-2 h-8 bg-foreground/80 rounded-t-sm"></div>
                    <span className="text-xs text-muted-foreground">RX</span>
                </div>
             </div>
        </div>
      </div>
    </CalculatorFrame>
  );
}
