import { Injectable, Logger } from '@nestjs/common';
// pdfkit is CommonJS — use import * to avoid esModuleInterop requirement
import * as PDFDocument from 'pdfkit';

const AMBER  = '#92400e';
const GOLD   = '#d97706';
const LIGHT  = '#fef3c7';
const GREY   = '#6b7280';
const BLACK  = '#111827';
const BORDER = '#e5e7eb';

function fmt(n: any) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtWt(n: any) {
  return Number(n).toFixed(3) + ' g';
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  async generateInvoicePdf(invoice: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: `Invoice ${invoice.invoiceNumber}` } });
        const chunks: Buffer[] = [];
        doc.on('data', (c) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        this.render(doc, invoice);
        doc.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  private render(doc: PDFKit.PDFDocument, inv: any) {
    const W = doc.page.width - 80; // usable width

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.rect(40, 40, W, 70).fill(AMBER);
    doc.fillColor('#fff').fontSize(20).font('Helvetica-Bold')
       .text('TAX INVOICE', 56, 54, { width: W - 120 });
    doc.fontSize(9).font('Helvetica')
       .text('GST Invoice under Section 31 of CGST Act', 56, 78, { width: W - 120 });

    // Invoice meta (top-right inside header)
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fef3c7')
       .text('Invoice #', W - 70, 54, { align: 'right', width: 110 });
    doc.font('Helvetica').fillColor('#fff')
       .text(inv.invoiceNumber, W - 70, 66, { align: 'right', width: 110 });
    const dateStr = new Date(inv.invoicedAt ?? inv.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    doc.font('Helvetica-Bold').fillColor('#fef3c7')
       .text('Date', W - 70, 82, { align: 'right', width: 110 });
    doc.font('Helvetica').fillColor('#fff')
       .text(dateStr, W - 70, 94, { align: 'right', width: 110 });

    let y = 126;

    // ── Shop & Customer info ─────────────────────────────────────────────────
    const colW = (W - 12) / 2;

    // Shop info box
    doc.rect(40, y, colW, 90).strokeColor(BORDER).lineWidth(1).stroke();
    doc.fillColor(LIGHT).rect(40, y, colW, 22).fill();
    doc.fillColor(AMBER).fontSize(8).font('Helvetica-Bold')
       .text('SELLER', 48, y + 7);
    doc.fillColor(BLACK).fontSize(9).font('Helvetica-Bold')
       .text(inv.shop?.name ?? 'Svarna Jewels', 48, y + 28);
    doc.fontSize(8).font('Helvetica').fillColor(GREY)
       .text(inv.shop?.address ?? '42, Zaveri Bazaar, Mumbai - 400002', 48, y + 42, { width: colW - 16 })
       .text('GSTIN: ' + (inv.shop?.gstin ?? '27AABCS1681F1ZQ'), 48, y + 68);

    // Customer info box
    const cx = 40 + colW + 12;
    doc.rect(cx, y, colW, 90).strokeColor(BORDER).lineWidth(1).stroke();
    doc.fillColor(LIGHT).rect(cx, y, colW, 22).fill();
    doc.fillColor(AMBER).fontSize(8).font('Helvetica-Bold')
       .text('BILL TO', cx + 8, y + 7);
    doc.fillColor(BLACK).fontSize(9).font('Helvetica-Bold')
       .text(inv.customer?.name ?? 'Walk-in Customer', cx + 8, y + 28);
    doc.fontSize(8).font('Helvetica').fillColor(GREY)
       .text('Phone: ' + (inv.customer?.phone ?? '—'), cx + 8, y + 42)
       .text('PAN: ' + (inv.customer?.panNumber ?? '—'), cx + 8, y + 54);
    if (inv.customer?.kycVerified) {
      doc.fillColor('#059669').text('✓ KYC Verified', cx + 8, y + 68);
    }

    y += 106;

    // ── Line items table ─────────────────────────────────────────────────────
    const cols = [
      { label: '#',         w: 24,  align: 'center' as const },
      { label: 'Item',      w: 170, align: 'left'   as const },
      { label: 'Purity',    w: 52,  align: 'center' as const },
      { label: 'Net Wt',   w: 56,  align: 'right'  as const },
      { label: 'Rate/g',   w: 70,  align: 'right'  as const },
      { label: 'Making',   w: 60,  align: 'right'  as const },
      { label: 'Amount',   w: 72,  align: 'right'  as const },
    ];
    const ROW_H = 22;

    // Header row
    doc.fillColor(AMBER).rect(40, y, W, ROW_H).fill();
    let cx2 = 40;
    for (const col of cols) {
      doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold')
         .text(col.label, cx2 + 4, y + 7, { width: col.w - 8, align: col.align });
      cx2 += col.w;
    }
    y += ROW_H;

    // Data rows
    const lines: any[] = inv.lines ?? [];
    lines.forEach((line, i) => {
      const rowFill = i % 2 === 0 ? '#fff' : '#fffbeb';
      doc.fillColor(rowFill).rect(40, y, W, ROW_H).fill();
      doc.strokeColor(BORDER).lineWidth(0.5)
         .moveTo(40, y + ROW_H).lineTo(40 + W, y + ROW_H).stroke();

      cx2 = 40;
      const cells = [
        { v: String(i + 1),                   col: cols[0] },
        { v: line.item?.name ?? '—',           col: cols[1] },
        { v: (line.item?.purity ?? '').replace('_', ' '), col: cols[2] },
        { v: fmtWt(line.netWeightG),           col: cols[3] },
        { v: '₹' + Number(line.ratePerGram).toFixed(2), col: cols[4] },
        { v: fmt(line.makingCharge),           col: cols[5] },
        { v: fmt(line.lineTotal),              col: cols[6] },
      ];
      for (const cell of cells) {
        doc.fillColor(BLACK).fontSize(8).font('Helvetica')
           .text(cell.v, cx2 + 4, y + 7, { width: cell.col.w - 8, align: cell.col.align, lineBreak: false });
        cx2 += cell.col.w;
      }
      y += ROW_H;
    });

    y += 12;

    // ── Totals ───────────────────────────────────────────────────────────────
    const totalsX = 40 + W - 210;
    const totalsW = 210;

    const addTotalRow = (label: string, value: string, bold = false, deduct = false, accent = false) => {
      if (bold) {
        doc.fillColor(accent ? LIGHT : '#f9fafb').rect(totalsX, y, totalsW, 22).fill();
        doc.strokeColor(BORDER).rect(totalsX, y, totalsW, 22).stroke();
      }
      doc.fillColor(bold ? AMBER : GREY).fontSize(bold ? 9 : 8)
         .font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .text(label, totalsX + 8, y + (bold ? 7 : 3), { width: 120 });
      doc.fillColor(deduct ? '#059669' : bold ? BLACK : BLACK)
         .font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .text((deduct ? '− ' : '') + value, totalsX + 8, y + (bold ? 7 : 3), { width: totalsW - 16, align: 'right' });
      y += bold ? 22 : 18;
    };

    addTotalRow('Subtotal', fmt(inv.subtotal));
    if (Number(inv.makingTotal) > 0) addTotalRow('Making charges', fmt(inv.makingTotal));
    if (Number(inv.stoneTotal) > 0)  addTotalRow('Stone value', fmt(inv.stoneTotal));
    if (Number(inv.oldGoldDeduction) > 0) addTotalRow('Old gold deduction', fmt(inv.oldGoldDeduction), false, true);
    addTotalRow('Taxable amount', fmt(inv.taxableAmount));
    if (Number(inv.cgst) > 0) {
      addTotalRow('CGST (1.5%)', fmt(inv.cgst));
      addTotalRow('SGST (1.5%)', fmt(inv.sgst));
    }
    if (Number(inv.igst) > 0) addTotalRow('IGST (3%)', fmt(inv.igst));
    y += 4;
    addTotalRow('GRAND TOTAL', fmt(inv.totalAmount), true, false, true);

    // Payment status
    y += 8;
    if (Number(inv.balanceDue) <= 0) {
      doc.fillColor('#059669').fontSize(9).font('Helvetica-Bold')
         .text('✓ PAID', totalsX + 8, y);
    } else {
      doc.fillColor('#dc2626').fontSize(9).font('Helvetica-Bold')
         .text('Balance due: ' + fmt(inv.balanceDue), totalsX + 8, y);
    }

    // ── Payment mode ─────────────────────────────────────────────────────────
    const pmts: any[] = inv.payments ?? [];
    if (pmts.length > 0) {
      y += 18;
      doc.fillColor(GREY).fontSize(8).font('Helvetica')
         .text('Payment: ' + pmts.map((p: any) => p.mode + ' ' + fmt(p.amount)).join(', '), totalsX + 8, y);
    }

    // ── IRN ─────────────────────────────────────────────────────────────────
    if (inv.irn) {
      y += 30;
      doc.strokeColor(BORDER).lineWidth(0.5).moveTo(40, y).lineTo(40 + W, y).stroke();
      y += 8;
      doc.fillColor(GREY).fontSize(7).font('Helvetica')
         .text('IRN: ' + inv.irn, 40, y, { width: W });
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    const pageH = doc.page.height;
    doc.fillColor(AMBER).rect(40, pageH - 50, W, 1).fill();
    doc.fillColor(GREY).fontSize(7).font('Helvetica')
       .text('This is a computer-generated invoice. No signature required.', 40, pageH - 38, { width: W, align: 'center' });
    doc.fillColor(GOLD).fontSize(7)
       .text('Svarna Jewels — ' + (inv.shop?.address ?? '42, Zaveri Bazaar, Mumbai'), 40, pageH - 26, { width: W, align: 'center' });
  }
}
