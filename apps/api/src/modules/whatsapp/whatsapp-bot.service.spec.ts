import { detectIntent, normalizeText, toLocalPhone, WhatsAppBotService } from './whatsapp-bot.service';

const CATEGORIES = [
  { id: 'c-rings', name: 'Rings', slug: 'rings' },
  { id: 'c-chains', name: 'Chains', slug: 'chains' },
  { id: 'c-bangles', name: 'Bangles', slug: 'bangles' },
  { id: 'c-necklace', name: 'Necklaces', slug: 'necklaces' },
  { id: 'c-ear', name: 'Earrings', slug: 'earrings' },
];

describe('detectIntent', () => {
  const kind = (t: string) => detectIntent(t, CATEGORIES).kind;

  it.each([
    ['RATES', 'RATES'], ['rate?', 'RATES'], ["today's gold rate", 'RATES'], ['bhav', 'RATES'],
    ['आज का भाव', 'RATES'], ['silver', 'RATES'],
    ['NEW', 'NEW'], ['latest designs', 'NEW'], ['नए', 'NEW'],
    ['hi', 'MENU'], ['', 'MENU'], ['🙏', 'MENU'], ['hello there', 'MENU'],
  ])('"%s" → %s', (text, expected) => {
    expect(kind(text)).toBe(expected);
  });

  it('treats STOP/START as opt-out/opt-in only when it is the whole message', () => {
    expect(kind('STOP')).toBe('OPT_OUT');
    expect(kind('  Stop. ')).toBe('OPT_OUT');
    expect(kind('बंद')).toBe('OPT_OUT');
    expect(kind('unsubscribe')).toBe('OPT_OUT');
    expect(kind("please don't stop sending rates")).toBe('RATES');
    expect(kind('when do you stop work')).toBe('MENU');
    expect(kind('START')).toBe('OPT_IN');
  });

  it('matches categories by singular or plural, preferring them over rate words', () => {
    expect(detectIntent('rings', CATEGORIES)).toEqual({ kind: 'CATEGORY', categoryId: 'c-rings', categoryName: 'Rings' });
    expect(detectIntent('ring', CATEGORIES)).toMatchObject({ categoryId: 'c-rings' });
    expect(detectIntent('gold chain', CATEGORIES)).toMatchObject({ categoryId: 'c-chains' });
    expect(detectIntent('necklace', CATEGORIES)).toMatchObject({ categoryId: 'c-necklace' });
    expect(detectIntent('Show me EARRINGS', CATEGORIES)).toMatchObject({ categoryId: 'c-ear' });
  });
});

describe('helpers', () => {
  it('normalizeText strips punctuation/emoji but keeps Devanagari', () => {
    expect(normalizeText('  RATES!!! 🙏 ')).toBe('rates');
    expect(normalizeText('आज का भाव?')).toBe('आज का भाव');
  });

  it('toLocalPhone maps WhatsApp ids to 10-digit numbers', () => {
    expect(toLocalPhone('919876543210')).toBe('9876543210');
    expect(toLocalPhone('9876543210')).toBe('9876543210');
  });
});

