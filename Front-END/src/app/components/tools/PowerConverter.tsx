import React, { useState, useEffect } from 'react';
import { CalculatorFrame } from '../CalculatorFrame';
import { Zap, ArrowRightLeft } from 'lucide-react';

export function PowerConverter() {
  const [dbm, setDbm] = useState<string>('0');
  const [watts, setWatts] = useState<string>('');
  const [wattUnit, setWattUnit] = useState<string>('mW');

  // Convert dBm to Watts (based on unit)
  const calculateWatts = (valDbm: number, unit: string) => {
    const mw = Math.pow(10, valDbm / 10);
    if (unit === 'mW') return mw;
    if (unit === 'W') return mw / 1000;
    if (unit === 'kW') return mw / 1e6;
    if (unit === 'µW') return mw * 1000;
    return mw;
  };

  // Convert Watts (based on unit) to dBm
  const calculateDbm = (valWatts: number, unit: string) => {
    let mw = valWatts;
    if (unit === 'W') mw = valWatts * 1000;
    if (unit === 'kW') mw = valWatts * 1e6;
    if (unit === 'µW') mw = valWatts / 1000;
    
    if (mw <= 0) return -Infinity;
    return 10 * Math.log10(mw);
  };

  const handleDbmChange = (val: string) => {
    setDbm(val);
    if (val && !isNaN(parseFloat(val))) {
      const res = calculateWatts(parseFloat(val), wattUnit);
      setWatts(res.toPrecision(6).replace(/\.?0+$/, ''));
    } else {
      setWatts('');
    }
  };

  const handleWattsChange = (val: string) => {
    setWatts(val);
    if (val && !isNaN(parseFloat(val)) && parseFloat(val) > 0) {
      const res = calculateDbm(parseFloat(val), wattUnit);
      setDbm(res.toFixed(2));
    } else {
      setDbm('');
    }
  };

  const handleUnitChange = (newUnit: string) => {
    setWattUnit(newUnit);
    if (dbm && !isNaN(parseFloat(dbm))) {
       const res = calculateWatts(parseFloat(dbm), newUnit);
       setWatts(res.toPrecision(6).replace(/\.?0+$/, ''));
    }
  };

  useEffect(() => {
    handleDbmChange(dbm);
  }, []);

  return (
    <CalculatorFrame 
      title="Power Converter" 
      description="Convert between Logarithmic (dBm) and Linear (Watts) power units."
      icon={<Zap className="w-8 h-8" />}
    >
      <div className="grid md:grid-cols-[1fr,auto,1fr] gap-6 items-center">
        
        {/* dBm Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Power (dBm)</label>
          <div className="flex rounded-md shadow-sm">
            <input
              type="number"
              value={dbm}
              onChange={(e) => handleDbmChange(e.target.value)}
              className="flex-1 min-w-0 block w-full px-3 py-2 rounded-md border border-input bg-background focus:ring-2 focus:ring-primary focus:outline-hidden"
              placeholder="0.00"
            />
            <div className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-transparent bg-transparent text-muted-foreground">
              dBm
            </div>
          </div>
        </div>

        <div className="flex justify-center pt-6 md:pt-0 text-muted-foreground">
          <ArrowRightLeft className="w-6 h-6" />
        </div>

        {/* Watts Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Power (Linear)</label>
          <div className="flex rounded-md shadow-sm">
            <input
              type="number"
              value={watts}
              onChange={(e) => handleWattsChange(e.target.value)}
              className="flex-1 min-w-0 block w-full px-3 py-2 rounded-l-md border border-r-0 border-input bg-background focus:ring-2 focus:ring-primary focus:outline-hidden"
              placeholder="0.00"
            />
            <select
              value={wattUnit}
              onChange={(e) => handleUnitChange(e.target.value)}
              className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-input bg-muted text-muted-foreground hover:bg-muted/80 focus:ring-2 focus:ring-primary focus:outline-hidden cursor-pointer"
            >
              <option value="mW">mW</option>
              <option value="W">W</option>
              <option value="kW">kW</option>
              <option value="µW">µW</option>
            </select>
          </div>
        </div>

      </div>

      <div className="mt-8 p-4 bg-muted/30 rounded-lg border border-border/50">
        <h4 className="font-semibold mb-2 text-sm text-foreground">Reference Table</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
          <div className="flex justify-between"><span>30 dBm</span> <span>1 W</span></div>
          <div className="flex justify-between"><span>20 dBm</span> <span>100 mW</span></div>
          <div className="flex justify-between"><span>10 dBm</span> <span>10 mW</span></div>
          <div className="flex justify-between"><span>0 dBm</span> <span>1 mW</span></div>
          <div className="flex justify-between"><span>-10 dBm</span> <span>0.1 mW</span></div>
          <div className="flex justify-between"><span>-30 dBm</span> <span>1 µW</span></div>
          <div className="flex justify-between"><span>-90 dBm</span> <span>1 pW</span></div>
          <div className="flex justify-between"><span>-174 dBm</span> <span>Noise Fl.</span></div>
        </div>
      </div>
    </CalculatorFrame>
  );
}
