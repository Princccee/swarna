/**
 * Share Kit image rendering. Everything is drawn on a <canvas> in the browser so the
 * shop can post the result to a WhatsApp Channel / Status for free.
 *
 * Cards are 1080×1350 (4:5): fills a phone screen in Status and crops cleanly in Channels.
 */

export const CARD_W = 1080;
export const CARD_H = 1350;

/** Customer-facing rates are quoted per 10 grams (Indian retail convention). */
export const RATE_UNIT_GRAMS = 10;

const C = {
  bgTop: '#3b0d16',
  bgBottom: '#1c0509',
  gold: '#e8c372',
  goldDeep: '#b8862f',
  cream: '#fbf3e1',
  muted: 'rgba(251,243,225,0.72)',
  rule: 'rgba(232,195,114,0.35)',
  panel: 'rgba(255,255,255,0.05)',
};

const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';

export interface ShopInfo {
  name: string;
  address?: string;
  whatsappNumber?: string;
}

export interface RateRow {
  label: string;      // e.g. "22K"
  sub: string;        // e.g. "Jewellery gold"
  ratePer10g: number;
}

export interface RateCardInput {
  shop: ShopInfo;
  date: Date;
  gold: RateRow[];
  silver: RateRow[];
}

export interface CollageTile {
  name: string;
  detail: string;            // e.g. "22K Gold · 24.5 g"
  image: HTMLImageElement | null;
}

export interface CollageInput {
  shop: ShopInfo;
  title: string;             // e.g. "New Arrivals"
  tiles: CollageTile[];      // 1–4
}

// ── Shared drawing helpers ───────────────────────────────────────────────────

function newCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  return [canvas, ctx];
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, CARD_H);
  g.addColorStop(0, C.bgTop);
  g.addColorStop(1, C.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Soft glow behind the header
  const glow = ctx.createRadialGradient(CARD_W / 2, 140, 20, CARD_W / 2, 140, 520);
  glow.addColorStop(0, 'rgba(232,195,114,0.18)');
  glow.addColorStop(1, 'rgba(232,195,114,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, 700);

  // Inset double frame
  ctx.strokeStyle = C.rule;
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 36, CARD_W - 72, CARD_H - 72);
  ctx.strokeStyle = 'rgba(232,195,114,0.15)';
  ctx.strokeRect(48, 48, CARD_W - 96, CARD_H - 96);
}

function goldText(ctx: CanvasRenderingContext2D, y0: number, y1: number) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#f6dc9a');
  g.addColorStop(1, C.goldDeep);
  return g;
}

