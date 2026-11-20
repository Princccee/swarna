/**
 * Purities the shop works with (mirrors apps/api/src/common/purities.ts).
 *
 * - PURITY_CHOICES: what can be picked for new items, bills, orders and loans.
 * - DEFAULT_RATE_PURITIES: shown by default (ticker, POS header, dashboard, Share Kit).
 *   24K can still be picked but isn't shown by default.
 * - One silver: SILVER_999, shown as "Silver".
 * Older purities (14K, Silver 925, Platinum) keep their labels for existing records only.
 */
export const PURITY_CHOICES = ['GOLD_22K', 'GOLD_18K', 'SILVER_999', 'GOLD_24K'] as const;
export const DEFAULT_RATE_PURITIES = ['GOLD_22K', 'GOLD_18K', 'SILVER_999'] as const;

export const PURITY_LABEL: Record<string, string> = {
  GOLD_22K: 'Gold 22K',
  GOLD_18K: 'Gold 18K',
  GOLD_24K: 'Gold 24K',
  SILVER_999: 'Silver',
  // Older purities — existing records only
  GOLD_14K: 'Gold 14K',
  SILVER_925: 'Silver 925',
  PLATINUM_950: 'Platinum 950',
};

export const PURITY_SHORT: Record<string, string> = {
  GOLD_22K: '22K',
  GOLD_18K: '18K',
  GOLD_24K: '24K',
  SILVER_999: 'Silver',
  GOLD_14K: '14K',
  SILVER_925: 'Ag 925',
  PLATINUM_950: 'Pt 950',
};

/** Choices for a select; keeps a record's current (older) purity selectable so editing doesn't break it. */
export function purityOptions(current?: string | null): string[] {
  const list: string[] = [...PURITY_CHOICES];
  if (current && !list.includes(current)) list.push(current);
  return list;
}
