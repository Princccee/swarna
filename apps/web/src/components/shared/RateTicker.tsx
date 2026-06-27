import { useEffect, useRef } from 'react';
import { useRateStore } from '../../stores/rate.store';

const DISPLAY_PURITIES = ['GOLD:GOLD_22K', 'GOLD:GOLD_18K', 'SILVER:SILVER_999'];

const LABELS: Record<string, string> = {
  'GOLD:GOLD_22K':    'Gold 22K',
  'GOLD:GOLD_18K':    'Gold 18K',
  'SILVER:SILVER_999': 'Silver 999',
};

export function RateTicker() {
  const { rates, connected, connect } = useRateStore();
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => { connect(); }, [connect]);

  const items = DISPLAY_PURITIES.map((key) => {
    const r = rates[key];
    return {
      key,
      label: LABELS[key],
      value: r ? `₹${r.ratePerGram.toLocaleString('en-IN', { maximumFractionDigits: 2 })}/g` : '—',
    };
  });

  // Double the array for seamless loop
  const doubled = [...items, ...items];

  function pauseTicker() {
    if (trackRef.current) trackRef.current.style.animationPlayState = 'paused';
  }
  function resumeTicker() {
    if (trackRef.current) trackRef.current.style.animationPlayState = 'running';
  }

  return (
    <div
      className="bg-[#13120B] border-b border-white/[0.05] h-7 flex items-center overflow-hidden shrink-0 select-none"
      onMouseEnter={pauseTicker}
      onMouseLeave={resumeTicker}
    >
      {/* "Live" indicator — static, not scrolling */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 border-r border-white/[0.06] h-full">
        <span
          className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-live-pulse"
          aria-label={connected ? 'Connected' : 'Disconnected'}
        />
        <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-stone-600">
          Live
        </span>
      </div>

      {/* Scrolling marquee track */}
      <div className="flex-1 overflow-hidden h-full flex items-center">
        <div
          ref={trackRef}
          className="flex items-center animate-ticker whitespace-nowrap"
        >
          {doubled.map(({ key, label, value }, i) => (
            <div
              key={`${key}-${i}`}
              className="inline-flex items-center gap-2 px-6"
            >
              <span className="text-[10px] uppercase tracking-[0.1em] text-stone-600 font-semibold">
                {label}
              </span>
              <span className="font-mono font-bold text-[12px] text-amber-400 tabular-nums">
                {value}
              </span>
              <span className="text-stone-800 text-[10px]">◆</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