describe('WhatsAppBotService.handleIncoming', () => {
  function setup(opts: { seen?: boolean; count?: number; rates?: any[]; items?: any[] } = {}) {
    const prisma = {
      category: { findMany: jest.fn().mockResolvedValue(CATEGORIES) },
      item: { findMany: jest.fn().mockResolvedValue(opts.items ?? []) },
      customer: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const redis = {
      setIfAbsent: jest.fn().mockResolvedValue(!opts.seen),
      incrWithTtl: jest.fn().mockResolvedValue(opts.count ?? 1),
    };
    const rates = {
      getCurrentRates: jest.fn().mockResolvedValue(opts.rates ?? [
        { metal: 'GOLD', purity: 'GOLD_22K', ratePerGram: 5977.4, snappedAt: '2026-11-11T04:30:00Z' },
        { metal: 'GOLD', purity: 'GOLD_24K', ratePerGram: 6520, snappedAt: '2026-11-11T04:30:00Z' },
        { metal: 'SILVER', purity: 'SILVER_999', ratePerGram: 85, snappedAt: '2026-11-11T04:30:00Z' },
      ]),
    };
    const settings = { get: jest.fn(async (k: string) => ({ shopName: 'Svarna Jewels' } as any)[k] ?? '') };
    const wa = {
      sendText: jest.fn().mockResolvedValue({ messageId: 'x', error: null }),
      sendImage: jest.fn().mockResolvedValue({ messageId: 'y', error: null }),
    };
    const config = { get: jest.fn().mockReturnValue('https://shop.example.com/') };
    const svc = new WhatsAppBotService(prisma as any, redis as any, rates as any, settings as any, wa as any, config as any);
    return { svc, prisma, redis, wa };
  }

  const msg = (body: string) => ({ from: '919876543210', id: 'wamid.1', type: 'text', text: { body } });

  it('replies to RATES with formatted live rates', async () => {
    const { svc, wa } = setup();
    await svc.handleIncoming(msg('rates'));
    const [to, text] = wa.sendText.mock.calls[0];
    expect(to).toBe('919876543210');
    expect(text).toContain("Svarna Jewels — Today's Rates");
    expect(text).toContain('*Gold* (per 10 g)');
    expect(text).toContain('22K: ₹59,774');   // 5977.4/g × 10, rounded after scaling
    expect(text).toContain('24K: ₹65,200');
    expect(text).toContain('*Silver* (per 10 g)');
    expect(text).toContain('999: ₹850');
    expect(text).not.toContain('18K'); // absent rates are omitted, not shown as blanks
  });

  it('says rates are updating when none are cached', async () => {
    const { svc, wa } = setup({ rates: [] });
    await svc.handleIncoming(msg('rates'));
    expect(wa.sendText.mock.calls[0][1]).toContain('being updated');
  });

  it('ignores duplicate webhook deliveries', async () => {
    const { svc, wa } = setup({ seen: true });
    await svc.handleIncoming(msg('rates'));
    expect(wa.sendText).not.toHaveBeenCalled();
  });

  it('stops replying past the per-phone rate limit', async () => {
    const { svc, wa } = setup({ count: 21 });
    await svc.handleIncoming(msg('rates'));
    expect(wa.sendText).not.toHaveBeenCalled();
  });

  it('opts the customer out and back in by local phone number', async () => {
    const { svc, prisma, wa } = setup();
    await svc.handleIncoming(msg('STOP'));
    expect(prisma.customer.updateMany).toHaveBeenCalledWith({
      where: { phone: '9876543210' },
      data: expect.objectContaining({ optedOut: true }),
    });
    expect(wa.sendText.mock.calls[0][1]).toContain('unsubscribed');

    await svc.handleIncoming({ ...msg('START'), id: 'wamid.2' });
    expect(prisma.customer.updateMany).toHaveBeenLastCalledWith({
      where: { phone: '9876543210' },
      data: { optedOut: false, optedOutAt: null },
    });
  });

  it('sends photos for public HTTPS images and links for the rest', async () => {
    const items = [
      { id: 'i1', name: 'Temple Necklace', purity: 'GOLD_22K', netWeightG: '24.5', imageUrls: ['https://cdn.example.com/svarna/a.jpg'] },
      { id: 'i2', name: 'Plain Band', purity: 'GOLD_18K', netWeightG: '3.2', imageUrls: ['http://localhost:9000/svarna/b.jpg'] },
      { id: 'i3', name: 'Anklet', purity: 'SILVER_925', netWeightG: '18', imageUrls: [] },
    ];
    const { svc, wa, prisma } = setup({ items });
    await svc.handleIncoming(msg('new'));

    expect(prisma.item.findMany.mock.calls[0][0].where).not.toHaveProperty('categoryId');
    expect(wa.sendImage).toHaveBeenCalledTimes(1);
    expect(wa.sendImage.mock.calls[0][1]).toBe('https://cdn.example.com/svarna/a.jpg');
    expect(wa.sendImage.mock.calls[0][2]).toContain('https://shop.example.com/catalogue/items/i1');

    const text = wa.sendText.mock.calls[0][1];
    expect(text).toContain('Plain Band');
    expect(text).toContain('18K Gold · 3.2 g');
    expect(text).toContain('https://shop.example.com/catalogue/items/i3');
    expect(text).not.toContain('Temple Necklace'); // already sent as a photo
  });

  it('filters items by the matched category', async () => {
    const { svc, prisma, wa } = setup({ items: [] });
    await svc.handleIncoming(msg('bangles'));
    expect(prisma.item.findMany.mock.calls[0][0].where.categoryId).toBe('c-bangles');
    expect(wa.sendText.mock.calls[0][1]).toContain("don't have bangles");
  });

  it('falls back to the menu', async () => {
    const { svc, wa } = setup();
    await svc.handleIncoming(msg('hello'));
    const text = wa.sendText.mock.calls[0][1];
    expect(text).toContain('*RATES*');
    expect(text).toContain('*RINGS*');
    expect(text).toContain('https://shop.example.com/catalogue');
  });
});
