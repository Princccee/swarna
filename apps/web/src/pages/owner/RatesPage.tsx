import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useRateStore } from '../../stores/rate.store';
import { api } from '../../lib/api';

const PURITY_COLORS: Record<string, string> = {
  GOLD_24K: '#f59e0b', GOLD_22K: '#d97706', GOLD_18K: '#b45309',
  SILVER_999: '#6b7280', SILVER_925: '#9ca3af',
};

const ALL_PURITIES = [
  { key: 'GOLD:GOLD_24K', label: 'Gold 24K', metal: 'GOLD', purity: 'GOLD_24K' },
  { key: 'GOLD:GOLD_22K', label: 'Gold 22K', metal: 'GOLD', purity: 'GOLD_22K' },
  { key: 'GOLD:GOLD_18K', label: 'Gold 18K', metal: 'GOLD', purity: 'GOLD_18K' },
  { key: 'SILVER:SILVER_999', label: 'Silver 999', metal: 'SILVER', purity: 'SILVER_999' },
  { key: 'PLATINUM:PLATINUM_950', label: 'Platinum 950', metal: 'PLATINUM', purity: 'PLATINUM_950' },
];

export default function RatesPage() {
  const { rates, connect } = useRateStore();
  const [selectedPurity, setSelectedPurity] = useState('GOLD_22K');

  useEffect(() => { connect(); }, [connect]);

  const { data: historyData } = useQuery({
    queryKey: ['rateHistory', selectedPurity],
    queryFn: () => {
      const metal = selectedPurity.startsWith('SILVER') ? 'SILVER' : selectedPurity.startsWith('PLATINUM') ? 'PLATINUM' : 'GOLD';
      const from = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().split('T')[0];
      return api.get(`/rates/history/${metal}/${selectedPurity}?from=${from}&limit=100`).then((r: any) => r.data);
    },
  });

  const chartData = (historyData?.rows ?? [])
    .slice().reverse()
    .map((snap: any) => ({
      time: new Date(snap.snappedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
      rate: Number(snap.ratePerGram),
    }));

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Metal Rates</h1>

      {/* Live rate cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {ALL_PURITIES.map(({ key, label, purity }) => {
          const r = rates[key];
          return (
            <div
              key={key}
              onClick={() => setSelectedPurity(purity)}
              className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${selectedPurity === purity ? 'border-amber-500 ring-1 ring-amber-400' : 'hover:border-gray-300'}`}
            >
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-xl font-bold text-amber-700">
                {r ? `₹${r.ratePerGram.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">per gram</p>
            </div>
          );
        })}
      </div>

      {/* History chart */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold mb-4">
          30-Day Rate History — {ALL_PURITIES.find((p) => p.purity === selectedPurity)?.label}
        </h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v.toLocaleString('en-IN')}`} width={80} />
              <Tooltip formatter={(v: any) => [`₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'Rate/g']} />
              <Line type="monotone" dataKey="rate" stroke={PURITY_COLORS[selectedPurity] ?? '#d97706'} dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-400 text-sm">No history data yet — rates are collected every 5 minutes.</p>
        )}
      </div>
    </div>
  );
}
