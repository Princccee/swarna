import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RateSyncService } from '../rate-sync/rate-sync.service';
import { SettingsService } from '../settings/settings.service';
import { WhatsAppClient } from './whatsapp.client';
import { customerPortalEnabled } from '../../config/features';

/**
 * Keyword auto-replies for inbound WhatsApp messages.
 *
 * Every reply here is sent inside the 24-hour customer service window opened by the
 * customer's own message, so it is free and needs no pre-approved template.
 */

export type BotIntent =
  | { kind: 'OPT_OUT' }
  | { kind: 'OPT_IN' }
  | { kind: 'RATES' }
  | { kind: 'NEW' }
  | { kind: 'CATEGORY'; categoryId: string; categoryName: string }
  | { kind: 'MENU' };

const OPT_OUT_WORDS = new Set(['stop', 'unsubscribe', 'optout', 'opt out', 'रुको', 'बंद']);
const OPT_IN_WORDS = new Set(['start', 'subscribe', 'unstop', 'शुरू']);
const RATE_WORDS = new Set(['rate', 'rates', 'price', 'prices', 'bhav', 'bhaav', 'भाव', 'रेट', 'gold', 'silver', 'sona', 'chandi', 'सोना', 'चांदी']);
const NEW_WORDS = new Set(['new', 'latest', 'arrival', 'arrivals', 'trending', 'designs', 'design', 'नया', 'नए', 'नई']);

/** Rates shown to customers, in display order. */
const RATE_ROWS: Array<{ purity: string; label: string; group: 'Gold' | 'Silver' }> = [
  { purity: 'GOLD_24K', label: '24K', group: 'Gold' },
  { purity: 'GOLD_22K', label: '22K', group: 'Gold' },
  { purity: 'GOLD_18K', label: '18K', group: 'Gold' },
  { purity: 'SILVER_999', label: '999', group: 'Silver' },
  { purity: 'SILVER_925', label: '925', group: 'Silver' },
];

const PURITY_LABEL: Record<string, string> = {
  GOLD_24K: '24K Gold', GOLD_22K: '22K Gold', GOLD_18K: '18K Gold', GOLD_14K: '14K Gold',
  SILVER_999: 'Silver 999', SILVER_925: 'Silver 925', PLATINUM_950: 'Platinum 950',
};

/** Customer-facing rates are quoted per 10 grams (Indian retail convention). */
export const RATE_UNIT_GRAMS = 10;

const MAX_ITEMS = 5;
const MAX_IMAGES = 3;
const DEDUPE_TTL_S = 24 * 3600;      // Meta may redeliver a webhook; reply once per message id
const RATE_LIMIT_WINDOW_S = 3600;
const RATE_LIMIT_MAX = 20;           // replies per phone per hour — guards against reply loops

export function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ') // keep letters (incl. Devanagari + combining marks), digits
    .replace(/\s+/g, ' ')
    .trim();
}

