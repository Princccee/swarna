import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';

// ── Palette ────────────────────────────────────────────────────────────────────
const GOLD      = '#B8880F';
const GOLD_DARK = '#8A6408';
const GOLD_FILL = '#FDF6E3';   // table header tint
const GOLD_ALT  = '#FAF4E4';   // alternating row tint
const INK       = '#1A1209';   // near-black warm
const MUTED     = '#7A6E60';   // secondary text
const RULE      = '#DDD0A8';   // border/rule color
const WHITE     = '#FFFFFF';

// ── Helpers ────────────────────────────────────────────────────────────────────
function rupees(n: any): string {
  // Built-in PDF fonts (Helvetica) have no ₹ glyph — it printed as '¹'
  return 'Rs. ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Table cells: amount without the 'Rs.' prefix (column headers already imply rupees). */
function amt(n: any): string {
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function wt(n: any): string {
  return Number(n).toFixed(3) + ' g';
}

function dateStr(d: any): string {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Indian number-to-words (lakh/crore system)
function amountInWords(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return 'Zero Rupees Only';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function words(x: number): string {
    if (x === 0) return '';
    if (x < 20) return ones[x];
    if (x < 100) return tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '');
    return ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' and ' + words(x % 100) : '');
  }

  const crore = Math.floor(n / 10_000_000);
  const lakh  = Math.floor((n % 10_000_000) / 100_000);
  const thou  = Math.floor((n % 100_000) / 1_000);
  const rem   = n % 1_000;

  let out = '';
  if (crore) out += words(crore) + ' Crore ';
  if (lakh)  out += words(lakh)  + ' Lakh ';
  if (thou)  out += words(thou)  + ' Thousand ';
  if (rem)   out += words(rem);
  return out.trim() + ' Rupees Only';
}

// ── Service ────────────────────────────────────────────────────────────────────
/** Item table columns (A4 content width 505 pt). No HSN column. */
export const ITEM_COLUMNS = [
  { label: '#',            w: 20,  align: 'center' as const },
  { label: 'DESCRIPTION',  w: 180, align: 'left'   as const },
  { label: 'PURITY',       w: 56,  align: 'center' as const }, // fits "GOLD 22K" on one line
  { label: 'WT (g)',       w: 50,  align: 'right'  as const },
  { label: 'QTY',          w: 24,  align: 'center' as const },
  { label: 'RATE/g (Rs.)', w: 58,  align: 'right'  as const },
  { label: 'MAKING (Rs.)', w: 52,  align: 'right'  as const },
  { label: 'AMOUNT (Rs.)', w: 65,  align: 'right'  as const },
];

/** Purity is printed for gold items only (e.g. "GOLD 22K"); blank for silver and others. */
export function pdfPurityLabel(purity: string | null | undefined): string {
  return purity && purity.startsWith('GOLD') ? purity.replace(/_/g, ' ') : '';
}

/**
 * Payment status shown on the bill. GST and non-GST bills alike: PAID or BALANCE DUE.
 * Estimates made before non-GST bills took payments (nothing paid, nothing owed) are QUOTATION.
 */
export function billStatus(inv: { billType?: string; balanceDue?: any; amountPaid?: any }): 'PAID' | 'BALANCE DUE' | 'QUOTATION' {
  const due = Number(inv.balanceDue ?? 0);
  if (inv.billType === 'ESTIMATE' && due <= 0 && Number(inv.amountPaid ?? 0) <= 0) return 'QUOTATION';
  return due <= 0 ? 'PAID' : 'BALANCE DUE';
}

@Injectable()
export class PdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generateInvoicePdf(invoice: any): Promise<Buffer> {
    // Fetch shop settings from DB
    const rows = await this.prisma.setting.findMany();
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;
    const shop = {
      name:    settings.shopName    ?? 'Svarna Jewels',
      address: settings.shopAddress ?? '',
      phone:   settings.shopPhone   ?? '',
      gstin:   settings.gstin       ?? '22AAAAA0000A1Z5',
      state:   settings.stateName   ?? 'Maharashtra',
    };

    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 0,
          info: { Title: `Invoice ${invoice.invoiceNumber}`, Author: shop.name },
        });
        const chunks: Buffer[] = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        this.render(doc, invoice, shop);
        doc.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  private render(doc: PDFKit.PDFDocument, inv: any, shop: Record<string, string>) {
    const isEstimate = inv.billType === 'ESTIMATE';
    const ML = 45;   // margin left
    const MR = 45;   // margin right
    const MT = 40;   // margin top
    const W  = 595 - ML - MR;   // 505
    const PH = 842;  // page height

    // ── Top gold rule ──────────────────────────────────────────────────────────
    doc.rect(ML, MT, W, 4).fill(GOLD);
    doc.rect(ML, MT + 6, W, 0.5).fill(RULE);

    // ── Shop header ───────────────────────────────────────────────────────────
    let y = MT + 18;

    // ◆ glyph
    // Diamond mark drawn as a shape (the ◆ character isn't in the built-in font)
    doc.save().translate(ML + 8, y + 9).rotate(45).rect(-5.5, -5.5, 11, 11).fill(GOLD).restore();

    // Shop name
    doc.fontSize(15).fillColor(INK).font('Helvetica-Bold')
       .text(shop.name.toUpperCase(), ML + 24, y + 2, { width: 260, lineBreak: false });

    // Tagline / address
    y += 22;
    if (shop.address) {
      doc.fontSize(8).fillColor(MUTED).font('Helvetica')
         .text(shop.address, ML, y, { width: 260, lineBreak: false });
      y += 11;
    }
    const contactLine = [shop.phone ? `Tel: ${shop.phone}` : '', isEstimate ? '' : `GSTIN: ${shop.gstin}`]
      .filter(Boolean).join('   ');
    doc.fontSize(7.5).fillColor(MUTED).font('Helvetica')
       .text(contactLine, ML, y, { width: 260, lineBreak: false });

    // ── "TAX INVOICE" block — top right ───────────────────────────────────────
    const invBlockX = ML + W - 170;
    const invY0 = MT + 18;

    doc.fontSize(13).fillColor(GOLD_DARK).font('Helvetica-Bold')
       .text(isEstimate ? 'ESTIMATE' : 'TAX INVOICE', invBlockX, invY0, { width: 170, align: 'right' });
    doc.fontSize(7).fillColor(isEstimate ? '#B91C1C' : MUTED).font('Helvetica-Bold')
       .text(isEstimate ? 'Not a tax invoice. No GST charged.' : 'GST Invoice u/s 31 of CGST Act, 2017',
         invBlockX, invY0 + 17, { width: 170, align: 'right' });

    // Invoice number + date grid
    const metaY = invY0 + 30;
    doc.fontSize(7.5).fillColor(MUTED).font('Helvetica')
       .text(isEstimate ? 'Estimate No.' : 'Invoice No.', invBlockX, metaY, { width: 80 });
    doc.fontSize(7.5).fillColor(MUTED).font('Helvetica')
       .text('Date', invBlockX + 88, metaY, { width: 82, align: 'right' });

    doc.fontSize(9).fillColor(INK).font('Helvetica-Bold')
       .text(inv.invoiceNumber ?? '—', invBlockX, metaY + 10, { width: 80 });
    doc.fontSize(9).fillColor(INK).font('Helvetica-Bold')
       .text(dateStr(inv.invoicedAt ?? inv.createdAt), invBlockX + 88, metaY + 10, { width: 82, align: 'right' });

    // Status badge
    const status = billStatus(inv);
    const isQuotation = status === 'QUOTATION';
    const isPaid = status === 'PAID';
    const badgeColor = isQuotation ? '#475569' : isPaid ? '#059669' : '#D97706';
    const badgeLabel = status;
    const badgeY = metaY + 26;
    doc.roundedRect(invBlockX + 88, badgeY, 82, 14, 3).fill(isQuotation ? '#E2E8F0' : isPaid ? '#D1FAE5' : '#FEF3C7');
    doc.fontSize(7).fillColor(badgeColor).font('Helvetica-Bold')
       .text(badgeLabel, invBlockX + 88, badgeY + 3, { width: 82, align: 'center' });

    // ── Divider ───────────────────────────────────────────────────────────────
    y = MT + 84;
    doc.rect(ML, y, W, 0.75).fill(RULE);

    // ── Party information ─────────────────────────────────────────────────────
    y += 10;
    const colW = (W - 14) / 2;

    this.partyBox(doc, ML, y, colW, 80, 'BILLED BY', [
      { bold: shop.name, normal: '' },
      { bold: '', normal: shop.address },
      { bold: '', normal: shop.phone ? `Phone: ${shop.phone}` : '' },
      { bold: '', normal: isEstimate ? '' : `GSTIN: ${shop.gstin}` },
      { bold: '', normal: `State: ${shop.state}` },
    ]);

    const cx = ML + colW + 14;
    const cust = inv.customer;
    this.partyBox(doc, cx, y, colW, 80, 'BILLED TO', [
      { bold: cust?.name ?? 'Walk-in Customer', normal: '' },
      { bold: '', normal: cust?.address ? cust.address : '' },
      { bold: '', normal: cust?.phone ? `Phone: ${cust.phone}` : '' },
      { bold: '', normal: cust?.panNumber ? `PAN: ${cust.panNumber}` : '' },
      { bold: '', normal: cust?.kycVerified ? 'KYC Verified' : '', color: '#059669' },
    ]);

    y += 90;

    // ── Items table ───────────────────────────────────────────────────────────
    const COLS = ITEM_COLUMNS;

    const HEADER_H = 20;
    const ROW_H    = 22;

    // Table header
    doc.rect(ML, y, W, HEADER_H).fill(GOLD_FILL);
    doc.rect(ML, y, W, HEADER_H).strokeColor(RULE).lineWidth(0.5).stroke();
    let cx2 = ML;
    for (const col of COLS) {
      doc.fontSize(6.5).fillColor(GOLD_DARK).font('Helvetica-Bold')
         .text(col.label, cx2 + 4, y + 7, { width: col.w - 8, align: col.align, lineBreak: false });
      cx2 += col.w;
    }
    y += HEADER_H;

    // Data rows
    const lines: any[] = inv.lines ?? [];
    lines.forEach((line, i) => {
      const rowFill = i % 2 === 0 ? WHITE : GOLD_ALT;
      doc.rect(ML, y, W, ROW_H).fill(rowFill);
      doc.rect(ML, y + ROW_H - 0.5, W, 0.5).fill(RULE);

      const purityStr = pdfPurityLabel(line.purity ?? line.item?.purity);

      cx2 = ML;
      // #
      doc.fillColor(MUTED).fontSize(8).font('Helvetica')
         .text(String(i + 1), cx2 + 4, y + 7, { width: COLS[0].w - 8, align: 'center', lineBreak: false });
      cx2 += COLS[0].w;

      // Description — name on top, SKU+HUID below in smaller muted text
      const itemName = line.item?.name ?? line.description ?? '—';
      const subLine  = [line.item?.sku, line.item?.huid ? `HUID: ${line.item.huid}` : ''].filter(Boolean).join('  ');
      doc.fillColor(INK).fontSize(8).font('Helvetica-Bold')
         .text(itemName, cx2 + 4, y + 4, { width: COLS[1].w - 8, lineBreak: false });
      if (subLine) {
        doc.fillColor(MUTED).fontSize(6.5).font('Helvetica')
           .text(subLine, cx2 + 4, y + 13, { width: COLS[1].w - 8, lineBreak: false });
      }
      cx2 += COLS[1].w;

      // Purity (gold items only)
      doc.fillColor(INK).fontSize(8).font('Helvetica')
         .text(purityStr, cx2 + 4, y + 7, { width: COLS[2].w - 8, align: 'center', lineBreak: false });
      cx2 += COLS[2].w;

      // Net Wt
      doc.fillColor(INK).fontSize(8).font('Helvetica')
         .text(wt(line.netWeightG), cx2 + 4, y + 7, { width: COLS[3].w - 8, align: 'right', lineBreak: false });
      cx2 += COLS[3].w;

      // Qty
      doc.fillColor(INK).fontSize(8).font('Helvetica-Bold')
         .text(String(line.qty ?? 1), cx2 + 4, y + 7, { width: COLS[4].w - 8, align: 'center', lineBreak: false });
      cx2 += COLS[4].w;

      // Rate/g
      doc.fillColor(INK).fontSize(8).font('Helvetica')
         .text(amt(line.ratePerGram ?? 0), cx2 + 4, y + 7, { width: COLS[5].w - 8, align: 'right', lineBreak: false });
      cx2 += COLS[5].w;

      // Making
      doc.fillColor(INK).fontSize(8).font('Helvetica')
         .text(amt(line.makingCharge ?? 0), cx2 + 4, y + 7, { width: COLS[6].w - 8, align: 'right', lineBreak: false });
      cx2 += COLS[6].w;

      // Amount
      doc.fillColor(GOLD_DARK).fontSize(8).font('Helvetica-Bold')
         .text(amt(line.lineTotal ?? 0), cx2 + 4, y + 7, { width: COLS[7].w - 8, align: 'right', lineBreak: false });

      y += ROW_H;
    });

    // Table bottom rule
    doc.rect(ML, y, W, 1).fill(GOLD);
    y += 12;

    // ── Totals block (right-aligned) ──────────────────────────────────────────
    const TW = 220;
    const TX = ML + W - TW;
    const totalRows: { label: string; value: string; bold?: boolean; deduct?: boolean; accent?: boolean }[] = [];

    totalRows.push({ label: 'Subtotal (Metal Value)', value: rupees(inv.subtotal) });
    if (Number(inv.makingTotal) > 0)
      totalRows.push({ label: 'Making Charges', value: rupees(inv.makingTotal) });
    if (Number(inv.stoneTotal) > 0)
      totalRows.push({ label: 'Stone Value', value: rupees(inv.stoneTotal) });
    if (Number(inv.oldGoldDeduction) > 0)
      totalRows.push({ label: 'Old Gold/Silver Exchange', value: rupees(inv.oldGoldDeduction), deduct: true });
    if (!isEstimate) totalRows.push({ label: 'Taxable Amount', value: rupees(inv.taxableAmount) });
    if (Number(inv.cgst) > 0) {
      totalRows.push({ label: 'CGST @ 1.5%', value: rupees(inv.cgst) });
      totalRows.push({ label: 'SGST @ 1.5%', value: rupees(inv.sgst) });
    }
    if (Number(inv.igst) > 0)
      totalRows.push({ label: 'IGST @ 3%', value: rupees(inv.igst) });

    // Sub-rows
    for (const row of totalRows) {
      doc.fontSize(8).fillColor(row.deduct ? '#059669' : MUTED).font('Helvetica')
         .text(row.label, TX, y, { width: TW - 70, lineBreak: false });
      doc.fontSize(8).fillColor(row.deduct ? '#059669' : INK).font('Helvetica')
         .text((row.deduct ? '− ' : '') + row.value, TX, y, { width: TW, align: 'right', lineBreak: false });
      y += 14;
    }

    // Grand total box
    y += 4;
    doc.rect(TX, y, TW, 26).fill(GOLD_FILL);
    doc.rect(TX, y, TW, 26).strokeColor(GOLD).lineWidth(1).stroke();
    doc.fontSize(9).fillColor(GOLD_DARK).font('Helvetica-Bold')
       .text('GRAND TOTAL', TX + 8, y + 8, { width: TW - 16, lineBreak: false });
    doc.fontSize(11).fillColor(INK).font('Helvetica-Bold')
       .text(rupees(inv.totalAmount), TX + 8, y + 7, { width: TW - 16, align: 'right', lineBreak: false });
    y += 32;

    // Payment status — same for GST and non-GST bills
    if (isQuotation) {
      doc.fontSize(8).fillColor(MUTED).font('Helvetica-Bold')
         .text('Quotation only. No payment taken.', TX, y, { width: TW, align: 'right' });
    } else if (isPaid) {
      doc.fontSize(8).fillColor('#059669').font('Helvetica-Bold')
         .text('Payment Received in Full', TX, y, { width: TW, align: 'right' });
    } else {
      doc.fontSize(8).fillColor('#DC2626').font('Helvetica-Bold')
         .text('Balance Due: ' + rupees(inv.balanceDue), TX, y, { width: TW, align: 'right' });
    }
    y += 14;

    // Payment mode
    const pmts: any[] = inv.payments ?? [];
    if (pmts.length > 0) {
      const modeStr = pmts.map((p: any) => `${p.mode.replace(/_/g, ' ')} ${rupees(p.amount)}`).join(' + ');
      doc.fontSize(7.5).fillColor(MUTED).font('Helvetica')
         .text('Mode: ' + modeStr, TX, y, { width: TW, align: 'right' });
      y += 12;
    }

    // ── Amount in words ───────────────────────────────────────────────────────
    const wordsY = y + 4;
    doc.rect(ML, wordsY, W - TW - 14, 26).fill(GOLD_FILL);
    doc.fontSize(7).fillColor(MUTED).font('Helvetica-Bold')
       .text('AMOUNT IN WORDS', ML + 8, wordsY + 5);
    doc.fontSize(8).fillColor(INK).font('Helvetica')
       .text(amountInWords(Number(inv.totalAmount)), ML + 8, wordsY + 14, { width: W - TW - 30, lineBreak: false });

    y = Math.max(y, wordsY + 32);

    // ── IRN ───────────────────────────────────────────────────────────────────
    if (inv.irn) {
      y += 4;
      doc.rect(ML, y, W, 0.5).fill(RULE);
      y += 6;
      doc.fontSize(7).fillColor(MUTED).font('Helvetica')
         .text('IRN: ' + inv.irn, ML, y, { width: W });
      y += 12;
    }

    // ── Declaration + Signature ───────────────────────────────────────────────
    const bottomY = PH - 80;
    const declY   = Math.max(y + 16, bottomY - 50);

    doc.rect(ML, declY, W, 0.5).fill(RULE);

    const declW = W * 0.55;
    const sigW  = W * 0.38;
    const sigX  = ML + W - sigW;

    doc.fontSize(7).fillColor(MUTED).font('Helvetica-Bold')
       .text('DECLARATION', ML, declY + 8);
    doc.fontSize(7).fillColor(MUTED).font('Helvetica')
       .text(
         isQuotation
           ? 'This is an estimate (quotation) only and not a tax invoice. Prices are based on the rates on the date shown and may change.'
           : isEstimate
           ? 'This is a non-GST estimate bill, not a tax invoice. No GST has been charged on it.'
           : 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. This is a system-generated invoice and is valid without a physical signature.',
         ML, declY + 18,
         { width: declW, lineBreak: true }
       );

    // Signature box
    doc.rect(sigX, declY + 8, sigW, 42).strokeColor(RULE).lineWidth(0.5).stroke();
    doc.fontSize(7).fillColor(MUTED).font('Helvetica-Bold')
       .text('For ' + shop.name, sigX + 8, declY + 12, { width: sigW - 16 });
    doc.fontSize(7).fillColor(MUTED).font('Helvetica')
       .text('Authorised Signatory', sigX + 8, declY + 42, { width: sigW - 16, align: 'right' });

    // ── Footer ────────────────────────────────────────────────────────────────
    const footerY = PH - 30;
    doc.rect(ML, footerY - 6, W, 0.5).fill(GOLD);
    doc.fontSize(7).fillColor(MUTED).font('Helvetica')
       .text(isEstimate ? 'This is a computer-generated estimate, not a tax invoice.' : 'This is a computer-generated invoice. No signature is required.', ML, footerY, { width: W, align: 'center' });
    doc.fontSize(7).fillColor(GOLD_DARK).font('Helvetica-Bold')
       .text(shop.name + (shop.address ? ' — ' + shop.address : ''), ML, footerY + 10, { width: W, align: 'center' });
  }

  /** Render a party info box (Billed By / Billed To) */
  private partyBox(
    doc: PDFKit.PDFDocument,
    x: number, y: number, w: number, h: number,
    heading: string,
    rows: { bold: string; normal: string; color?: string }[],
  ) {
    doc.rect(x, y, w, h).strokeColor(RULE).lineWidth(0.5).stroke();
    // heading strip
    doc.rect(x, y, w, 16).fill(GOLD_FILL);
    doc.fontSize(7).fillColor(GOLD_DARK).font('Helvetica-Bold')
       .text(heading, x + 8, y + 5, { width: w - 16, lineBreak: false });

    let ry = y + 22;
    for (const row of rows) {
      if (!row.bold && !row.normal) continue;
      if (row.bold) {
        doc.fontSize(9).fillColor(INK).font('Helvetica-Bold')
           .text(row.bold, x + 8, ry, { width: w - 16, lineBreak: false });
        ry += 12;
      }
      if (row.normal) {
        doc.fontSize(7.5).fillColor(row.color ?? MUTED).font('Helvetica')
           .text(row.normal, x + 8, ry, { width: w - 16, lineBreak: false });
        ry += 10;
      }
    }
  }
}
