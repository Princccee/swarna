/**
 * Lending (girvi) interest rules — pure functions, no Nest/DB.
 *
 * Shop rules (owner-confirmed, see docs/superpowers/specs/2026-11-11-lending-design.md):
 *  - Simple interest per month on the outstanding principal (never on unpaid interest).
 *  - A part month counts as a full month.
 *  - The loan's first period charges at least one month (even if repaid the same day).
 *  - A payment clears the interest due first; the rest reduces the principal; the interest
 *    period then restarts from the payment date on the new principal.
 *  - v1: a payment must at least cover the interest due.
 *
 * Month counting uses calendar dates in India time. "One month" from 31 Jan ends on the
 * last day of February (month-end clamping).
 */

const TZ = 'Asia/Kolkata';

export interface CalDate { y: number; m: number; d: number } // m: 1–12

export function istCalDate(date: Date): CalDate {
  const [y, m, d] = date.toLocaleDateString('en-CA', { timeZone: TZ }).split('-').map(Number);
  return { y, m, d };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** `start` + k calendar months, clamping the day to the target month's length. */
function addMonths(start: CalDate, k: number): CalDate {
  const idx = start.y * 12 + (start.m - 1) + k;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return { y, m, d: Math.min(start.d, daysInMonth(y, m)) };
}

function cmp(a: CalDate, b: CalDate): number {
  return a.y - b.y || a.m - b.m || a.d - b.d;
}

/** Whole calendar months completed between two calendar dates (b ≥ a). */
export function wholeMonthsBetween(a: CalDate, b: CalDate): number {
  let whole = (b.y - a.y) * 12 + (b.m - a.m);
  while (whole > 0 && cmp(addMonths(a, whole), b) > 0) whole--;
  return Math.max(0, whole);
}

/**
 * Months of interest to charge for the period [start, end].
 * Part months round up. The loan's first period is at least one month.
 */
export function monthsCharged(start: Date, end: Date, firstPeriod: boolean): number {
  const a = istCalDate(start);
  const b = istCalDate(end);
  if (cmp(b, a) < 0) throw new Error('The date cannot be before the start of the interest period');
  const whole = wholeMonthsBetween(a, b);
  const partial = cmp(addMonths(a, whole), b) < 0 ? 1 : 0;
  const months = whole + partial;
  return firstPeriod ? Math.max(1, months) : months;
}

/** Interest in whole rupees. */
export function interestFor(principal: number, monthlyRatePct: number, months: number): number {
  return Math.round(principal * (monthlyRatePct / 100) * months);
}

export interface LoanState {
  principal: number;
  monthlyRatePct: number;
  interestStartDate: Date;
  /** true until the first (non-reversed) payment */
  firstPeriod: boolean;
}

export interface Due {
  months: number;
  interestDue: number;
  totalDue: number;
}

export function dueOn(loan: LoanState, on: Date): Due {
  const months = monthsCharged(loan.interestStartDate, on, loan.firstPeriod);
  const interestDue = interestFor(loan.principal, loan.monthlyRatePct, months);
  return { months, interestDue, totalDue: round2(loan.principal + interestDue) };
}

export interface PaymentSplit extends Due {
  amount: number;
  interestPart: number;
  principalPart: number;
  principalAfter: number;
  closesLoan: boolean;
}

export class PaymentRuleError extends Error {}

/** How a payment of `amount` on `on` is applied. Throws PaymentRuleError if not allowed. */
export function splitPayment(loan: LoanState, amount: number, on: Date): PaymentSplit {
  if (!(amount > 0)) throw new PaymentRuleError('Payment amount must be more than zero');
  const due = dueOn(loan, on);
  const amt = round2(amount);
  if (amt > due.totalDue) {
    throw new PaymentRuleError(`Payment is more than the total due (Rs. ${fmt(due.totalDue)})`);
  }
  if (amt < due.interestDue) {
    throw new PaymentRuleError(
      `Payment must at least cover the interest due (Rs. ${fmt(due.interestDue)} for ${due.months} month${due.months === 1 ? '' : 's'})`,
    );
  }
  const interestPart = due.interestDue;
  const principalPart = round2(amt - interestPart);
  const principalAfter = round2(loan.principal - principalPart);
  return { ...due, amount: amt, interestPart, principalPart, principalAfter, closesLoan: principalAfter <= 0 };
}

/** Overdue once the loan date's N-month anniversary has been reached. */
export function isOverdue(loanDate: Date, on: Date, overdueMonths: number): boolean {
  return wholeMonthsBetween(istCalDate(loanDate), istCalDate(on)) >= overdueMonths;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmt(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
