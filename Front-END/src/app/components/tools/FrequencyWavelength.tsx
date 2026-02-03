import React, { useState, useEffect } from 'react';
import { CalculatorFrame } from '../CalculatorFrame';
import { Waves, ArrowRightLeft } from 'lucide-react';

const C = 299792458; // Speed of light in m/s

export function FrequencyWavelength() {
  const [frequency, setFrequency] = useState<string>('2.4');
  const [freqUnit, setFreqUnit] = useState<string>('GHz');
  const [wavelength, setWavelength] = useState<string>('');
  const [waveUnit, setWaveUnit] = useState<string>('cm');

  const calculateWavelength = (freq: number, unit: string) => {
    let f = freq;
    if (unit === 'Hz') f = freq;
    if (unit === 'kHz') f = freq * 1e3;
    if (unit === 'MHz') f = freq * 1e6;
    if (unit === 'GHz') f = freq * 1e9;
    
    if (f === 0) return 0;
    return C / f;
  };

  const calculateFrequency = (wave: number, unit: string) => {
    let w = wave;
    if (unit === 'm') w = wave;
    if (unit === 'cm') w = wave / 100;
    if (unit === 'mm') w = wave / 1000;
    
    if (w === 0) return 0;
    return C / w;
  };

  const convertWavelengthToUnit = (meters: number, unit: string) => {
    if (unit === 'm') return meters;
    if (unit === 'cm') return meters * 100;
    if (unit === 'mm') return meters * 1000;
    return meters;
  };

  const convertFrequencyToUnit = (hz: number, unit: string) => {
    if (unit === 'Hz') return hz;
    if (unit === 'kHz') return hz / 1e3;
    if (unit === 'MHz') return hz / 1e6;
    if (unit === 'GHz') return hz / 1e9;
    return hz;
  };

  // Update on frequency change
  useEffect(() => {
    if (frequency && !isNaN(parseFloat(frequency))) {
      const lambdaMeters = calculateWavelength(parseFloat(frequency), freqUnit);
      if (lambdaMeters) {
        const val = convertWavelengthToUnit(lambdaMeters, waveUnit);
        // Only update if not focused? Actually for a converter usually one drives the other.
        // Let's implement simpler: User types in one box, other updates.
        // But with React state, we need to know WHICH one changed.
        // I'll leave this effect for initial load or handle changes in handlers.
      }
    }
  }, []);

  const handleFreqChange = (val: string) => {
    setFrequency(val);
    if (val && !isNaN(parseFloat(val))) {
      const lambdaMeters = calculateWavelength(parseFloat(val), freqUnit);
      if (lambdaMeters) {
        const result = convertWavelengthToUnit(lambdaMeters, waveUnit);
        setWavelength(result.toPrecision(6).replace(/\.?0+$/, '')); // Format nicely
      }
    } else {
      setWavelength('');
    }
  };

  const handleWaveChange = (val: string) => {
    setWavelength(val);
    if (val && !isNaN(parseFloat(val))) {
      const freqHz = calculateFrequency(parseFloat(val), waveUnit);
      if (freqHz) {
        const result = convertFrequencyToUnit(freqHz, freqUnit);
        setFrequency(result.toPrecision(6).replace(/\.?0+$/, ''));
      }
    } else {
      setFrequency('');
    }
  };

  const handleFreqUnitChange = (newUnit: string) => {
    setFreqUnit(newUnit);
    // Re-calculate wavelength based on current freq value and new unit
    if (frequency && !isNaN(parseFloat(frequency))) {
      const lambdaMeters = calculateWavelength(parseFloat(frequency), newUnit);
      if (lambdaMeters) {
        const result = convertWavelengthToUnit(lambdaMeters, waveUnit);
        setWavelength(result.toPrecision(6).replace(/\.?0+$/, ''));
      }
    }
  };

  const handleWaveUnitChange = (newUnit: string) => {
    setWaveUnit(newUnit);
    // Re-calculate freq based on current wavelength value and new unit
    if (wavelength && !isNaN(parseFloat(wavelength))) {
      const freqHz = calculateFrequency(parseFloat(wavelength), newUnit);
      if (freqHz) {
        const result = convertFrequencyToUnit(freqHz, freqUnit);
        setFrequency(result.toPrecision(6).replace(/\.?0+$/, ''));
      }
    }
  };

  // Initialize
  useEffect(() => {
    handleFreqChange(frequency);
  }, []); // Run once on mount

  return (
    <CalculatorFrame 
      title="Frequency & Wavelength" 
      description="Convert between frequency and wavelength using the speed of light."
      icon={<Waves className="w-8 h-8" />}
    >
      <div className="grid md:grid-cols-[1fr,auto,1fr] gap-6 items-center">
        
        {/* Frequency Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Frequency</label>
          <div className="flex rounded-md shadow-sm">
            <input
              type="number"
              value={frequency}
              onChange={(e) => handleFreqChange(e.target.value)}
              className="flex-1 min-w-0 block w-full px-3 py-2 rounded-l-md border border-r-0 border-input bg-background focus:ring-2 focus:ring-primary focus:outline-hidden"
              placeholder="0.00"
            />
            <select
              value={freqUnit}
              onChange={(e) => handleFreqUnitChange(e.target.value)}
              className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-input bg-muted text-muted-foreground hover:bg-muted/80 focus:ring-2 focus:ring-primary focus:outline-hidden cursor-pointer"
            >
              <option value="Hz">Hz</option>
              <option value="kHz">kHz</option>
              <option value="MHz">MHz</option>
              <option value="GHz">GHz</option>
            </select>
          </div>
        </div>

        <div className="flex justify-center pt-6 md:pt-0 text-muted-foreground">
          <ArrowRightLeft className="w-6 h-6" />
        </div>

        {/* Wavelength Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Wavelength</label>
          <div className="flex rounded-md shadow-sm">
            <input
              type="number"
              value={wavelength}
              onChange={(e) => handleWaveChange(e.target.value)}
              className="flex-1 min-w-0 block w-full px-3 py-2 rounded-l-md border border-r-0 border-input bg-background focus:ring-2 focus:ring-primary focus:outline-hidden"
              placeholder="0.00"
            />
            <select
              value={waveUnit}
              onChange={(e) => handleWaveUnitChange(e.target.value)}
              className="inline-flex items-center px-3 rounded-r-md border border-l-0 border-input bg-muted text-muted-foreground hover:bg-muted/80 focus:ring-2 focus:ring-primary focus:outline-hidden cursor-pointer"
            >
              <option value="m">m</option>
              <option value="cm">cm</option>
              <option value="mm">mm</option>
            </select>
          </div>
        </div>

      </div>

      <div className="mt-8 p-4 bg-muted/30 rounded-lg border border-border/50">
        <h4 className="font-semibold mb-2 text-sm text-foreground">Common Bands</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
          <button onClick={() => { setFreqUnit('MHz'); handleFreqChange('433'); }} className="text-left hover:text-primary transition-colors">
            <span className="font-medium text-foreground">433 MHz</span>: {(299.79 / 433).toFixed(2)} m
          </button>
          <button onClick={() => { setFreqUnit('GHz'); handleFreqChange('2.4'); }} className="text-left hover:text-primary transition-colors">
            <span className="font-medium text-foreground">2.4 GHz</span>: {(299.79 / 2400).toFixed(2)} m
          </button>
           <button onClick={() => { setFreqUnit('GHz'); handleFreqChange('5.8'); }} className="text-left hover:text-primary transition-colors">
            <span className="font-medium text-foreground">5.8 GHz</span>: {(299.79 / 5800).toFixed(2)} m
          </button>
           <button onClick={() => { setFreqUnit('MHz'); handleFreqChange('915'); }} className="text-left hover:text-primary transition-colors">
            <span className="font-medium text-foreground">915 MHz</span>: {(299.79 / 915).toFixed(2)} m
          </button>
        </div>
      </div>
    </CalculatorFrame>
  );
}
