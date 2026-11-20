/**
 * Purities the shop works with. The database enum still holds older values (GOLD_14K,
 * SILVER_925, PLATINUM_950) so existing records keep working, but nothing new can use them.
 *
 * - SELECTABLE: allowed for new items, bills, orders, loans and manual rates
 * - DEFAULT_RATE: shown by default (rate ticker, WhatsApp rate replies, dashboards).
 *   24K can still be chosen but isn't shown by default.
 * - There is one silver: SILVER_999, shown as "Silver".
 */
export const SELECTABLE_PURITIES = ['GOLD_22K', 'GOLD_18K', 'SILVER_999', 'GOLD_24K'] as const;
export const DEFAULT_RATE_PURITIES = ['GOLD_22K', 'GOLD_18K', 'SILVER_999'] as const;

export const SELECTABLE_PURITY_MESSAGE = 'Choose 22K, 18K or 24K gold, or silver';
