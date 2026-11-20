import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Share2, Download, Copy, MessageCircle, RefreshCw, Search,
  Check, Coins, Sparkles, Info, ImageOff, Loader2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { CUSTOMER_PORTAL_ENABLED } from '../../lib/features';
import {
  renderRateCard, renderCollage, loadImage, shareImage, downloadBlob, canShareFiles,
  whatsappTextUrl, formatInr, formatDateIST, RATE_UNIT_GRAMS, type RateRow, type ShopInfo,
} from '../../lib/share-cards';
import { PURITY_LABEL } from '../../lib/purities';

// ── Types ──────────────────────────────────────────────────────────────────────

interface RateCardData {
  shop: { name: string; address: string; phone: string; whatsappNumber: string };
  rates: Array<{ metal: string; purity: string; ratePerGram: number; snappedAt: string }>;
}

interface ShareItem {
  id: string;
  sku: string;
  name: string;
  purity: string;
  netWeightG: number;
  categoryName: string;
  hasImage: boolean;
  catalogueVisible: boolean;
}

type Tab = 'rates' | 'designs';

const PURITIES: Array<{ purity: string; group: 'gold' | 'silver'; label: string; sub: string; defaultOn: boolean }> = [
  { purity: 'GOLD_22K',   group: 'gold',   label: '22K',    sub: 'Jewellery gold · 916', defaultOn: true },
  { purity: 'GOLD_18K',   group: 'gold',   label: '18K',    sub: '750',                  defaultOn: true },
  { purity: 'SILVER_999', group: 'silver', label: 'Silver', sub: '999 fine',             defaultOn: true },
  // 24K can be added to a card, but isn't shown by default
  { purity: 'GOLD_24K',   group: 'gold',   label: '24K',    sub: 'Pure gold · 999',      defaultOn: false },
];

const PURITY_NAME = PURITY_LABEL;

const MAX_DESIGNS = 4;
const unwrap = (r: any) => r.data?.data ?? r.data;

// ── Caption builders ───────────────────────────────────────────────────────────

function ratesCaption(shop: ShopInfo, date: Date, gold: RateRow[], silver: RateRow[]): string {
  const lines = [`🪙 *${shop.name} — Today's Rates*`, formatDateIST(date)];
  if (gold.length) {
    lines.push('', `*Gold* (per ${RATE_UNIT_GRAMS} g)`, ...gold.map((r) => `${r.label}: ₹${formatInr(r.ratePer10g)}`));
  }
  if (silver.length) {
    lines.push('', `*Silver* (per ${RATE_UNIT_GRAMS} g)`, ...silver.map((r) => `${r.label}: ₹${formatInr(r.ratePer10g)}`));
  }
  lines.push('', '_Making charges & GST extra._');
  if (shop.whatsappNumber) lines.push(`💬 WhatsApp *RATES* to ${shop.whatsappNumber} anytime for live rates.`);
  return lines.join('\n');
}

