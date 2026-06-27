import { useState, useRef, useEffect, useCallback } from 'react';
import { downloadInvoicePdf } from '../../lib/download-pdf';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Search,
  X,
  Plus,
  Minus,
  User,
  UserCheck,
  Scale,
  CreditCard,
  FileText,
  ExternalLink,
  ChevronDown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useRateStore } from '../../stores/rate.store';
import { useAuthStore } from '../../stores/auth.store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BillLine {
  itemId: string;
  name: string;
  sku: string;
  qty: number;
  netWeightG: number;
  purity: string;
  makingPct: number;
  makingPerGram: number;
  stoneValue: number;
  // Filled in by preview response:
  ratePerGram?: number;
  lineTotal?: number;
}

interface OldGold {
  weightG: string;
  ratePerGram: string;
}

interface Customer {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  email?: string;
}

type GstMode = 'intra' | 'inter';
type PaymentMode = 'CASH' | 'UPI' | 'CARD' | 'NET_BANKING' | 'CHEQUE' | 'OLD_GOLD_EXCHANGE';

interface BillPreview {
  subtotal: number;
  makingTotal: number;
  stoneTotal: number;
  oldGoldDeduction: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  grandTotal: number;
  lines: Array<{
    itemId: string;
    ratePerGram: number;
    lineTotal: number;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtWt = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const PURITY_LABELS: Record<string, string> = {
  GOLD_24K: '24K',
  GOLD_22K: '22K',
  GOLD_18K: '18K',
  GOLD_14K: '14K',
  SILVER_999: 'Ag 999',
  SILVER_925: 'Ag 925',
  PLATINUM_950: 'Pt 950',
};

const PAYMENT_LABELS: Record<PaymentMode, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  NET_BANKING: 'Net Banking',
  CHEQUE: 'Cheque',
  OLD_GOLD_EXCHANGE: 'Old Gold Exchange',
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RatePill({ label, rateKey }: { label: string; rateKey: string }) {
  const rate = useRateStore((s) => s.rates[rateKey]);
  const connected = useRateStore((s) => s.connected);
  return (
    <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-1">
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`}
      />
      <span className="text-xs text-amber-700 font-medium">{label}</span>
      <span className="font-mono text-xs font-semibold text-amber-900 tabular-nums">
        {rate ? `₹${fmt(rate.ratePerGram)}/g` : '—'}
      </span>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  sub,
  bold,
  accent,
  deduction,
}: {
  label: string;
  value: string;
  sub?: string;
  bold?: boolean;
  accent?: boolean;
  deduction?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between py-1.5 ${
        bold ? 'border-t border-slate-200 mt-1 pt-2.5' : ''
      }`}
    >
      <span
        className={`text-sm ${
          bold ? 'font-semibold text-slate-800' : 'text-slate-500'
        }`}
      >
        {label}
        {sub && <span className="text-xs ml-1 text-slate-400">{sub}</span>}
      </span>
      <span
        className={`font-mono text-sm tabular-nums ${
          accent
            ? 'text-amber-700 font-bold text-base'
            : bold
            ? 'font-bold text-slate-900'
            : deduction
            ? 'text-emerald-600 font-medium'
            : 'text-slate-700'
        }`}
      >
        {deduction ? `− ₹${value}` : `₹${value}`}
      </span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PosPage() {
  const user = useAuthStore((s) => s.user);

  // Bill state
  const [lines, setLines] = useState<BillLine[]>([]);
  const [oldGold, setOldGold] = useState<OldGold>({ weightG: '', ratePerGram: '' });
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isWalkIn, setIsWalkIn] = useState(true);
  const [gstMode, setGstMode] = useState<GstMode>('intra');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [paymentAmount, setPaymentAmount] = useState('');

  // New customer form state
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '' });

