import { useState, useRef, useEffect, useCallback } from 'react';
import { downloadInvoicePdf, shareInvoicePdf } from '../../lib/download-pdf';
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
  Share2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useRateStore } from '../../stores/rate.store';
import { useAuthStore } from '../../stores/auth.store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BillLine {
  /** itemId for inventory lines, 'manual-…' for lines typed in at the counter */
  key: string;
  itemId: string | null;
  name: string;
  sku: string;
  qty: number;
  netWeightG: number;
  purity: string;
  makingPct: number;
  makingPerGram: number;
  stoneValue: number;
  /** Rate per gram typed at the counter for this line (otherwise today's live rate) */
  manualRate?: number;
}

type BillType = 'TAX_INVOICE' | 'ESTIMATE';

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
  /** Same order as the bill lines sent */
  lines: Array<{
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
    <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-700/50 rounded-md px-2.5 py-1">
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
      />
      <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">{label}</span>
      <span className="font-mono text-xs font-semibold text-amber-900 dark:text-amber-200 tabular-nums">
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
      className={`flex items-baseline justify-between py-1.5 ${ bold ? 'border-t mt-1 pt-2.5' : '' }`}
    >
      <span
        className={`text-sm ${ bold ? 'font-semibold text-foreground' : 'text-muted-foreground' }`}
      >
        {label}
        {sub && <span className="text-xs ml-1 text-muted-foreground/60">{sub}</span>}
      </span>
      <span
        className={`font-mono text-sm tabular-nums ${ accent ? 'text-amber-700 dark:text-amber-400 font-bold text-base' : bold ? 'font-bold text-foreground' : deduction ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-foreground/80' }`}
      >
        {deduction ? `− ₹${value}` : `₹${value}`}
      </span>
    </div>
  );
}

const MANUAL_PURITIES = ['GOLD_24K', 'GOLD_22K', 'GOLD_18K', 'GOLD_14K', 'SILVER_999', 'SILVER_925', 'PLATINUM_950'];

