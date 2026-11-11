import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../lib/api';

// ── Types (mirror the API) ────────────────────────────────────────────────────

export type LoanStatus = 'ACTIVE' | 'REDEEMED' | 'FORFEITED';

export interface LoanItem {
  id: string;
  description: string;
  metal: string;
  purity: string;
  grossWeightG: number;
  netWeightG: number;
  ratePerGram: number | null;
  value: number | null;
  notes: string | null;
}

export interface LoanPayment {
  id: string;
  paidAt: string;
  amount: number;
  interestPart: number;
  principalPart: number;
  principalBefore: number;
  principalAfter: number;
  monthsCharged: number;
  mode: string;
  reference: string | null;
  reversedAt: string | null;
}

export interface LoanPledge {
  id: string;
  merchantName: string;
  merchantPhone: string | null;
  pledgedAt: string;
  amount: number;
  notes: string | null;
  returnedAt: string | null;
}

export interface Loan {
  id: string;
  loanNumber: string;
  status: LoanStatus;
  customer: { id: string; name: string; phone: string; address: string | null };
  loanDate: string;
  interestStartDate: string;
  principalOriginal: number;
  principal: number;
  monthlyRatePct: number;
  ltvPct: number | null;
  valuationTotal: number | null;
  disbursedMode: string;
  notes: string | null;
  closedAt: string | null;
  forfeitOutcome: string | null;
  forfeitNotes: string | null;
  monthsRunning: number;
  due: { months: number; interestDue: number; totalDue: number } | null;
  overdue: boolean;
  withMerchant: boolean;
  items: LoanItem[];
  payments: LoanPayment[];
  pledges: LoanPledge[];
  activePledge: LoanPledge | null;
}

// ── Formatting ────────────────────────────────────────────────────────────────

export const inr = (n: number | null | undefined, decimals = 0) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;

export const grams = (n: number) => `${Number(n).toFixed(3)} g`;

export const dateIN = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const PURITY_LABEL: Record<string, string> = {
  GOLD_24K: 'Gold 24K', GOLD_22K: 'Gold 22K', GOLD_18K: 'Gold 18K', GOLD_14K: 'Gold 14K',
  SILVER_999: 'Silver 999', SILVER_925: 'Silver 925',
};
export const LENDABLE_PURITIES = Object.keys(PURITY_LABEL);

export const MODE_LABEL: Record<string, string> = {
  CASH: 'Cash', UPI: 'UPI', CARD: 'Card', NET_BANKING: 'Bank transfer', CHEQUE: 'Cheque',
};
export const MODES = Object.keys(MODE_LABEL);

export const unwrap = (r: any) => r.data?.data ?? r.data;
export const errMsg = (e: any) => {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m ?? e?.message ?? 'Something went wrong';
};

/** "/owner/lending" or "/pos/lending" depending on where the user is. */
export function useLendingBase(): string {
  const { pathname } = useLocation();
  return pathname.startsWith('/pos') ? '/pos/lending' : '/owner/lending';
}

/** Opens an authenticated PDF in a new tab. */
export async function openPdf(path: string) {
  const win = window.open('', '_blank');
  try {
    const res = await api.get(path, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    if (win) win.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    win?.close();
    toast.error(`Could not open the document: ${errMsg(e)}`);
  }
}

export function StatusBadges({ loan }: { loan: Pick<Loan, 'status' | 'overdue' | 'withMerchant' | 'forfeitOutcome'> }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {loan.status === 'ACTIVE' && !loan.overdue && (
        <span className="text-[11px] font-semibold rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">Active</span>
      )}
      {loan.overdue && (
        <span className="text-[11px] font-semibold rounded px-1.5 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Overdue</span>
      )}
      {loan.withMerchant && (
        <span className="text-[11px] font-semibold rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">With merchant</span>
      )}
      {loan.status === 'REDEEMED' && (
        <span className="text-[11px] font-semibold rounded px-1.5 py-0.5 bg-muted text-muted-foreground">Repaid</span>
      )}
      {loan.status === 'FORFEITED' && (
        <span className="text-[11px] font-semibold rounded px-1.5 py-0.5 bg-muted text-muted-foreground">
          Forfeited{loan.forfeitOutcome ? ` · ${loan.forfeitOutcome === 'SOLD' ? 'sold' : 'kept'}` : ''}
        </span>
      )}
    </span>
  );
}