/** Singularise naive English plurals so "rings" matches category "Ring" and vice versa. */
function stem(word: string): string {
  if (word.length > 3 && word.endsWith('es') && /(ch|sh|ss|x)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

export function detectIntent(
  rawText: string,
  categories: Array<{ id: string; name: string; slug: string }>,
): BotIntent {
  const text = normalizeText(rawText);
  if (!text) return { kind: 'MENU' };

  // Opt-out / opt-in must be the whole message, so "please don't stop" is not an opt-out.
  if (OPT_OUT_WORDS.has(text)) return { kind: 'OPT_OUT' };
  if (OPT_IN_WORDS.has(text)) return { kind: 'OPT_IN' };

  const words = text.split(' ');
  const stems = new Set(words.map(stem));

  // Category match first: "gold rings" should browse rings, not show rates.
  for (const c of categories) {
    const names = [normalizeText(c.name), normalizeText(c.slug.replace(/-/g, ' '))];
    for (const n of names) {
      const nameStems = n.split(' ').map(stem);
      if (nameStems.length > 0 && nameStems.every((s) => stems.has(s))) {
        return { kind: 'CATEGORY', categoryId: c.id, categoryName: c.name };
      }
    }
  }

  if (words.some((w) => RATE_WORDS.has(w))) return { kind: 'RATES' };
  if (words.some((w) => NEW_WORDS.has(w))) return { kind: 'NEW' };
  return { kind: 'MENU' };
}

/** WhatsApp sender ids are E.164 without '+'; our customers are stored as 10-digit Indian numbers. */
export function toLocalPhone(waFrom: string): string {
  const digits = waFrom.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function formatInr(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

@Injectable()
export class WhatsAppBotService {
  private readonly logger = new Logger(WhatsAppBotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly rates: RateSyncService,
    private readonly settings: SettingsService,
    private readonly wa: WhatsAppClient,
    private readonly config: ConfigService,
  ) {}

  /** Entry point for one inbound message object from the Meta webhook payload. */
  async handleIncoming(message: any): Promise<void> {
    const from: string | undefined = message?.from;
    const messageId: string | undefined = message?.id;
    if (!from) return;

    if (messageId && !(await this.redis.setIfAbsent(`wa:bot:seen:${messageId}`, '1', DEDUPE_TTL_S))) {
      return; // duplicate delivery
    }

    const count = await this.redis.incrWithTtl(`wa:bot:rl:${from}`, RATE_LIMIT_WINDOW_S);
    if (count > RATE_LIMIT_MAX) {
      this.logger.warn(`Bot rate limit hit for ${from} (${count} in window) — not replying`);
      return;
    }

    const text = this.extractText(message);
    const categories = await this.prisma.category.findMany({
      where: { visible: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, slug: true },
    });
    const intent = detectIntent(text, categories);
    this.logger.log(`Bot: ${from} sent "${text.slice(0, 60)}" → ${intent.kind}`);

    switch (intent.kind) {
      case 'OPT_OUT':
        await this.setOptOut(from, true);
        await this.wa.sendText(from,
          "You've been unsubscribed from offers and updates. You can still message us anytime.\n\nReply *START* to subscribe again.");
        return;
      case 'OPT_IN':
        await this.setOptOut(from, false);
        await this.wa.sendText(from, "You're subscribed to offers and updates again 🙏\n\nReply *MENU* to see options.");
        return;
      case 'RATES':
        await this.wa.sendText(from, await this.buildRatesReply());
        return;
      case 'NEW':
        await this.sendItems(from, 'Latest designs', undefined);
        return;
      case 'CATEGORY':
        await this.sendItems(from, intent.categoryName, intent.categoryId);
        return;
      case 'MENU':
      default:
        await this.wa.sendText(from, await this.buildMenuReply(categories));
    }
  }

  // ── Replies ────────────────────────────────────────────────────────────────

  async buildRatesReply(): Promise<string> {
    const shopName = await this.settings.get('shopName');
    const current = await this.rates.getCurrentRates();
    const byPurity = new Map(current.map((r) => [r.purity, r]));

    const rows = RATE_ROWS.filter((r) => byPurity.has(r.purity));
    if (rows.length === 0) {
      return `Sorry, today's rates are being updated. Please try again in a little while.\n\nReply *MENU* for options.`;
    }

    const latest = rows
      .map((r) => new Date(byPurity.get(r.purity)!.snappedAt).getTime())
      .reduce((a, b) => Math.max(a, b), 0);
    const when = new Date(latest).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    });

    const lines: string[] = [`🪙 *${shopName} — Today's Rates*`, `_Updated ${when}_`];
    for (const group of ['Gold', 'Silver'] as const) {
      const groupRows = rows.filter((r) => r.group === group);
      if (groupRows.length === 0) continue;
      lines.push('', `*${group}* (per ${RATE_UNIT_GRAMS} g)`);
      for (const r of groupRows) {
        lines.push(`${r.label}: ₹${formatInr(byPurity.get(r.purity)!.ratePerGram * RATE_UNIT_GRAMS)}`);
      }
    }
    lines.push(
      '',
      '_Indicative rates. Final price includes making charges and GST._',
      '',
      'Reply *NEW* for latest designs · *MENU* for options',
    );
    return lines.join('\n');
  }

  async buildMenuReply(categories: Array<{ name: string }>): Promise<string> {
    const [shopName, address, phone] = await Promise.all([
      this.settings.get('shopName'),
      this.settings.get('shopAddress'),
      this.settings.get('shopPhone'),
    ]);
    const lines = [
      `Namaste 🙏 Welcome to *${shopName}*!`,
      '',
      'Reply with:',
      '*RATES* — today\'s gold & silver rates',
      '*NEW* — our latest designs',
    ];
    if (categories.length > 0) {
      const names = categories.slice(0, 6).map((c) => `*${c.name.toUpperCase()}*`).join(', ');
      lines.push(`${names} — browse a category`);
    }
    lines.push('*STOP* — stop offers and updates');
    // Catalogue links only while the customer catalogue is switched on — no dead links
    if (customerPortalEnabled()) lines.push('', `🛍️ Full catalogue: ${this.catalogueUrl()}`);
    if (address) lines.push(`📍 ${address}`);
    if (phone) lines.push(`☎️ ${phone}`);
    return lines.join('\n');
  }

  private async sendItems(to: string, title: string, categoryId: string | undefined): Promise<void> {
    const items = await this.prisma.item.findMany({
      where: {
        catalogueVisible: true,
        active: true,
        deletedAt: null,
        stockQty: { gt: 0 },
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ITEMS,
      select: { id: true, name: true, purity: true, netWeightG: true, imageUrls: true },
    });

    if (items.length === 0) {
      await this.wa.sendText(to,
        `We don't have ${categoryId ? title.toLowerCase() : 'new designs'} listed online right now — please visit the store or call us.\n\nReply *MENU* for options.`);
      return;
    }

    const describe = (it: (typeof items)[number]) =>
      `*${it.name}*\n${PURITY_LABEL[it.purity] ?? it.purity} · ${Number(it.netWeightG)} g` +
      (customerPortalEnabled() ? `\n${this.itemUrl(it.id)}` : '');

    // Send photos when Meta can fetch them (public HTTPS); otherwise text with links.
    const withImages = items.filter((it) => this.isPublicImageUrl(it.imageUrls[0])).slice(0, MAX_IMAGES);
    for (const it of withImages) {
      await this.wa.sendImage(to, it.imageUrls[0], describe(it));
    }

    const rest = items.filter((it) => !withImages.includes(it));
    const lines = [`✨ *${title}*`];
    if (rest.length > 0) {
      lines.push('');
      rest.forEach((it) => lines.push(describe(it), ''));
    } else {
      lines.push('');
    }
    if (customerPortalEnabled()) {
      const browse = categoryId
        ? `${this.catalogueUrl()}/browse?categoryId=${categoryId}`
        : `${this.catalogueUrl()}/browse`;
      lines.push(`See more: ${browse}`, '');
    }
    lines.push('Reply *RATES* for today\'s rates · *MENU* for options');
    await this.wa.sendText(to, lines.join('\n'));
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private extractText(message: any): string {
    return (
      message?.text?.body ??
      message?.button?.text ??
      message?.interactive?.button_reply?.title ??
      message?.interactive?.list_reply?.title ??
      ''
    );
  }

  private async setOptOut(waFrom: string, optedOut: boolean): Promise<void> {
    const phone = toLocalPhone(waFrom);
    const res = await this.prisma.customer.updateMany({
      where: { phone },
      data: { optedOut, optedOutAt: optedOut ? new Date() : null },
    });
    this.logger.log(`Customer ${phone} ${optedOut ? 'opted out' : 'opted in'} (${res.count} record(s))`);
  }

  private catalogueUrl(): string {
    const base = (this.config.get<string>('app.frontendUrl') ?? '').replace(/\/+$/, '');
    return `${base}/catalogue`;
  }

  private itemUrl(id: string): string {
    return `${this.catalogueUrl()}/items/${id}`;
  }

  private isPublicImageUrl(url: string | undefined): url is string {
    if (!url) return false;
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname);
    } catch {
      return false;
    }
  }
}