/** Shrinks font size until text fits maxWidth. Returns the size used. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (size: number) => string,
  maxWidth: number,
  startSize: number,
  minSize = 18,
): number {
  let size = startSize;
  ctx.font = font(size);
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = font(size);
  }
  return size;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
}

function drawOrnamentRule(ctx: CanvasRenderingContext2D, y: number, halfWidth = 220) {
  const cx = CARD_W / 2;
  ctx.strokeStyle = C.rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - halfWidth, y);
  ctx.lineTo(cx - 18, y);
  ctx.moveTo(cx + 18, y);
  ctx.lineTo(cx + halfWidth, y);
  ctx.stroke();
  ctx.fillStyle = C.gold;
  drawDiamond(ctx, cx, y, 8);
}

function drawHeader(ctx: CanvasRenderingContext2D, shopName: string, title: string, subtitle: string) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const size = fitText(ctx, shopName.toUpperCase(), (s) => `600 ${s}px ${SERIF}`, CARD_W - 200, 64, 34);
  ctx.fillStyle = goldText(ctx, 130 - size, 130);
  ctx.fillText(shopName.toUpperCase(), CARD_W / 2, 140);

  drawOrnamentRule(ctx, 180);

  ctx.fillStyle = C.cream;
  fitText(ctx, title, (s) => `${s}px ${SERIF}`, CARD_W - 200, 52, 30);
  ctx.fillText(title, CARD_W / 2, 258);

  ctx.fillStyle = C.muted;
  ctx.font = `30px ${SANS}`;
  ctx.fillText(subtitle, CARD_W / 2, 306);
}

function drawFooter(ctx: CanvasRenderingContext2D, shop: ShopInfo, callToAction: string) {
  const top = CARD_H - 200;
  ctx.strokeStyle = C.rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(110, top);
  ctx.lineTo(CARD_W - 110, top);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (shop.whatsappNumber) {
    ctx.fillStyle = C.gold;
    fitText(ctx, callToAction, (s) => `600 ${s}px ${SANS}`, CARD_W - 220, 36, 22);
    ctx.fillText(callToAction, CARD_W / 2, top + 62);
  }
  if (shop.address) {
    ctx.fillStyle = C.muted;
    ctx.font = `26px ${SANS}`;
    ctx.fillText(ellipsize(ctx, shop.address, CARD_W - 220), CARD_W / 2, top + (shop.whatsappNumber ? 110 : 70));
  }
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render image'))), 'image/png'),
  );
}

export function formatInr(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

export function formatDateIST(d: Date): string {
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ── Rate card ────────────────────────────────────────────────────────────────

export async function renderRateCard(input: RateCardInput): Promise<Blob> {
  const [canvas, ctx] = newCanvas();
  drawBackground(ctx);
  drawHeader(ctx, input.shop.name, "Today's Gold & Silver Rates", formatDateIST(input.date));

  const left = 110;
  const right = CARD_W - 110;
  let y = 370;

  const section = (heading: string, rows: RateRow[], rowH: number) => {
    if (rows.length === 0) return;
    const h = 70 + rows.length * rowH + 10;
    ctx.fillStyle = C.panel;
    ctx.beginPath();
    ctx.roundRect(left - 20, y, right - left + 40, h, 24);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = C.gold;
    ctx.font = `600 28px ${SANS}`;
    ctx.fillText(heading.toUpperCase().split('').join(' '), left + 10, y + 50);
    ctx.textAlign = 'right';
    ctx.fillStyle = C.muted;
    ctx.font = `24px ${SANS}`;
    ctx.fillText(`per ${RATE_UNIT_GRAMS} g`, right - 10, y + 50);

    let ry = y + 70;
    rows.forEach((r, i) => {
      if (i > 0) {
        ctx.strokeStyle = 'rgba(232,195,114,0.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left + 10, ry);
        ctx.lineTo(right - 10, ry);
        ctx.stroke();
      }
      const base = ry + rowH / 2 + 4;
      ctx.textAlign = 'left';
      ctx.fillStyle = C.cream;
      ctx.font = `600 46px ${SERIF}`;
      ctx.fillText(r.label, left + 10, base + 6);
      const labelW = ctx.measureText(r.label).width;
      ctx.fillStyle = C.muted;
      ctx.font = `24px ${SANS}`;
      ctx.fillText(r.sub, left + 10 + labelW + 20, base + 4);

      ctx.textAlign = 'right';
      ctx.fillStyle = goldText(ctx, base - 50, base + 6);
      ctx.font = `700 60px ${SANS}`;
      ctx.fillText(`₹${formatInr(r.ratePer10g)}`, right - 10, base + 10);
      ry += rowH;
    });
    y += h + 30;
  };

  const totalRows = input.gold.length + input.silver.length;
  const rowH = totalRows > 4 ? 92 : 112;
  section('Gold', input.gold, rowH);
  section('Silver', input.silver, rowH);

  ctx.textAlign = 'center';
  ctx.fillStyle = C.muted;
  ctx.font = `italic 24px ${SANS}`;
  ctx.fillText('Indicative rates · Making charges & GST extra', CARD_W / 2, Math.min(y + 20, CARD_H - 230));

  const wa = input.shop.whatsappNumber;
  drawFooter(ctx, input.shop, wa ? `WhatsApp "RATES" to ${wa} for live rates` : '');
  return toBlob(canvas);
}

// ── Design collage ───────────────────────────────────────────────────────────

type Rect = { x: number; y: number; w: number; h: number };

function layoutTiles(n: number, area: Rect, gap: number): Rect[] {
  const { x, y, w, h } = area;
  const halfW = (w - gap) / 2;
  const halfH = (h - gap) / 2;
  switch (n) {
    case 1: return [area];
    case 2: return [{ x, y, w, h: halfH }, { x, y: y + halfH + gap, w, h: halfH }];
    case 3: return [
      { x, y, w, h: halfH },
      { x, y: y + halfH + gap, w: halfW, h: halfH },
      { x: x + halfW + gap, y: y + halfH + gap, w: halfW, h: halfH },
    ];
    default: return [
      { x, y, w: halfW, h: halfH },
      { x: x + halfW + gap, y, w: halfW, h: halfH },
      { x, y: y + halfH + gap, w: halfW, h: halfH },
      { x: x + halfW + gap, y: y + halfH + gap, w: halfW, h: halfH },
    ];
  }
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, r: Rect) {
  const scale = Math.max(r.w / img.naturalWidth, r.h / img.naturalHeight);
  const sw = r.w / scale;
  const sh = r.h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, r.x, r.y, r.w, r.h);
}

function drawTile(ctx: CanvasRenderingContext2D, tile: CollageTile, r: Rect) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 20);
  ctx.clip();

  if (tile.image) {
    drawCover(ctx, tile.image, r);
  } else {
    // Placeholder: warm panel with a large initial
    const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    g.addColorStop(0, '#5a1a24');
    g.addColorStop(1, '#2a0a10');
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = 'rgba(232,195,114,0.35)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.min(r.w, r.h) * 0.4}px ${SERIF}`;
    ctx.fillText(tile.name.trim().charAt(0).toUpperCase() || '✦', r.x + r.w / 2, r.y + r.h / 2 - 30);
    ctx.textBaseline = 'alphabetic';
  }

  // Caption scrim
  const scrimH = Math.min(150, r.h * 0.42);
  const scrim = ctx.createLinearGradient(0, r.y + r.h - scrimH, 0, r.y + r.h);
  scrim.addColorStop(0, 'rgba(20,4,8,0)');
  scrim.addColorStop(1, 'rgba(20,4,8,0.88)');
  ctx.fillStyle = scrim;
  ctx.fillRect(r.x, r.y + r.h - scrimH, r.w, scrimH);

  const pad = 24;
  const maxW = r.w - pad * 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = C.cream;
  const nameSize = r.w > 600 ? 40 : 30;
  ctx.font = `600 ${nameSize}px ${SERIF}`;
  ctx.fillText(ellipsize(ctx, tile.name, maxW), r.x + pad, r.y + r.h - pad - 38);
  ctx.fillStyle = C.gold;
  ctx.font = `${r.w > 600 ? 28 : 22}px ${SANS}`;
  ctx.fillText(ellipsize(ctx, tile.detail, maxW), r.x + pad, r.y + r.h - pad);
  ctx.restore();

  ctx.strokeStyle = C.rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, 20);
  ctx.stroke();
}

export async function renderCollage(input: CollageInput): Promise<Blob> {
  const [canvas, ctx] = newCanvas();
  drawBackground(ctx);
  drawHeader(ctx, input.shop.name, input.title || 'New Arrivals', 'Now available in store');

  const tiles = input.tiles.slice(0, 4);
  const area: Rect = { x: 90, y: 350, w: CARD_W - 180, h: CARD_H - 350 - 230 };
  layoutTiles(Math.max(1, tiles.length), area, 20).forEach((r, i) => {
    if (tiles[i]) drawTile(ctx, tiles[i], r);
  });

  const wa = input.shop.whatsappNumber;
  drawFooter(ctx, input.shop, wa ? `WhatsApp "NEW" to ${wa} to see more` : '');
  return toBlob(canvas);
}

// ── Loading & sharing ────────────────────────────────────────────────────────

export function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bad image')); };
    img.src = url;
  });
}

export function canShareFiles(): boolean {
  try {
    const probe = new File([new Blob(['x'], { type: 'image/png' })], 'probe.png', { type: 'image/png' });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/**
 * Opens the OS share sheet with the image + caption (WhatsApp appears there on phones
 * and on Windows/macOS with the WhatsApp desktop app). Returns false if unsupported.
 */
export async function shareImage(blob: Blob, filename: string, caption: string): Promise<boolean> {
  const file = new File([blob], filename, { type: 'image/png' });
  if (typeof navigator.canShare !== 'function' || !navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], text: caption });
  } catch (err) {
    if ((err as DOMException)?.name !== 'AbortError') throw err; // user closing the sheet is fine
  }
  return true;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Text-only fallback: opens WhatsApp (web/app) with the caption prefilled. */
export function whatsappTextUrl(caption: string): string {
  return `https://wa.me/?text=${encodeURIComponent(caption)}`;
}
