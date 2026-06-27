import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

function currentMonth() {
  const d = new Date();
  return { month: d.getMonth() + 1, year: d.getFullYear() };
}

function monthBounds(month: number, year: number) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function GstRegisterPage() {
  const { month: initMonth, year: initYear } = currentMonth();
  const [month, setMonth] = useState(initMonth);
  const [year, setYear] = useState(initYear);

  const { from, to } = monthBounds(month, year);

  const { data: gstr3b, isLoading: loading3b } = useQuery({
    queryKey: ['gstr3b', month, year],
    queryFn: () =>
      api.get(`/registers/gst/gstr3b?month=${month}&year=${year}`).then((r: any) => r.data),
  });

  const { data: gstr1, isLoading: loading1 } = useQuery({
    queryKey: ['gstr1-summary', month, year],
    queryFn: () =>
      api.get(`/registers/gst/gstr1?from=${from}&to=${to}`).then((r: any) => r.data),
  });

  const fmt = (n: number | string) =>
    Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleDownloadGstr1 = () => {
    api.get(`/registers/gst/gstr1?from=${from}&to=${to}`).then((r: any) => {
      const json = JSON.stringify(r.data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GSTR1_${year}_${String(month).padStart(2, '0')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => initYear - i);

  const summary = gstr3b?.summary;
  const hsnRows: any[] = gstr1?.hsn ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">GST Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">GSTR-3B summary and GSTR-1 HSN detail</p>
        </div>
        <button
          onClick={handleDownloadGstr1}
          className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
        >
          <span>↓</span> Download GSTR-1 JSON
        </button>
      </div>

      {/* Month / Year selector */}
      <div className="flex flex-wrap items-end gap-4 bg-card rounded-xl border p-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <span className="text-sm text-muted-foreground/60 pb-2">
          {from} to {to}
        </span>
      </div>

      {/* GSTR-3B */}
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-foreground">GSTR-3B Summary</h2>
          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">Monthly</span>
        </div>
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            {loading3b ? (
              <div className="p-8 text-center text-muted-foreground/60">Loading…</div>
            ) : (
              <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead className="bg-muted/50 border-b">
                  <tr>
                    {['Description', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Tax'].map((h) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide ${
                          h === 'Description' ? 'text-left' : 'text-right'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {summary ? (
                    [
                      { label: 'Outward Taxable Supplies (B2B + B2C)', ...summary.outward },
                      { label: 'Zero Rated / Nil Rated', ...summary.zeroRated },
                      { label: 'Inward (RCM)', ...summary.inward },
                    ].map((row) => (
                      <tr key={row.label} className="hover:bg-muted/50">
                        <td className="px-4 py-3 font-medium text-foreground">{row.label}</td>
                        <td className="px-4 py-3 text-right">{fmt(row.taxableValue ?? 0)}</td>
                        <td className="px-4 py-3 text-right">{fmt(row.cgst ?? 0)}</td>
                        <td className="px-4 py-3 text-right">{fmt(row.sgst ?? 0)}</td>
                        <td className="px-4 py-3 text-right">{fmt(row.igst ?? 0)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-foreground">{fmt(row.totalTax ?? 0)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground/60">No data for this period</td>
                    </tr>
                  )}
                  {summary && (
                    <tr className="bg-amber-50 border-t-2 border-amber-200 font-semibold">
                      <td className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Net Tax Payable</td>
                      <td className="px-4 py-3 text-right">{fmt(summary.net?.taxableValue ?? 0)}</td>
                      <td className="px-4 py-3 text-right">{fmt(summary.net?.cgst ?? 0)}</td>
                      <td className="px-4 py-3 text-right">{fmt(summary.net?.sgst ?? 0)}</td>
                      <td className="px-4 py-3 text-right">{fmt(summary.net?.igst ?? 0)}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-700">{fmt(summary.net?.totalTax ?? 0)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>

      {/* GSTR-1 HSN */}
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold text-foreground">GSTR-1 HSN Summary</h2>
          <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">HSN 7113</span>
        </div>
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            {loading1 ? (
              <div className="p-8 text-center text-muted-foreground/60">Loading…</div>
            ) : (
              <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead className="bg-muted/50 border-b">
                  <tr>
                    {['HSN Code', 'Description', 'UQC', 'Qty', 'Taxable Value', 'CGST Rate', 'CGST Amt', 'SGST Rate', 'SGST Amt', 'IGST Rate', 'IGST Amt'].map((h) => (
                      <th
                        key={h}
                        className={`px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap ${
                          ['HSN Code', 'Description', 'UQC'].includes(h) ? 'text-left' : 'text-right'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {hsnRows.length > 0 ? hsnRows.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-amber-700">{row.hsnCode ?? '7113'}</td>
                      <td className="px-4 py-3 text-foreground/80">{row.description ?? 'Articles of jewellery'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.uqc ?? 'NOS'}</td>
                      <td className="px-4 py-3 text-right">{row.qty ?? 0}</td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(row.taxableValue ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{row.cgstRate ?? 1.5}%</td>
                      <td className="px-4 py-3 text-right">{fmt(row.cgst ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{row.sgstRate ?? 1.5}%</td>
                      <td className="px-4 py-3 text-right">{fmt(row.sgst ?? 0)}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{row.igstRate ?? 0}%</td>
                      <td className="px-4 py-3 text-right">{fmt(row.igst ?? 0)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground/60">No HSN data for this period</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