function ManualLineForm({ onAdd, onClose }: { onAdd: (line: BillLine) => void; onClose: () => void }) {
  const [f, setF] = useState({
    name: '', purity: 'GOLD_22K', netWeightG: '', makingValue: '', makingType: 'pct' as 'pct' | 'perGram',
    stoneValue: '', rate: '',
  });
  const rate = useRateStore((st) => {
    const metal = f.purity.startsWith('SILVER') ? 'SILVER' : f.purity.startsWith('PLATINUM') ? 'PLATINUM' : 'GOLD';
    return st.rates[`${metal}:${f.purity}`]?.ratePerGram;
  });
  const inputCls = 'w-full px-2.5 py-1.5 text-sm border rounded-md bg-card focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none';
  const valid = f.name.trim().length > 0 && Number(f.netWeightG) > 0;

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    const making = Number(f.makingValue) || 0;
    onAdd({
      key: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      itemId: null,
      name: f.name.trim(),
      sku: 'Manual entry',
      qty: 1,
      netWeightG: Number(f.netWeightG),
      purity: f.purity,
      makingPct: f.makingType === 'pct' ? making : 0,
      makingPerGram: f.makingType === 'perGram' ? making : 0,
      stoneValue: Number(f.stoneValue) || 0,
      ...(Number(f.rate) > 0 ? { manualRate: Number(f.rate) } : {}),
    });
    setF({ ...f, name: '', netWeightG: '', makingValue: '', stoneValue: '', rate: '' });
  }

  return (
    <form onSubmit={add} className="mt-3 border border-amber-200 dark:border-amber-700/50 rounded-lg p-3 bg-amber-50/40 dark:bg-amber-500/10 dark:bg-amber-900/10 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide">Add item manually</p>
        <button type="button" onClick={onClose} className="text-muted-foreground/60 hover:text-muted-foreground"><X size={14} /></button>
      </div>
      <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Item name (e.g. Gold ring)" className={inputCls} />
      <div className="grid grid-cols-2 gap-2">
        <select value={f.purity} onChange={(e) => setF({ ...f, purity: e.target.value })} className={inputCls}>
          {MANUAL_PURITIES.map((p) => <option key={p} value={p}>{PURITY_LABELS[p]}</option>)}
        </select>
        <input type="number" min={0} step={0.001} value={f.netWeightG} onChange={(e) => setF({ ...f, netWeightG: e.target.value })}
          placeholder="Net weight (g)" className={`${inputCls} font-mono tabular-nums`} />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input type="number" min={0} step={0.01} value={f.makingValue} onChange={(e) => setF({ ...f, makingValue: e.target.value })}
          placeholder="Making charge" className={`${inputCls} font-mono tabular-nums`} />
        <select value={f.makingType} onChange={(e) => setF({ ...f, makingType: e.target.value as 'pct' | 'perGram' })} className={inputCls}>
          <option value="pct">% of metal</option>
          <option value="perGram">₹ per gram</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input type="number" min={0} step={0.01} value={f.stoneValue} onChange={(e) => setF({ ...f, stoneValue: e.target.value })}
          placeholder="Stone value ₹ (optional)" className={`${inputCls} font-mono tabular-nums`} />
        <input type="number" min={0} step={0.01} value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })}
          placeholder={rate ? `Rate ₹${fmt(rate)}/g (today)` : 'Rate ₹/g'} className={`${inputCls} font-mono tabular-nums`} />
      </div>
      <button type="submit" disabled={!valid}
        className="w-full py-1.5 text-sm font-semibold rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white">
        Add to bill
      </button>
      <p className="text-[11px] text-muted-foreground">Leave the rate empty to use today's live rate. Manual items don't change inventory stock.</p>
    </form>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function PosPage() {
  const user = useAuthStore((s) => s.user);

  // Bill state
  const [lines, setLines] = useState<BillLine[]>([]);
  const [oldGold, setOldGold] = useState<OldGold>({ weightG: '', ratePerGram: '' });
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [gstMode, setGstMode] = useState<GstMode>('intra');
  const [billType, setBillType] = useState<BillType>('TAX_INVOICE');
  const [showManualForm, setShowManualForm] = useState(false);
  const isEstimate = billType === 'ESTIMATE';
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
  const [createdInvoice, setCreatedInvoice] = useState<{
    id: string;
    invoiceNumber?: string;
    billType?: string;
    totalAmount?: number | string;
    customerPhone?: string;
  } | null>(null);

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
    enabled: debouncedCustomerSearch.length > 1,
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
          ratePerGram: Number(l.ratePerGram),
          lineTotal:   Number(l.lineTotal),
        })),
      };
      setPreview(data);
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
      const label = data?.billType === 'ESTIMATE' ? 'Estimate' : 'Invoice';
      toast.success(`${label} ${invoiceNo} generated`, {
        description: 'Bill has been saved successfully.',
        action: {
          label: 'View PDF',
          onClick: () => downloadInvoicePdf(data.id, data.invoiceNumber),
        },
      });
      setCreatedInvoice(
        data?.id
          ? {
              id: data.id,
              invoiceNumber: data.invoiceNumber,
              billType: data.billType,
              totalAmount: data.totalAmount,
              customerPhone: data.customer?.phone,
            }
          : null,
      );
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
      const existing = err?.response?.status === 409 ? err.response.data?.customer : null;
      if (existing) {
        // Phone already registered: use that customer rather than creating a duplicate
        setCustomer({ id: existing.id, name: existing.name, phone: existing.phone, email: existing.email, address: existing.address });
        setShowNewCustomerForm(false);
        setNewCustomer({ name: '', phone: '', email: '', address: '' });
        setCustomerSearch('');
        toast.info(`${existing.name} is already registered with this phone. Selected.`);
        return;
      }
      const m = err?.response?.data?.message;
      toast.error('Failed to add customer', {
        description: Array.isArray(m) ? m.join(', ') : m ?? 'Please try again.',
      });
    },
  });

  function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (newCustomer.name.trim().length < 2) {
      toast.error("Enter the customer's name");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(newCustomer.phone)) {
      toast.error('Enter a valid 10-digit mobile number');
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
      lines: lines.map((l) =>
        l.itemId
          ? { itemId: l.itemId, qty: l.qty, netWeightG: l.netWeightG, ...(l.manualRate ? { ratePerGram: l.manualRate } : {}) }
          : {
              qty: l.qty,
              description: l.name,
              purity: l.purity,
              netWeightG: l.netWeightG,
              ...(l.manualRate ? { ratePerGram: l.manualRate } : {}),
              ...(l.makingPct > 0 ? { makingPct: l.makingPct } : {}),
              ...(l.makingPerGram > 0 ? { makingPerGram: l.makingPerGram } : {}),
              ...(l.stoneValue > 0 ? { stoneValue: l.stoneValue } : {}),
            },
      ),
      oldGoldWeightG: oldGold.weightG ? parseFloat(oldGold.weightG) : 0,
      oldGoldRatePerGram: oldGold.ratePerGram ? parseFloat(oldGold.ratePerGram) : 0,
      isInterstate: gstMode === 'inter',
      billType,
    };
  }, [lines, oldGold, gstMode, billType]);

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
  }, [lines, oldGold, gstMode, billType]);

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
    const exists = lines.find((l) => l.key === item.id);
    if (exists) {
      setLines((prev) =>
        prev.map((l) => (l.key === item.id ? { ...l, qty: l.qty + 1 } : l)),
      );
    } else {
      setLines((prev) => [
        ...prev,
        {
          key: item.id,
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

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function updateQty(key: string, delta: number) {
    setLines((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, qty: Math.max(1, l.qty + delta) } : l))
        .filter((l) => l.qty > 0),
    );
  }

  function setQtyDirect(key: string, val: string) {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) {
      setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty: n } : l)));
    }
  }

  /** Edit a line's rate per gram; empty goes back to today's live rate */
  function setLineRate(key: string, val: string) {
    const n = parseFloat(val);
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, manualRate: val.trim() === '' || !(n > 0) ? undefined : n } : l)),
    );
  }

  function handleGenerateInvoice() {
    if (lines.length === 0) {
      toast.error('Add at least one item to the bill');
      return;
    }
    if (!customer) {
      toast.error('Choose or add the customer for this bill');
      return;
    }
    const payload = {
      ...buildPayload(),
      customerId: customer.id,
      // GST and non-GST bills take payment the same way; anything unpaid stays due
      paymentMode,
      // Cash handed over beyond the total is change given back, not a payment on the bill
      paymentAmount: paymentAmount
        ? Math.min(parseFloat(paymentAmount), preview?.grandTotal ?? parseFloat(paymentAmount))
        : preview?.grandTotal ?? 0,
    };
    invoiceMutation.mutate(payload);
  }

  function resetForm() {
    setLines([]);
    setOldGold({ weightG: '', ratePerGram: '' });
    setCustomer(null);
    setCustomerSearch('');
    setShowNewCustomerForm(false);
    setNewCustomer({ name: '', phone: '', email: '', address: '' });
    setGstMode('intra');
    setBillType('TAX_INVOICE');
    setShowManualForm(false);
    setPaymentMode('CASH');
    setPaymentAmount('');
    setPreview(null);
  }

  const items: any[] = itemResults?.items ?? itemResults ?? [];
  const customers: any[] = (customerResults?.customers ?? customerResults?.data ?? customerResults ?? [])
    .filter((c: any) => c.phone !== '0000000000');
  const totalLines = lines.reduce((sum, l) => sum + l.qty, 0);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col md:flex-row h-full overflow-y-auto md:overflow-hidden bg-muted/50">
      {/* ── LEFT: Item search + bill lines ── */}
      <div className="flex flex-col w-full md:w-[42%] md:shrink-0 border-b md:border-b-0 md:border-r bg-card md:overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-4 pt-4 pb-3 border-b">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-foreground/80 uppercase tracking-wide">
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
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none"
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
                className="w-full pl-9 pr-10 py-2.5 text-sm border rounded-lg bg-muted/50 focus:bg-card focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition-all placeholder:text-muted-foreground/60"
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Item results dropdown */}
            {showItemDropdown && debouncedItemSearch.length > 1 && items.length > 0 && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                {items.map((item: any) => (
                  <button
                    key={item.id}
                    onClick={() => addItem(item)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-amber-50 dark:hover:bg-amber-500/15 text-left group transition-colors"
                  >
                    <div className="shrink-0 w-8 h-8 rounded-md bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                        {PURITY_LABELS[item.purity] ?? '—'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-amber-800 dark:group-hover:text-amber-300">
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground/60 tabular-nums">
                        {item.sku} · {fmtWt(Number(item.netWeightG))}g
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ item.stockQty <= 2 ? 'bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' }`}>
                        {item.stockQty} in stock
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showItemDropdown && debouncedItemSearch.length > 1 && !itemSearching && items.length === 0 && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-sm px-4 py-3 text-sm text-muted-foreground/60">
                No items found.{' '}
                <button onClick={() => { setShowManualForm(true); setShowItemDropdown(false); }} className="text-amber-700 dark:text-amber-400 font-medium hover:underline">
                  Add it manually
                </button>
              </div>
            )}
          </div>

          {showManualForm ? (
            <ManualLineForm
              onAdd={(line) => { setLines((prev) => [...prev, line]); toast.success(`Added ${line.name}`); }}
              onClose={() => setShowManualForm(false)}
            />
          ) : (
            <button
              onClick={() => setShowManualForm(true)}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300"
            >
              <Plus size={13} /> Add item manually (not in inventory)
            </button>
          )}
        </div>

        {/* Bill lines */}
        <div className="md:flex-1 md:overflow-y-auto">
          {lines.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground/40 py-6 md:py-16">
              <FileText size={40} strokeWidth={1} />
              <p className="text-sm">Search and add items above</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {lines.map((line, idx) => {
                const priced = preview?.lines[idx];
                return (
                <div key={line.key} className="px-4 py-3 group">
                  <div className="flex items-start gap-3">
                    {/* Index */}
                    <div className="shrink-0 w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center mt-0.5">
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{idx + 1}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate leading-tight">
                            {line.name}
                          </p>
                          <p className="text-xs text-muted-foreground/60 mt-0.5">
                            {line.itemId ? line.sku : <span className="text-amber-700/80 font-medium">Manual entry</span>} · {PURITY_LABELS[line.purity] ?? line.purity} · {fmtWt(line.netWeightG)}g/pc
                            {!line.itemId && line.makingPct > 0 ? ` · making ${line.makingPct}%` : ''}
                            {!line.itemId && line.makingPerGram > 0 ? ` · making ₹${fmt(line.makingPerGram)}/g` : ''}
                            {!line.itemId && line.stoneValue > 0 ? ` · stone ₹${fmt(line.stoneValue)}` : ''}
                          </p>
                        </div>
                        <button
                          onClick={() => removeLine(line.key)}
                          className="shrink-0 text-muted-foreground/40 hover:text-red-400 transition-colors p-1 -mr-1 sm:opacity-0 sm:group-hover:opacity-100"
                          title="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Qty + weight + rate + total */}
                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        {/* Qty control */}
                        <div className="flex items-center gap-1 bg-muted/50 rounded-md border">
                          <button
                            onClick={() => updateQty(line.key, -1)}
                            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-l-md transition-colors"
                          >
                            <Minus size={12} />
                          </button>
                          <input
                            type="number"
                            min={1}
                            value={line.qty}
                            onChange={(e) => setQtyDirect(line.key, e.target.value)}
                            className="w-8 h-7 text-center text-sm font-semibold text-foreground bg-transparent outline-none tabular-nums"
                          />
                          <button
                            onClick={() => updateQty(line.key, 1)}
                            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-r-md transition-colors"
                          >
                            <Plus size={12} />
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs tabular-nums">
                          <span className="text-muted-foreground/60">
                            {fmtWt(line.netWeightG * line.qty)}g total
                          </span>
                          {/* Rate per gram — today's live rate unless edited here */}
                          <label className="flex items-center gap-1 text-muted-foreground/70">
                            <span>Rate ₹</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.01"
                              aria-label={`Rate per gram for ${line.name}`}
                              value={line.manualRate ?? ''}
                              placeholder={priced ? String(Number(priced.ratePerGram)) : 'live'}
                              onChange={(e) => setLineRate(line.key, e.target.value)}
                              className={`w-24 h-7 px-1.5 rounded-md border bg-transparent text-right text-xs tabular-nums outline-none focus:border-amber-400 ${line.manualRate ? 'border-amber-400 text-amber-700 dark:text-amber-400 font-semibold' : ''}`}
                            />
                            <span>/g</span>
                            {line.manualRate ? (
                              <button
                                type="button"
                                onClick={() => setLineRate(line.key, '')}
                                className="text-[11px] underline text-muted-foreground hover:text-foreground"
                                title="Use today's live rate"
                              >
                                live
                              </button>
                            ) : null}
                          </label>
                          {priced && (
                            <span className="font-semibold text-amber-700 dark:text-amber-400">
                              ₹{fmt(priced.lineTotal)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom stat */}
        {lines.length > 0 && (
          <div className="shrink-0 px-4 py-2 border-t bg-muted/50 flex items-center justify-between text-xs text-muted-foreground">
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
      <div className="flex-1 flex flex-col md:overflow-hidden">
        <div className="md:flex-1 md:overflow-y-auto px-3 sm:px-5 py-4 space-y-4">

          {/* ── Customer section ── */}
          <section className="bg-card rounded-xl border">
            <div className="px-4 py-2.5 border-b flex items-center gap-2">
              <User size={14} className="text-muted-foreground/60" />
              <h3 className="text-sm font-semibold text-foreground/80">Customer <span className="text-red-400">*</span></h3>
              {!customer && <span className="ml-auto text-xs text-muted-foreground/70">Find by name or phone, or add new</span>}
            </div>
            <div className="px-4 py-3 space-y-3">
              {(
                <div ref={customerDropdownRef} className="space-y-3">
                  {/* ── Selected customer chip ── */}
                  {customer ? (
                    <div className="flex items-start gap-3 px-3 py-2.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-700/50 rounded-lg">
                      <UserCheck size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{customer.name}</p>
                        {customer.phone && (
                          <p className="text-xs text-muted-foreground">{customer.phone}</p>
                        )}
                        {customer.address && (
                          <p className="text-xs text-muted-foreground/60 truncate">{customer.address}</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setCustomer(null);
                          setCustomerSearch('');
                          setShowNewCustomerForm(false);
                        }}
                        className="text-muted-foreground/60 hover:text-muted-foreground shrink-0"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : showNewCustomerForm ? (
                    /* ── New customer inline form ── */
                    <form onSubmit={handleCreateCustomer} className="space-y-2.5 border border-amber-200 dark:border-amber-700/50 rounded-lg p-3 bg-amber-50/40 dark:bg-amber-500/10">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wide">New Customer</p>
                        <button
                          type="button"
                          onClick={() => { setShowNewCustomerForm(false); setNewCustomer({ name: '', phone: '', email: '', address: '' }); }}
                          className="text-muted-foreground/60 hover:text-muted-foreground"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            Name <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={newCustomer.name}
                            onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))}
                            placeholder="Full name"
                            className="w-full px-3 py-2 text-sm border rounded-lg bg-card focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition-all"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            Phone <span className="text-red-400">*</span>
                          </label>
                          <input
                            type="tel"
                            required
                            value={newCustomer.phone}
                            inputMode="numeric"
                            maxLength={10}
                            onChange={(e) => setNewCustomer((p) => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                            placeholder="10-digit mobile"
                            className="w-full px-3 py-2 text-sm border rounded-lg bg-card focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition-all font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                          <input
                            type="email"
                            value={newCustomer.email}
                            onChange={(e) => setNewCustomer((p) => ({ ...p, email: e.target.value }))}
                            placeholder="optional"
                            className="w-full px-3 py-2 text-sm border rounded-lg bg-card focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition-all"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-muted-foreground mb-1">Address</label>
                          <textarea
                            rows={2}
                            value={newCustomer.address}
                            onChange={(e) => setNewCustomer((p) => ({ ...p, address: e.target.value }))}
                            placeholder="Street, city, pin code…"
                            className="w-full px-3 py-2 text-sm border rounded-lg bg-card focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition-all resize-none"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={createCustomerMutation.isPending}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-muted disabled:text-muted-foreground/60 text-white text-sm font-semibold rounded-lg transition-colors"
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
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none"
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
                          className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition-all"
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
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-card border rounded-lg shadow-lg overflow-hidden">
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
                                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-amber-50 dark:hover:bg-amber-500/15 text-left border-b last:border-0"
                                >
                                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                                    <span className="text-xs font-bold text-muted-foreground">
                                      {c.name?.[0]?.toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                                    {c.phone && <p className="text-xs text-muted-foreground/60">{c.phone}</p>}
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          {!customerSearching && customers.length === 0 && (
                            <div className="px-3 py-2.5 text-sm text-muted-foreground/60">
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
                                phone: /^\d/.test(customerSearch) ? customerSearch.replace(/\D/g, '').slice(-10) : '',
                              }));
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400 font-medium hover:bg-amber-50 dark:hover:bg-amber-500/15 border-t"
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
                          className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 text-sm text-amber-700 dark:text-amber-400 font-medium border border-dashed border-amber-300 dark:border-amber-700/60 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/15 transition-colors"
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
          <section className="bg-card rounded-xl border overflow-hidden">
            <div className="px-4 py-2.5 border-b flex items-center gap-2">
              <Scale size={14} className="text-muted-foreground/60" />
              <h3 className="text-sm font-semibold text-foreground/80">Old Gold Exchange</h3>
              <span className="text-xs text-muted-foreground/60 ml-1">(optional)</span>
            </div>
            <div className="px-4 py-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Weight (grams)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.001}
                    value={oldGold.weightG}
                    onChange={(e) => setOldGold((p) => ({ ...p, weightG: e.target.value }))}
                    placeholder="0.000"
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition-all tabular-nums font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Rate / gram (₹)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={oldGold.ratePerGram}
                    onChange={(e) => setOldGold((p) => ({ ...p, ratePerGram: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm border rounded-lg focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition-all tabular-nums font-mono"
                  />
                </div>
              </div>
              {oldGold.weightG && oldGold.ratePerGram && (
                <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">
                  Deduction: ₹{fmt(parseFloat(oldGold.weightG) * parseFloat(oldGold.ratePerGram))}
                </p>
              )}
            </div>
          </section>

          {/* ── GST mode ── */}
          <section className="bg-card rounded-xl border overflow-hidden">
            <div className="px-4 py-2.5 border-b flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground/80">GST</h3>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <span className="text-sm text-muted-foreground">{isEstimate ? 'Estimate (no GST)' : 'GST invoice'}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!isEstimate}
                  aria-label="Charge GST"
                  onClick={() => setBillType(isEstimate ? 'TAX_INVOICE' : 'ESTIMATE')}
                  className={`relative w-9 h-5 rounded-full transition-colors ${!isEstimate ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-card rounded-full shadow transition-transform ${ !isEstimate ? 'translate-x-4' : 'translate-x-0' }`}
                  />
                </button>
              </label>
            </div>
            {isEstimate && (
              <p className="px-4 py-3 text-xs text-muted-foreground">
                GST is off: this makes a non-GST bill (estimate). Take full or part payment below; the rest stays due. It isn't counted in GST sales reports.
              </p>
            )}
            <div className={`px-4 py-3 flex items-center gap-3 ${isEstimate ? 'hidden' : ''}`}>
              <button
                onClick={() => setGstMode('intra')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${ gstMode === 'intra' ? 'bg-amber-500 border-amber-500 text-white shadow-sm' : 'bg-card text-muted-foreground hover:' }`}
              >
                Intra-state
                <span className={`block text-xs font-normal mt-0.5 ${gstMode === 'intra' ? 'text-amber-100' : 'text-muted-foreground/60'}`}>
                  CGST + SGST
                </span>
              </button>
              <button
                onClick={() => setGstMode('inter')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-all ${ gstMode === 'inter' ? 'bg-amber-500 border-amber-500 text-white shadow-sm' : 'bg-card text-muted-foreground hover:' }`}
              >
                Inter-state
                <span className={`block text-xs font-normal mt-0.5 ${gstMode === 'inter' ? 'text-amber-100' : 'text-muted-foreground/60'}`}>
                  IGST
                </span>
              </button>
            </div>
          </section>

          {/* ── Bill summary ── */}
          <section className="bg-card rounded-xl border overflow-hidden">
            <div className="px-4 py-2.5 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground/80">Bill Summary</h3>
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
                <p className="text-sm text-muted-foreground/60 text-center py-2">
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
                  {!isEstimate && <SummaryRow label="Taxable amount" value={fmt(preview.taxableAmount)} />}
                  {isEstimate ? null : gstMode === 'intra' ? (
                    <>
                      <SummaryRow label="CGST" sub="1.5%" value={fmt(preview.cgst)} />
                      <SummaryRow label="SGST" sub="1.5%" value={fmt(preview.sgst)} />
                    </>
                  ) : (
                    <SummaryRow label="IGST" sub="3%" value={fmt(preview.igst)} />
                  )}
                  <SummaryRow
                    label={isEstimate ? 'Estimate total (no GST)' : 'Grand Total'}
                    value={fmt(preview.grandTotal)}
                    bold
                    accent
                  />
                </div>
              )}
            </div>
          </section>

          {/* ── Payment ── */}
          <section className="bg-card rounded-xl border overflow-hidden">
            <div className="px-4 py-2.5 border-b flex items-center gap-2">
              <CreditCard size={14} className="text-muted-foreground/60" />
              <h3 className="text-sm font-semibold text-foreground/80">Payment</h3>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Payment mode
                </label>
                <div className="relative">
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                    className="w-full appearance-none px-3 py-2 text-sm border rounded-lg focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none bg-card transition-all"
                  >
                    {(Object.keys(PAYMENT_LABELS) as PaymentMode[]).map((mode) => (
                      <option key={mode} value={mode}>
                        {PAYMENT_LABELS[mode]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Amount received (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder={preview ? fmt(preview.grandTotal) : '0.00'}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none transition-all font-mono tabular-nums"
                />
                {paymentAmount && preview && (
                  <p className={`mt-1.5 text-xs font-medium tabular-nums ${ parseFloat(paymentAmount) >= preview.grandTotal ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400' }`}>
                    {parseFloat(paymentAmount) >= preview.grandTotal
                      ? `Change: ₹${fmt(parseFloat(paymentAmount) - preview.grandTotal)}`
                      : `Balance due: ₹${fmt(preview.grandTotal - parseFloat(paymentAmount))} — recorded as due on the bill`}
                  </p>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* ── Bottom action bar ── */}
        <div className="shrink-0 sticky bottom-0 z-20 px-3 sm:px-5 py-3 border-t bg-card flex flex-wrap items-center gap-x-3 gap-y-2">
          {createdInvoice && (
            <>
              <button
                onClick={() => downloadInvoicePdf(createdInvoice.id, createdInvoice.invoiceNumber)}
                className="flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-700 font-medium transition-colors"
              >
                <ExternalLink size={14} />
                Download PDF
              </button>
              <button
                onClick={() =>
                  shareInvoicePdf(createdInvoice.id, {
                    invoiceNumber: createdInvoice.invoiceNumber,
                    billType: createdInvoice.billType,
                    amount: createdInvoice.totalAmount,
                    customerPhone: createdInvoice.customerPhone,
                  })
                }
                className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
              >
                <Share2 size={14} />
                Share PDF
              </button>
            </>
          )}
          <div className="flex-1" />

          {preview && lines.length > 0 && (
            <div className="text-right mr-2">
              <p className="text-xs text-muted-foreground/60">{isEstimate ? 'Estimate total' : 'Grand Total'}</p>
              <p className="text-lg font-bold text-amber-700 dark:text-amber-400 font-mono tabular-nums leading-tight">
                ₹{fmt(preview.grandTotal)}
              </p>
            </div>
          )}

          {!customer && lines.length > 0 && (
            <p className="text-xs text-amber-600 font-medium">
              Choose or add the customer to continue
            </p>
          )}

          <button
            onClick={handleGenerateInvoice}
            disabled={lines.length === 0 || !customer || invoiceMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-muted disabled:text-muted-foreground/60 text-white font-semibold text-sm rounded-lg transition-colors shadow-sm disabled:shadow-none"
          >
            {invoiceMutation.isPending ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <CheckCircle2 size={15} />
                {isEstimate ? 'Generate Estimate' : 'Generate Invoice'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