  // Search state
  const [itemSearch, setItemSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [showItemDropdown, setShowItemDropdown] = useState(false);

  // Preview state
  const [preview, setPreview] = useState<BillPreview | null>(null);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(null);

  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const itemDropdownRef = useRef<HTMLDivElement>(null);

  const debouncedItemSearch = useDebounce(itemSearch, 300);
  const debouncedCustomerSearch = useDebounce(customerSearch, 300);

  // ── Item search query ──────────────────────────────────────────────────────
  const { data: itemResults, isFetching: itemSearching } = useQuery({
    queryKey: ['item-search', debouncedItemSearch],
    queryFn: () =>
      api
        .get(`/inventory/items?search=${encodeURIComponent(debouncedItemSearch)}&limit=10`)
        .then((r: any) => r.data),
    enabled: debouncedItemSearch.length > 1,
    staleTime: 30_000,
  });

  // ── Customer search query ──────────────────────────────────────────────────
  const { data: customerResults, isFetching: customerSearching } = useQuery({
    queryKey: ['customer-search', debouncedCustomerSearch],
    queryFn: () =>
      api
        .get(`/billing/customers?search=${encodeURIComponent(debouncedCustomerSearch)}`)
        .then((r: any) => r.data),
    enabled: debouncedCustomerSearch.length > 1 && !isWalkIn,
    staleTime: 30_000,
  });

  // ── Preview mutation (debounced trigger via useEffect) ────────────────────
  const previewMutation = useMutation({
    mutationFn: (payload: object) =>
      api.post('/billing/preview', payload).then((r: any) => r.data),
    onSuccess: (raw: any) => {
      // Normalise: API returns Prisma Decimal strings + "totalAmount" not "grandTotal"
      const data: BillPreview = {
        subtotal:         Number(raw.subtotal),
        makingTotal:      Number(raw.makingTotal),
        stoneTotal:       Number(raw.stoneTotal),
        oldGoldDeduction: Number(raw.oldGoldDeduction),
        taxableAmount:    Number(raw.taxableAmount),
        cgst:             Number(raw.cgst),
        sgst:             Number(raw.sgst),
        igst:             Number(raw.igst),
        grandTotal:       Number(raw.totalAmount ?? raw.grandTotal),
        lines: (raw.lines ?? []).map((l: any) => ({
          itemId:      l.itemId,
          ratePerGram: Number(l.ratePerGram),
          lineTotal:   Number(l.lineTotal),
        })),
      };
      setPreview(data);
      // Merge ratePerGram + lineTotal back into bill lines
      setLines((prev) =>
        prev.map((line) => {
          const match = data.lines?.find((l) => l.itemId === line.itemId);
          return match
            ? { ...line, ratePerGram: match.ratePerGram, lineTotal: match.lineTotal }
            : line;
        }),
      );
    },
    onError: () => {
      setPreview(null);
    },
  });

  // ── Invoice create mutation ───────────────────────────────────────────────
  const invoiceMutation = useMutation({
    mutationFn: (payload: object) =>
      api.post('/billing/invoices', payload).then((r: any) => r.data),
    onSuccess: (data: any) => {
      const invoiceNo = data?.invoiceNumber ?? data?.id;
      toast.success(`Invoice ${invoiceNo} generated`, {
        description: 'Bill has been saved successfully.',
        action: {
          label: 'View PDF',
          onClick: () => downloadInvoicePdf(data.id, data.invoiceNumber),
        },
      });
      setCreatedInvoiceId(data?.id ?? null);
      resetForm();
    },
    onError: (err: any) => {
      toast.error('Failed to generate invoice', {
        description: err?.response?.data?.message ?? 'Please try again.',
      });
    },
  });

  // ── Create customer mutation ──────────────────────────────────────────────
  const createCustomerMutation = useMutation({
    mutationFn: (payload: object) =>
      api.post('/billing/customers', payload).then((r: any) => r.data),
    onSuccess: (data: any) => {
      setCustomer({ id: data.id, name: data.name, phone: data.phone, email: data.email, address: data.address });
      setShowNewCustomerForm(false);
      setNewCustomer({ name: '', phone: '', email: '', address: '' });
      setCustomerSearch('');
      toast.success(`Customer "${data.name}" registered`);
    },
    onError: (err: any) => {
      toast.error('Failed to create customer', {
        description: err?.response?.data?.message ?? 'Please try again.',
      });
    },
  });

  function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!newCustomer.name.trim() || !newCustomer.phone.trim()) {
      toast.error('Name and phone are required');
      return;
    }
    createCustomerMutation.mutate({
      name: newCustomer.name.trim(),
      phone: newCustomer.phone.trim(),
      ...(newCustomer.email.trim() ? { email: newCustomer.email.trim() } : {}),
      ...(newCustomer.address.trim() ? { address: newCustomer.address.trim() } : {}),
    });
  }

  // ── Build preview payload (no customerId — preview doesn't need it) ────────
  const buildPayload = useCallback(() => {
    return {
      lines: lines.map((l) => ({
        itemId: l.itemId,
        qty: l.qty,
        netWeightG: l.netWeightG,
      })),
      oldGoldWeightG: oldGold.weightG ? parseFloat(oldGold.weightG) : 0,
      oldGoldRatePerGram: oldGold.ratePerGram ? parseFloat(oldGold.ratePerGram) : 0,
      isInterstate: gstMode === 'inter',
    };
  }, [lines, oldGold, gstMode]);

  // ── Auto-trigger preview when bill changes ────────────────────────────────
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (lines.length === 0) {
      setPreview(null);
      return;
    }
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      previewMutation.mutate(buildPayload());
    }, 400);
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, oldGold, gstMode, isWalkIn, customer]);

  // ── Close dropdowns on outside click ─────────────────────────────────────
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(e.target as Node)
      ) {
        setShowCustomerDropdown(false);
      }
      if (
        itemDropdownRef.current &&
        !itemDropdownRef.current.contains(e.target as Node)
      ) {
        setShowItemDropdown(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  function addItem(item: any) {
    const exists = lines.find((l) => l.itemId === item.id);
    if (exists) {
      setLines((prev) =>
        prev.map((l) => (l.itemId === item.id ? { ...l, qty: l.qty + 1 } : l)),
      );
    } else {
      setLines((prev) => [
        ...prev,
        {
          itemId: item.id,
          name: item.name,
          sku: item.sku,
          qty: 1,
          netWeightG: Number(item.netWeightG),
          purity: item.purity,
          makingPct: Number(item.makingPct ?? 0),
          makingPerGram: Number(item.makingPerGram ?? 0),
          stoneValue: Number(item.stoneValue ?? 0),
        },
      ]);
    }
    setItemSearch('');
    setShowItemDropdown(false);
  }

  function removeLine(itemId: string) {
    setLines((prev) => prev.filter((l) => l.itemId !== itemId));
  }

  function updateQty(itemId: string, delta: number) {
    setLines((prev) =>
      prev
        .map((l) => (l.itemId === itemId ? { ...l, qty: Math.max(1, l.qty + delta) } : l))
        .filter((l) => l.qty > 0),
    );
  }

  function setQtyDirect(itemId: string, val: string) {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) {
      setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, qty: n } : l)));
    }
  }

  function handleGenerateInvoice() {
    if (lines.length === 0 || (!isWalkIn && !customer)) return;
    const payload = {
      ...buildPayload(),
      ...(customer && !isWalkIn ? { customerId: customer.id } : {}),
      paymentMode,
      paymentAmount: paymentAmount ? parseFloat(paymentAmount) : preview?.grandTotal ?? 0,
    };
    invoiceMutation.mutate(payload);
  }

  function resetForm() {
    setLines([]);
    setOldGold({ weightG: '', ratePerGram: '' });
    setCustomer(null);
    setIsWalkIn(true);
    setCustomerSearch('');
    setShowNewCustomerForm(false);
    setNewCustomer({ name: '', phone: '', email: '', address: '' });
    setGstMode('intra');
    setPaymentMode('CASH');
    setPaymentAmount('');
    setPreview(null);
  }

  const items: any[] = itemResults?.items ?? itemResults ?? [];
  const customers: any[] = customerResults?.customers ?? customerResults ?? [];
  const totalLines = lines.reduce((sum, l) => sum + l.qty, 0);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full overflow-hidden bg-slate-50">
      {/* ── LEFT: Item search + bill lines ── */}
      <div className="flex flex-col w-[42%] shrink-0 border-r border-slate-200 bg-card overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
              Add Items
            </h2>
            <div className="flex items-center gap-2">
              <RatePill label="22K" rateKey="GOLD:GOLD_22K" />
              <RatePill label="24K" rateKey="GOLD:GOLD_24K" />
            </div>
          </div>

          {/* Item search */}
          <div ref={itemDropdownRef} className="relative">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="search"
                value={itemSearch}
                onChange={(e) => {
                  setItemSearch(e.target.value);
                  setShowItemDropdown(true);
                }}
                onFocus={() => setShowItemDropdown(true)}
                placeholder="Search by name, SKU, or HUID…"
                className="w-full pl-9 pr-10 py-2.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:bg-card focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all placeholder:text-slate-400"
              />
              {itemSearching && (
                <Loader2
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500 animate-spin"
                />
              )}
              {itemSearch && !itemSearching && (
                <button
                  onClick={() => { setItemSearch(''); setShowItemDropdown(false); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Item results dropdown */}
            {showItemDropdown && debouncedItemSearch.length > 1 && items.length > 0 && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-card border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                {items.map((item: any) => (
                  <button
                    key={item.id}
                    onClick={() => addItem(item)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-amber-50 text-left group transition-colors"
                  >
                    <div className="shrink-0 w-8 h-8 rounded-md bg-amber-100 flex items-center justify-center">
                      <span className="text-xs font-bold text-amber-700">
                        {PURITY_LABELS[item.purity] ?? '—'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate group-hover:text-amber-800">
                        {item.name}
                      </p>
                      <p className="text-xs text-slate-400 tabular-nums">
                        {item.sku} · {fmtWt(Number(item.netWeightG))}g
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        item.stockQty <= 2
                          ? 'bg-red-50 text-red-600'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {item.stockQty} in stock
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showItemDropdown && debouncedItemSearch.length > 1 && !itemSearching && items.length === 0 && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-card border border-slate-200 rounded-lg shadow-sm px-4 py-3 text-sm text-slate-400">
                No items found
              </div>
            )}
          </div>
        </div>

        {/* Bill lines */}
        <div className="flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-300 py-16">
              <FileText size={40} strokeWidth={1} />
              <p className="text-sm">Search and add items above</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {lines.map((line, idx) => (
                <div key={line.itemId} className="px-4 py-3 group">
                  <div className="flex items-start gap-3">
                    {/* Index */}
                    <div className="shrink-0 w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center mt-0.5">
                      <span className="text-xs font-bold text-amber-700">{idx + 1}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate leading-tight">
                            {line.name}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {line.sku} · {PURITY_LABELS[line.purity] ?? line.purity} · {fmtWt(line.netWeightG)}g/pc
                          </p>
                        </div>
                        <button
                          onClick={() => removeLine(line.itemId)}
                          className="shrink-0 text-slate-300 hover:text-red-400 transition-colors p-1 -mr-1 opacity-0 group-hover:opacity-100"
                          title="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Qty + weight + rate + total */}
                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        {/* Qty control */}
                        <div className="flex items-center gap-1 bg-slate-50 rounded-md border border-slate-200">
                          <button
                            onClick={() => updateQty(line.itemId, -1)}
                            className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-l-md transition-colors"
                          >
                            <Minus size={12} />
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={line.qty}
                            onChange={(e) => setQtyDirect(line.itemId, e.target.value)}
                            className="w-8 h-7 text-center text-sm font-semibold text-slate-800 bg-transparent outline-none tabular-nums"
                          />
                          <button
                            onClick={() => updateQty(line.itemId, 1)}
                            className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-r-md transition-colors"
                          >
                            <Plus size={12} />
                          </button>
                        </div>

                        <div className="flex items-center gap-3 text-xs tabular-nums">
                          <span className="text-slate-400">
                            {fmtWt(line.netWeightG * line.qty)}g total
                          </span>
                          {line.ratePerGram !== undefined && (
                            <span className="text-slate-400">
                              @₹{fmt(line.ratePerGram)}/g
                            </span>
                          )}
                          {line.lineTotal !== undefined && (
                            <span className="font-semibold text-amber-700">
                              ₹{fmt(line.lineTotal)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom stat */}
        {lines.length > 0 && (
          <div className="shrink-0 px-4 py-2 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
            <span>{lines.length} item type{lines.length !== 1 ? 's' : ''} · {totalLines} pc{totalLines !== 1 ? 's' : ''}</span>
            <button
              onClick={resetForm}
              className="text-red-400 hover:text-red-600 transition-colors font-medium"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* ── RIGHT: Bill builder ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ── Customer section ── */}
          <section className="bg-card rounded-xl border border-slate-200">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
              <User size={14} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-700">Customer</h3>
            </div>
            <div className="px-4 py-3 space-y-3">
              {/* Walk-in toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div
                  onClick={() => {
                    setIsWalkIn((v) => !v);
                    setCustomer(null);
                    setCustomerSearch('');
                    setShowNewCustomerForm(false);
                    setNewCustomer({ name: '', phone: '', email: '', address: '' });
                  }}
                  className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
                    isWalkIn ? 'bg-amber-500' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-card rounded-full shadow transition-transform ${
                      isWalkIn ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </div>
                <span className="text-sm text-slate-600 group-hover:text-slate-800">
                  Walk-in customer
                </span>
              </label>

              {!isWalkIn && (
                <div ref={customerDropdownRef} className="space-y-3">
                  {/* ── Selected customer chip ── */}
                  {customer ? (
                    <div className="flex items-start gap-3 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                      <UserCheck size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">{customer.name}</p>
                        {customer.phone && (
                          <p className="text-xs text-slate-500">{customer.phone}</p>
                        )}
                        {customer.address && (
                          <p className="text-xs text-slate-400 truncate">{customer.address}</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setCustomer(null);
                          setCustomerSearch('');
                          setShowNewCustomerForm(false);
                        }}
                        className="text-slate-400 hover:text-slate-600 shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : showNewCustomerForm ? (
                    /* ── New customer inline form ── */
                    <form onSubmit={handleCreateCustomer} className="space-y-2.5 border border-amber-200 rounded-lg p-3 bg-amber-50/40">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">New Customer</p>
                        <button
                          type="button"
                          onClick={() => { setShowNewCustomerForm(false); setNewCustomer({ name: '', phone: '', email: '', address: '' }); }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Name <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={newCustomer.name}
                            onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
                            placeholder="Full name"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-card focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            Phone <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="tel"
                            required
                            value={newCustomer.phone}
                            onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value }))}
                            placeholder="10-digit mobile"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-card focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
                          <input
                            type="email"
                            value={newCustomer.email}
                            onChange={(e) => setNewCustomer((p) => ({ ...p, email: e.target.value }))}
                            placeholder="optional"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-card focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-slate-500 mb-1">Address</label>
                          <textarea
                            rows={2}
                            value={newCustomer.address}
                            onChange={(e) => setNewCustomer((p) => ({ ...p, address: e.target.value }))}
                            placeholder="Street, city, pin code…"
                            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-card focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all resize-none"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={createCustomerMutation.isPending}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          {createCustomerMutation.isPending ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <UserCheck size={13} />
                          )}
                          {createCustomerMutation.isPending ? 'Saving…' : 'Save & Select'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* ── Search box + dropdown ── */
                    <div className="relative">
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                        />
                        <input
                          type="search"
                          value={customerSearch}
                          onChange={(e) => {
                            setCustomerSearch(e.target.value);
                            setShowCustomerDropdown(true);
                          }}
                          onFocus={() => setShowCustomerDropdown(true)}
                          placeholder="Search by name or phone…"
                          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all"
                        />
                        {customerSearching && (
                          <Loader2
                            size={13}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-500 animate-spin"
                          />
                        )}
                      </div>

                      {/* Results dropdown */}
                      {showCustomerDropdown && debouncedCustomerSearch.length > 1 && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                          {customers.length > 0 && (
                            <div className="max-h-40 overflow-y-auto">
                              {customers.map((c: any) => (
                                <button
                                  key={c.id}
                                  onClick={() => {
                                    setCustomer({ id: c.id, name: c.name, phone: c.phone, email: c.email, address: c.address });
                                    setShowCustomerDropdown(false);
                                    setCustomerSearch('');
                                  }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-amber-50 text-left border-b border-slate-50 last:border-0"
                                >
                                  <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                    <span className="text-xs font-bold text-slate-500">
                                      {c.name?.[0]?.toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-800">{c.name}</p>
                                    {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          {!customerSearching && customers.length === 0 && (
                            <div className="px-3 py-2.5 text-sm text-slate-400">
                              No customers found for "{debouncedCustomerSearch}"
                            </div>
                          )}
                          {/* Always show New Customer option at bottom of dropdown */}
                          <button
                            onClick={() => {
                              setShowCustomerDropdown(false);
                              setShowNewCustomerForm(true);
                              setNewCustomer((p) => ({
                                ...p,
                                name: /^\d/.test(customerSearch) ? '' : customerSearch,
                                phone: /^\d/.test(customerSearch) ? customerSearch : '',
                              }));
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-amber-700 font-medium hover:bg-amber-50 border-t border-slate-100"
                          >
                            <Plus size={14} className="shrink-0" />
                            New customer
                            {customerSearch && ` "${customerSearch}"`}
                          </button>
                        </div>
                      )}

                      {/* New customer button when search is empty */}
                      {!showCustomerDropdown && !customerSearch && (
                        <button
                          onClick={() => setShowNewCustomerForm(true)}
                          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 text-sm text-amber-700 font-medium border border-dashed border-amber-300 rounded-lg hover:bg-amber-50 transition-colors"
                        >
                          <Plus size={13} />
                          Register new customer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ── Old Gold Exchange ── */}
          <section className="bg-card rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
              <Scale size={14} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-700">Old Gold Exchange</h3>
              <span className="text-xs text-slate-400 ml-1">(optional)</span>
            </div>
            <div className="px-4 py-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    Weight (grams)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    value={oldGold.weightG}
                    onChange={(e) => setOldGold((p) => ({ ...p, weightG: e.target.value }))}
                    placeholder="0.000"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all tabular-nums font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1.5">
                    Rate / gram (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={oldGold.ratePerGram}
                    onChange={(e) => setOldGold((p) => ({ ...p, ratePerGram: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all tabular-nums font-mono"
                  />
                </div>
              </div>
              {oldGold.weightG && oldGold.ratePerGram && (
                <p className="mt-2 text-xs text-emerald-600 font-medium tabular-nums">
                  Deduction: ₹{fmt(parseFloat(oldGold.weightG) * parseFloat(oldGold.ratePerGram))}
                </p>
              )}
            </div>
          </section>

          {/* ── GST mode ── */}
          <section className="bg-card rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Tax</h3>
            </div>
            <div className="px-4 py-3 flex items-center gap-3">
              <button
                onClick={() => setGstMode('intra')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${
                  gstMode === 'intra'
                    ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                    : 'bg-card border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                Intra-state
                <span className={`block text-xs font-normal mt-0.5 ${gstMode === 'intra' ? 'text-amber-100' : 'text-slate-400'}`}>
                  CGST + SGST
                </span>
              </button>
              <button
                onClick={() => setGstMode('inter')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${
                  gstMode === 'inter'
                    ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                    : 'bg-card border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                Inter-state
                <span className={`block text-xs font-normal mt-0.5 ${gstMode === 'inter' ? 'text-amber-100' : 'text-slate-400'}`}>
                  IGST
                </span>
              </button>
            </div>
          </section>

          {/* ── Bill summary ── */}
          <section className="bg-card rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Bill Summary</h3>
              {previewMutation.isPending && (
                <Loader2 size={13} className="text-amber-400 animate-spin" />
              )}
              {previewMutation.isError && (
                <span className="flex items-center gap-1 text-xs text-red-400">
                  <AlertCircle size={12} /> Preview failed
                </span>
              )}
            </div>
            <div className="px-4 py-3">
              {!preview && lines.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-2">
                  Add items to see the bill summary
                </p>
              )}
              {preview && (
                <div className="space-y-0.5">
                  <SummaryRow label="Metal value" value={fmt(preview.subtotal)} />
                  <SummaryRow label="Making charges" value={fmt(preview.makingTotal)} />
                  {preview.stoneTotal > 0 && (
                    <SummaryRow label="Stone value" value={fmt(preview.stoneTotal)} />
                  )}
                  {preview.oldGoldDeduction > 0 && (
                    <SummaryRow
                      label="Old gold deduction"
                      value={fmt(preview.oldGoldDeduction)}
                      deduction
                    />
                  )}
                  <SummaryRow label="Taxable amount" value={fmt(preview.taxableAmount)} />
                  {gstMode === 'intra' ? (
                    <>
                      <SummaryRow label="CGST" sub="1.5%" value={fmt(preview.cgst)} />
                      <SummaryRow label="SGST" sub="1.5%" value={fmt(preview.sgst)} />
                    </>
                  ) : (
                    <SummaryRow label="IGST" sub="3%" value={fmt(preview.igst)} />
                  )}
                  <SummaryRow
                    label="Grand Total"
                    value={fmt(preview.grandTotal)}
                    bold
                    accent
                  />
                </div>
              )}
            </div>
          </section>

          {/* ── Payment ── */}
          <section className="bg-card rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
              <CreditCard size={14} className="text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-700">Payment</h3>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  Payment mode
                </label>
                <div className="relative">
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                    className="w-full appearance-none px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none bg-card transition-all"
                  >
                    {(Object.keys(PAYMENT_LABELS) as PaymentMode[]).map((mode) => (
                      <option key={mode} value={mode}>
                        {PAYMENT_LABELS[mode]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">
                  Amount received (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder={preview ? fmt(preview.grandTotal) : '0.00'}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition-all font-mono tabular-nums"
                />
                {paymentAmount && preview && (
                  <p className={`mt-1.5 text-xs font-medium tabular-nums ${
                    parseFloat(paymentAmount) >= preview.grandTotal
                      ? 'text-emerald-600'
                      : 'text-amber-600'
                  }`}>
                    {parseFloat(paymentAmount) >= preview.grandTotal
                      ? `Change: ₹${fmt(parseFloat(paymentAmount) - preview.grandTotal)}`
                      : `Short by: ₹${fmt(preview.grandTotal - parseFloat(paymentAmount))}`}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* ── Bottom action bar ── */}
        <div className="shrink-0 px-5 py-3 border-t border-slate-200 bg-card flex items-center gap-3">
          {createdInvoiceId && (
            <button
              onClick={() => downloadInvoicePdf(createdInvoiceId)}
              className="flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-700 font-medium transition-colors"
            >
              <ExternalLink size={14} />
              Download PDF
            </button>
          )}
          <div className="flex-1" />

          {preview && lines.length > 0 && (
            <div className="text-right mr-2">
              <p className="text-xs text-slate-400">Grand Total</p>
              <p className="text-lg font-bold text-amber-700 font-mono tabular-nums leading-tight">
                ₹{fmt(preview.grandTotal)}
              </p>
            </div>
          )}

          {!isWalkIn && !customer && lines.length > 0 && (
            <p className="text-xs text-amber-600 font-medium">
              Select or register a customer to continue
            </p>
          )}

          <button
            onClick={handleGenerateInvoice}
            disabled={lines.length === 0 || (!isWalkIn && !customer) || invoiceMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm rounded-lg transition-colors shadow-sm disabled:shadow-none"
          >
            {invoiceMutation.isPending ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <CheckCircle2 size={15} />
                Generate Invoice
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
