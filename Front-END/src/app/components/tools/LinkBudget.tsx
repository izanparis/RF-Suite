import React, { useState, useEffect } from 'react';
import { CalculatorFrame } from '../CalculatorFrame';
import { Calculator } from 'lucide-react';

export function LinkBudget() {
  const [txPower, setTxPower] = useState<string>('20'); // dBm
  const [txLoss, setTxLoss] = useState<string>('1'); // dB
  const [txGain, setTxGain] = useState<string>('3'); // dBi
  const [pathLoss, setPathLoss] = useState<string>('100'); // dB
  const [rxGain, setRxGain] = useState<string>('3'); // dBi
  const [rxLoss, setRxLoss] = useState<string>('1'); // dB
  const [rxSensitivity, setRxSensitivity] = useState<string>('-90'); // dBm
  
  const [rxPower, setRxPower] = useState<number | null>(null);
  const [margin, setMargin] = useState<number | null>(null);

  useEffect(() => {
    const p_tx = parseFloat(txPower);
    const l_tx = parseFloat(txLoss);
    const g_tx = parseFloat(txGain);
    const l_fs = parseFloat(pathLoss);
    const g_rx = parseFloat(rxGain);
    const l_rx = parseFloat(rxLoss);
    const sens = parseFloat(rxSensitivity);

    if ([p_tx, l_tx, g_tx, l_fs, g_rx, l_rx, sens].some(isNaN)) {
      setRxPower(null);
      setMargin(null);
      return;
    }

    const p_rx = p_tx - l_tx + g_tx - l_fs + g_rx - l_rx;
    setRxPower(p_rx);
    setMargin(p_rx - sens);

  }, [txPower, txLoss, txGain, pathLoss, rxGain, rxLoss, rxSensitivity]);

  return (
    <CalculatorFrame 
      title="Link Budget" 
      description="Estimate received signal strength and link margin."
      icon={<Calculator className="w-8 h-8" />}
    >
      <div className="grid md:grid-cols-3 gap-6">
        
        {/* TX Side */}
        <div className="space-y-4 p-4 bg-muted/20 rounded-lg border border-border/50">
          <h4 className="font-semibold text-primary">Transmitter (TX)</h4>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">TX Power (dBm)</label>
            <input type="number" value={txPower} onChange={e => setTxPower(e.target.value)} className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Cable/Misc Loss (dB)</label>
            <input type="number" value={txLoss} onChange={e => setTxLoss(e.target.value)} className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Antenna Gain (dBi)</label>
            <input type="number" value={txGain} onChange={e => setTxGain(e.target.value)} className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm" />
          </div>
        </div>

        {/* Path */}
        <div className="space-y-4 p-4 bg-muted/20 rounded-lg border border-border/50 flex flex-col justify-center">
          <h4 className="font-semibold text-primary">Path</h4>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Path Loss (dB)</label>
            <input type="number" value={pathLoss} onChange={e => setPathLoss(e.target.value)} className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm" />
            <p className="text-[10px] text-muted-foreground">Use the Path Loss tool to calculate this.</p>
          </div>
        </div>

        {/* RX Side */}
        <div className="space-y-4 p-4 bg-muted/20 rounded-lg border border-border/50">
          <h4 className="font-semibold text-primary">Receiver (RX)</h4>
           <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Antenna Gain (dBi)</label>
            <input type="number" value={rxGain} onChange={e => setRxGain(e.target.value)} className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Cable/Misc Loss (dB)</label>
            <input type="number" value={rxLoss} onChange={e => setRxLoss(e.target.value)} className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">RX Sensitivity (dBm)</label>
            <input type="number" value={rxSensitivity} onChange={e => setRxSensitivity(e.target.value)} className="w-full px-2 py-1.5 rounded-md border border-input bg-background text-sm" />
          </div>
        </div>

      </div>

      <div className="mt-8 grid md:grid-cols-2 gap-4">
        <div className="bg-primary/5 border border-primary/20 p-6 rounded-xl flex flex-col items-center justify-center text-center">
           <span className="text-sm font-medium text-muted-foreground mb-1">Expected RX Power</span>
           <span className={`text-4xl font-bold ${rxPower && rxPower > parseFloat(rxSensitivity) ? 'text-primary' : 'text-red-500'}`}>
             {rxPower !== null ? `${rxPower.toFixed(2)} dBm` : '-'}
           </span>
        </div>
        <div className="bg-card border border-border p-6 rounded-xl flex flex-col items-center justify-center text-center">
           <span className="text-sm font-medium text-muted-foreground mb-1">Link Margin</span>
           <span className={`text-4xl font-bold ${margin && margin > 0 ? 'text-green-500' : 'text-red-500'}`}>
             {margin !== null ? `${margin > 0 ? '+' : ''}${margin.toFixed(2)} dB` : '-'}
           </span>
           <span className="text-xs text-muted-foreground mt-2">
             {margin !== null && margin > 0 ? 'Link is feasible' : 'Link differs/fails'}
           </span>
        </div>
      </div>
    </CalculatorFrame>
  );
}