function designsCaption(shop: ShopInfo, title: string, items: ShareItem[]): string {
  const origin = window.location.origin;
  const lines = [`✨ *${title || 'New Arrivals'}* at ${shop.name}`, ''];
  for (const it of items) {
    lines.push(`• *${it.name}* — ${PURITY_NAME[it.purity] ?? it.purity} · ${it.netWeightG} g`);
    // Catalogue links only while the customer catalogue is switched on — no dead links
    if (CUSTOMER_PORTAL_ENABLED && it.catalogueVisible) lines.push(`  ${origin}/catalogue/items/${it.id}`);
  }
  if (CUSTOMER_PORTAL_ENABLED) lines.push('', `🛍️ Browse more: ${origin}/catalogue`);
  else lines.push('');
  if (shop.whatsappNumber) lines.push(`💬 WhatsApp *NEW* to ${shop.whatsappNumber} to see our latest designs.`);
  return lines.join('\n');
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ShareKitPage() {
  const [tab, setTab] = useState<Tab>('rates');

  // Rates state
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(PURITIES.map((p) => [p.purity, p.defaultOn])),
  );

  // Designs state
  const [title, setTitle] = useState('New Arrivals');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selected, setSelected] = useState<ShareItem[]>([]);
  const imageCache = useRef(new Map<string, HTMLImageElement | null>());

  // Output state
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [caption, setCaption] = useState('');
  const [captionEdited, setCaptionEdited] = useState(false);
  const canShare = useMemo(canShareFiles, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const ratesQuery = useQuery<RateCardData>({
    queryKey: ['share-kit', 'rates'],
    queryFn: () => api.get('/marketing/share/rates').then(unwrap),
  });

  const itemsQuery = useQuery<ShareItem[]>({
    queryKey: ['share-kit', 'items', debouncedSearch],
    queryFn: () =>
      api.get('/marketing/share/items', { params: debouncedSearch ? { search: debouncedSearch } : {} }).then(unwrap),
    enabled: tab === 'designs',
  });

  const shop: ShopInfo | null = ratesQuery.data
    ? {
        name: ratesQuery.data.shop.name || 'Our Shop',
        address: ratesQuery.data.shop.address,
        whatsappNumber: ratesQuery.data.shop.whatsappNumber,
      }
    : null;

  const rateRows = useMemo(() => {
    const byPurity = new Map((ratesQuery.data?.rates ?? []).map((r) => [r.purity, r]));
    const rows = PURITIES.filter((p) => enabled[p.purity] && byPurity.has(p.purity)).map((p) => ({
      group: p.group,
      row: { label: p.label, sub: p.sub, ratePer10g: byPurity.get(p.purity)!.ratePerGram * RATE_UNIT_GRAMS } as RateRow,
    }));
    return {
      gold: rows.filter((r) => r.group === 'gold').map((r) => r.row),
      silver: rows.filter((r) => r.group === 'silver').map((r) => r.row),
      available: new Set(byPurity.keys()),
    };
  }, [ratesQuery.data, enabled]);

  const today = useMemo(() => new Date(), [ratesQuery.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset caption edits when switching tabs
  useEffect(() => setCaptionEdited(false), [tab]);

  // Render the image + default caption whenever inputs change
  useEffect(() => {
    if (!shop) return;
    let cancelled = false;

    async function run() {
      setRendering(true);
      try {
        let out: Blob | null = null;
        if (tab === 'rates') {
          if (rateRows.gold.length + rateRows.silver.length === 0) {
            out = null;
          } else {
            out = await renderRateCard({ shop: shop!, date: today, gold: rateRows.gold, silver: rateRows.silver });
          }
          if (!captionEdited) setCaption(ratesCaption(shop!, today, rateRows.gold, rateRows.silver));
        } else {
          if (selected.length === 0) {
            out = null;
          } else {
            const tiles = await Promise.all(selected.map(async (it) => ({
              name: it.name,
              detail: `${PURITY_NAME[it.purity] ?? it.purity} · ${it.netWeightG} g`,
              image: it.hasImage ? await getItemImage(it.id) : null,
            })));
            out = await renderCollage({ shop: shop!, title, tiles });
          }
          if (!captionEdited) setCaption(designsCaption(shop!, title, selected));
        }
        if (!cancelled) setBlob(out);
      } catch (err) {
        if (!cancelled) toast.error((err as Error).message || 'Could not render image');
      } finally {
        if (!cancelled) setRendering(false);
      }
    }

    async function getItemImage(id: string): Promise<HTMLImageElement | null> {
      const cache = imageCache.current;
      if (cache.has(id)) return cache.get(id)!;
      try {
        const res = await api.get(`/marketing/share/items/${id}/image`, { responseType: 'blob' });
        const img = await loadImage(res.data as Blob);
        cache.set(id, img);
        return img;
      } catch {
        cache.set(id, null);
        return null;
      }
    }

    const t = setTimeout(run, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [tab, shop?.name, shop?.address, shop?.whatsappNumber, rateRows, selected, title, today, captionEdited]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!blob) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  const filename = tab === 'rates'
    ? `rates-${new Date().toISOString().slice(0, 10)}.png`
    : `new-designs-${new Date().toISOString().slice(0, 10)}.png`;

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function onShare() {
    if (!blob) return;
    try {
      const ok = await shareImage(blob, filename, caption);
      if (!ok) toast.info('Sharing isn\'t supported in this browser — use Download + Copy caption.');
    } catch (err) {
      toast.error(`Share failed: ${(err as Error).message}`);
    }
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(caption);
      toast.success('Caption copied');
    } catch {
      toast.error('Could not copy — select the text and copy manually');
    }
  }

  function toggleItem(it: ShareItem) {
    setSelected((prev) => {
      if (prev.some((p) => p.id === it.id)) return prev.filter((p) => p.id !== it.id);
      if (prev.length >= MAX_DESIGNS) {
        toast.info(`Pick up to ${MAX_DESIGNS} designs`);
        return prev;
      }
      return [...prev, it];
    });
  }

  const emptyMessage = tab === 'rates'
    ? (ratesQuery.isLoading ? null : 'No rates available. Check the Rates page or pick at least one purity.')
    : 'Pick 1–4 designs to build a collage.';

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <Link
          to="/owner/marketing"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Marketing
        </Link>
        <div className="flex items-center gap-2 mt-2">
          <Share2 className="w-5 h-5 text-emerald-600" />
          <h1 className="text-2xl font-bold text-foreground">Share Kit</h1>
          <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-600 text-white rounded px-1.5 py-0.5">Free</span>
        </div>
        <p className="text-sm text-muted-foreground mt-0.5">
          Make a ready-to-post image and caption, then share it to your WhatsApp Channel or Status. Posting this way costs nothing.
        </p>
      </div>

      {/* Tabs */}
      <div className="inline-flex rounded-lg border bg-muted/40 p-1" role="tablist">
        {([
          { id: 'rates', label: 'Daily Rates', icon: Coins },
          { id: 'designs', label: 'Designs', icon: Sparkles },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === id ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        {/* ── Controls ── */}
        <div className="space-y-5 min-w-0">
          {tab === 'rates' ? (
            <section className="bg-card border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Rates to show</h2>
                <button
                  onClick={() => ratesQuery.refetch()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium border rounded-lg px-2.5 py-1.5 hover:bg-muted/50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${ratesQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh rates
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {PURITIES.map((p) => {
                  const rate = ratesQuery.data?.rates.find((r) => r.purity === p.purity);
                  const disabled = !rate;
                  return (
                    <label
                      key={p.purity}
                      className={`flex items-center gap-3 border rounded-lg px-3 py-2.5 text-sm ${
                        disabled ? 'opacity-50' : 'cursor-pointer hover:bg-muted/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-amber-600 w-4 h-4"
                        checked={!!enabled[p.purity] && !disabled}
                        disabled={disabled}
                        onChange={(e) => setEnabled((s) => ({ ...s, [p.purity]: e.target.checked }))}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="font-medium">{p.group === 'gold' ? 'Gold' : 'Silver'} {p.label}</span>
                        <span className="block text-xs text-muted-foreground">{p.sub}</span>
                      </span>
                      <span className="font-semibold tabular-nums">
                        {rate ? <>₹{formatInr(rate.ratePerGram * RATE_UNIT_GRAMS)}<span className="text-xs font-normal text-muted-foreground">/{RATE_UNIT_GRAMS} g</span></> : '—'}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Rates come from the live rate feed. To change today's rate, update it on the{' '}
                <Link to="/owner/rates" className="underline underline-offset-2">Rates page</Link> and refresh.
              </p>
            </section>
          ) : (
            <section className="bg-card border rounded-xl p-5 space-y-4">
              <div className="space-y-1">
                <label htmlFor="collage-title" className="text-sm font-medium">Headline</label>
                <input
                  id="collage-title"
                  value={title}
                  maxLength={40}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="New Arrivals"
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {['New Arrivals', 'Trending This Week', 'Wedding Collection', 'Festive Specials'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTitle(t)}
                      className="text-xs border rounded-full px-2.5 py-1 hover:bg-muted/50"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-medium">
                    Pick designs <span className="text-muted-foreground font-normal">({selected.length}/{MAX_DESIGNS})</span>
                  </h2>
                  {selected.length > 0 && (
                    <button onClick={() => setSelected([])} className="text-xs text-muted-foreground hover:text-foreground">
                      Clear
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name or SKU"
                    className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="max-h-[420px] overflow-y-auto border rounded-lg divide-y">
                  {itemsQuery.isLoading && (
                    <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading items…
                    </div>
                  )}
                  {itemsQuery.data?.length === 0 && (
                    <div className="p-4 text-sm text-muted-foreground">No in-stock items match.</div>
                  )}
                  {itemsQuery.data?.map((it) => {
                    const order = selected.findIndex((s) => s.id === it.id);
                    const isOn = order >= 0;
                    return (
                      <button
                        key={it.id}
                        onClick={() => toggleItem(it)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                          isOn ? 'bg-amber-50 dark:bg-amber-900/20' : 'hover:bg-muted/40'
                        }`}
                      >
                        <span
                          className={`w-6 h-6 shrink-0 rounded-full border flex items-center justify-center text-xs font-semibold ${
                            isOn ? 'bg-amber-600 border-amber-600 text-white' : 'text-transparent'
                          }`}
                        >
                          {isOn ? order + 1 : <Check className="w-3 h-3" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="font-medium block truncate">{it.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {it.categoryName} · {PURITY_NAME[it.purity] ?? it.purity} · {it.netWeightG} g · {it.sku}
                          </span>
                        </span>
                        {!it.hasImage && (
                          <span title="No photo — a placeholder will be used" className="text-muted-foreground">
                            <ImageOff className="w-4 h-4" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  Items without a photo get a placeholder tile. Add photos on the item's inventory page for best results.
                </p>
              </div>
            </section>
          )}

          {/* How to post */}
          <section className="border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-900/10 rounded-xl p-5 text-sm space-y-2">
            <h2 className="font-semibold flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
              <Info className="w-4 h-4" /> How to post for free
            </h2>
            <ol className="list-decimal pl-5 space-y-1 text-emerald-900/90 dark:text-emerald-200/90">
              <li><b>On a phone:</b> tap <b>Share</b>, choose WhatsApp, then pick your <b>Channel</b> or <b>My status</b>. The caption is filled in for you.</li>
              <li><b>On a computer:</b> tap <b>Download</b> and <b>Copy caption</b>. In WhatsApp go to <b>Updates → your channel</b>, attach the image and paste.</li>
              <li>Customers who message <b>RATES</b> or <b>NEW</b> to your WhatsApp number get an automatic reply, which is also free.</li>
            </ol>
            {!shop?.whatsappNumber && ratesQuery.data && (
              <p className="text-amber-800 dark:text-amber-300">
                Tip: set your WhatsApp number in <Link to="/owner/settings" className="underline underline-offset-2">Settings</Link> so it's printed on the images.
              </p>
            )}
          </section>
        </div>

        {/* ── Preview + actions ── */}
        <div className="space-y-4 min-w-0 lg:sticky lg:top-4 self-start">
          <div className="relative bg-muted/40 border rounded-xl overflow-hidden aspect-[4/5] flex items-center justify-center">
            {previewUrl ? (
              <img src={previewUrl} alt="Share image preview" className="w-full h-full object-contain" />
            ) : (
              <p className="text-sm text-muted-foreground px-8 text-center">
                {ratesQuery.isLoading ? 'Loading…' : emptyMessage}
              </p>
            )}
            {rendering && (
              <div className="absolute top-3 right-3 bg-background/80 rounded-full p-1.5">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {canShare && (
              <button
                onClick={onShare}
                disabled={!blob}
                className="col-span-2 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5 rounded-lg"
              >
                <Share2 className="w-4 h-4" /> Share to WhatsApp
              </button>
            )}
            <button
              onClick={() => blob && downloadBlob(blob, filename)}
              disabled={!blob}
              className={`inline-flex items-center justify-center gap-1.5 border bg-card hover:bg-muted/50 disabled:opacity-50 text-sm font-medium px-3 py-2 rounded-lg ${canShare ? '' : 'col-span-1'}`}
            >
              <Download className="w-4 h-4" /> Download
            </button>
            <button
              onClick={onCopy}
              disabled={!caption}
              className="inline-flex items-center justify-center gap-1.5 border bg-card hover:bg-muted/50 disabled:opacity-50 text-sm font-medium px-3 py-2 rounded-lg"
            >
              <Copy className="w-4 h-4" /> Copy caption
            </button>
            <a
              href={whatsappTextUrl(caption)}
              target="_blank"
              rel="noreferrer"
              className="col-span-2 inline-flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground py-1"
            >
              <MessageCircle className="w-4 h-4" /> Send caption only (text) via WhatsApp
            </a>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="caption" className="text-sm font-medium">Caption</label>
              {captionEdited && (
                <button
                  onClick={() => setCaptionEdited(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Reset
                </button>
              )}
            </div>
            <textarea
              id="caption"
              value={caption}
              onChange={(e) => { setCaption(e.target.value); setCaptionEdited(true); }}
              rows={10}
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">*bold* and _italic_ work in WhatsApp.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
