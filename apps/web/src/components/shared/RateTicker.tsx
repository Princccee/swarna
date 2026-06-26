import { useEffect } from 'react';
import { useRateStore } from '../../stores/rate.store';

const DISPLAY_PURITIES = ['GOLD:GOLD_22K', 'GOLD:GOLD_18K', 'SILVER:SILVER_999'];

const LABELS: Record<string, string> = {
  'GOLD:GOLD_22K': 'Gold 22K',
  'GOLD:GOLD_18K': 'Gold 18K',
  'SILVER:SILVER_999': 'Silver',
};

export function RateTicker() {
  const { rates, connected, connect } = useRateStore();

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <div className="bg-amber-900 text-amber-100 text-xs px-4 py-1.5 flex items-center gap-6 overflow-x-auto">
      <span className="font-semibold shrink-0 text-amber-300">Live Rates</span>
      <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
      {DISPLAY_PURITIES.map((key) => {
        const r = rates[key];
        return (
          <div key={key} className="flex items-center gap-1.5 shrink-0">
            <span className="text-amber-400">{LABELS[key]}</span>
            <span className="font-mono font-semibold">
              {r ? `₹${r.ratePerGram.toLocaleString('en-IN', { maximumFractionDigits: 2 })}/g` : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
