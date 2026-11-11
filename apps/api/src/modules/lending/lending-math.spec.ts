import { dueOn, isOverdue, monthsCharged, PaymentRuleError, splitPayment, LoanState } from './lending-math';

// Dates at 12:00 IST (06:30 UTC) so the IST calendar date is unambiguous
const d = (iso: string) => new Date(`${iso}T06:30:00Z`);

describe('monthsCharged', () => {
  it.each([
    ['2026-01-15', '2026-01-15', true, 1],   // same day, first period → minimum 1
    ['2026-01-15', '2026-01-15', false, 0],  // same day after a payment → nothing more
    ['2026-01-15', '2026-01-16', false, 1],  // one day → part month = full month
    ['2026-01-15', '2026-02-15', true, 1],   // exactly one month
    ['2026-01-15', '2026-02-16', true, 2],   // one month and a day
    ['2026-01-15', '2026-03-25', true, 3],   // 2 months 10 days (owner example)
    ['2026-01-31', '2026-02-28', true, 1],   // month-end clamping
    ['2026-01-31', '2026-03-01', true, 2],
    ['2025-11-20', '2026-11-20', true, 12],  // across a year
  ])('%s → %s (first=%s) = %i months', (a, b, first, expected) => {
    expect(monthsCharged(d(a), d(b), first as boolean)).toBe(expected);
  });

  it('uses India time: 11pm IST and 1am IST next day are different days', () => {
    const lateNight = new Date('2026-01-15T17:30:00Z'); // 23:00 IST 15 Jan
    const nextDay = new Date('2026-01-15T19:30:00Z');   // 01:00 IST 16 Jan
    expect(monthsCharged(lateNight, nextDay, false)).toBe(1);
  });

  it('rejects an end date before the start', () => {
    expect(() => monthsCharged(d('2026-02-01'), d('2026-01-01'), true)).toThrow();
  });
});

describe('dueOn', () => {
  it('matches the owner example: ₹50,000 at 2% for 2 months 10 days = ₹53,000', () => {
    const loan: LoanState = { principal: 50000, monthlyRatePct: 2, interestStartDate: d('2026-01-15'), firstPeriod: true };
    expect(dueOn(loan, d('2026-03-25'))).toEqual({ months: 3, interestDue: 3000, totalDue: 53000 });
  });

  it('rounds interest to the rupee', () => {
    const loan: LoanState = { principal: 33333, monthlyRatePct: 1.5, interestStartDate: d('2026-01-01'), firstPeriod: true };
    expect(dueOn(loan, d('2026-01-10')).interestDue).toBe(500); // 499.995 → 500
  });
});

describe('splitPayment', () => {
  const loan: LoanState = { principal: 50000, monthlyRatePct: 2, interestStartDate: d('2026-01-15'), firstPeriod: true };

  it('matches the owner example: ₹14,000 after 1 month 5 days → ₹2,000 interest, principal ₹38,000', () => {
    const s = splitPayment(loan, 14000, d('2026-02-20'));
    expect(s).toMatchObject({ months: 2, interestPart: 2000, principalPart: 12000, principalAfter: 38000, closesLoan: false });
  });

  it('interest-only payment leaves principal unchanged', () => {
    expect(splitPayment(loan, 1000, d('2026-02-10'))).toMatchObject({ interestPart: 1000, principalPart: 0, principalAfter: 50000 });
  });

  it('full payment closes the loan', () => {
    expect(splitPayment(loan, 53000, d('2026-03-25'))).toMatchObject({ principalAfter: 0, closesLoan: true });
  });

  it('then charges the next period on the reduced principal from the payment date', () => {
    const after: LoanState = { principal: 38000, monthlyRatePct: 2, interestStartDate: d('2026-02-20'), firstPeriod: false };
    expect(dueOn(after, d('2026-02-20'))).toEqual({ months: 0, interestDue: 0, totalDue: 38000 });
    expect(dueOn(after, d('2026-02-21'))).toEqual({ months: 1, interestDue: 760, totalDue: 38760 });
  });

  it('rejects payments below interest due, above total due, or not positive', () => {
    expect(() => splitPayment(loan, 1500, d('2026-03-25'))).toThrow(PaymentRuleError);
    expect(() => splitPayment(loan, 1500, d('2026-03-25'))).toThrow('at least cover the interest due (Rs. 3,000 for 3 months)');
    expect(() => splitPayment(loan, 53001, d('2026-03-25'))).toThrow('more than the total due');
    expect(() => splitPayment(loan, 0, d('2026-03-25'))).toThrow(PaymentRuleError);
  });
});

describe('isOverdue', () => {
  it('flags loans on and after the 12-month anniversary of the loan date', () => {
    expect(isOverdue(d('2025-11-12'), d('2026-11-11'), 12)).toBe(false);
    expect(isOverdue(d('2025-11-11'), d('2026-11-11'), 12)).toBe(true);
    expect(isOverdue(d('2024-01-01'), d('2026-11-11'), 12)).toBe(true);
  });
});
