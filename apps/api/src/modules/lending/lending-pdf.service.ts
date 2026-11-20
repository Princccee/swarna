import { Injectable } from '@nestjs/common';
import * as PDFDocument from 'pdfkit';
import { SettingsService } from '../settings/settings.service';
import { shopAddressParts } from '../../common/shop-address';

const GOLD = '#8A6408';
const INK = '#1A1209';
const MUTED = '#6B5F50';
const RULE = '#D8CBA4';

// Built-in PDF fonts have no ₹ glyph, so amounts print as "Rs."
const rs = (n: unknown) => 'Rs. ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const g = (n: unknown) => Number(n).toFixed(3) + ' g';
const day = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' });
const PURITY: Record<string, string> = {
  GOLD_24K: 'Gold 24K', GOLD_22K: 'Gold 22K', GOLD_18K: 'Gold 18K', GOLD_14K: 'Gold 14K',
  SILVER_999: 'Silver 999', SILVER_925: 'Silver 925',
};
const MODE: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', NET_BANKING: 'Bank transfer', CHEQUE: 'Cheque' };

@Injectable()
export class LendingPdfService {
  constructor(private readonly settings: SettingsService) {}

  async loanSlip(loan: any): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A5', margin: 32 });
    const done = this.collect(doc);
    await this.header(doc, 'LOAN SLIP (GIRVI)');

    this.kv(doc, [
      ['Loan No.', loan.loanNumber],
      ['Date', day(loan.loanDate)],
    ]);
    doc.moveDown(0.6);
    this.section(doc, 'Customer');
    this.kv(doc, [
      ['Name', loan.customer.name],
      ['Phone', loan.customer.phone],
      ...(loan.customer.address ? [['Address', loan.customer.address] as [string, string]] : []),
    ]);

    doc.moveDown(0.6);
    this.section(doc, 'Items pledged');
    this.table(doc,
      ['#', 'Description', 'Metal / Purity', 'Gross wt', 'Net wt'],
      [18, 140, 82, 60, 60],
      loan.items.map((it: any, i: number) => [
        String(i + 1), it.description, PURITY[it.purity] ?? it.purity, g(it.grossWeightG), g(it.netWeightG),
      ]),
      [false, false, false, true, true],
    );
    const totalNet = loan.items.reduce((s: number, it: any) => s + Number(it.netWeightG), 0);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(`Total net weight: ${g(totalNet)}`, { align: 'right' });

    doc.moveDown(0.6);
    this.section(doc, 'Loan');
    this.kv(doc, [
      ['Loan amount', rs(loan.principalOriginal)],
      ['Interest', `${Number(loan.monthlyRatePct)}% per month (simple)`],
      ['Paid by', MODE[loan.disbursedMode] ?? loan.disbursedMode],
    ]);
    doc.moveDown(0.4);
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(
      'Interest is charged per month on the outstanding amount; part of a month is charged as a full month. ' +
      'Payments are adjusted first against interest due, then against the loan amount. ' +
      'The item(s) will be returned on full repayment against this slip.',
      { align: 'left' },
    );
    if (loan.notes) {
      doc.moveDown(0.4).font('Helvetica').fontSize(8).fillColor(INK).text(`Notes: ${loan.notes}`);
    }

    this.signatures(doc, ['Customer signature', 'For the shop']);
    doc.end();
    return done;
  }

  async paymentReceipt(loan: any, payment: any): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A5', margin: 32 });
    const done = this.collect(doc);
    await this.header(doc, 'PAYMENT RECEIPT');

    this.kv(doc, [
      ['Loan No.', loan.loanNumber],
      ['Receipt date', day(payment.paidAt)],
      ['Customer', `${loan.customer.name} (${loan.customer.phone})`],
      ['Paid by', MODE[payment.mode] ?? payment.mode],
      ...(payment.reference ? [['Reference', payment.reference] as [string, string]] : []),
    ]);
    doc.moveDown(0.6);
    this.section(doc, 'Payment');
    this.kv(doc, [
      ['Amount received', rs(payment.amount)],
      ['Towards interest', `${rs(payment.interestPart)}  (${payment.monthsCharged} month${payment.monthsCharged === 1 ? '' : 's'})`],
      ['Towards loan amount', rs(payment.principalPart)],
      ['Loan amount before', rs(payment.principalBefore)],
      ['Loan amount remaining', rs(payment.principalAfter)],
    ]);
    doc.moveDown(0.6);
    const closed = Number(payment.principalAfter) <= 0;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(closed ? '#166534' : INK).text(
      closed
        ? 'Loan fully repaid. Pledged item(s) returned to the customer.'
        : `Interest from ${day(payment.paidAt)} runs on ${rs(payment.principalAfter)} at ${Number(loan.monthlyRatePct)}% per month.`,
    );
    if (payment.reversedAt) {
      doc.moveDown(0.4).font('Helvetica-Bold').fontSize(10).fillColor('#B91C1C').text(`REVERSED on ${day(payment.reversedAt)}`);
    }

    this.signatures(doc, closed ? ['Customer (items received)', 'For the shop'] : ['For the shop']);
    doc.end();
    return done;
  }

  // ── Layout helpers ──────────────────────────────────────────────────────────

  private collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
  }

  private async header(doc: PDFKit.PDFDocument, title: string) {
    const [name, phone, street, district, state, pinCode] = await Promise.all([
      this.settings.get('shopName'), this.settings.get('shopPhone'), this.settings.get('shopAddress'),
      this.settings.get('shopDistrict'), this.settings.get('shopState'), this.settings.get('shopPinCode'),
    ]);
    const address = shopAddressParts({ shopAddress: street, shopDistrict: district, shopState: state, shopPinCode: pinCode }).oneLine;
    doc.font('Helvetica-Bold').fontSize(15).fillColor(GOLD).text(name || 'Jewellers', { align: 'center' });
    const sub = [address, phone ? `Ph: ${phone}` : ''].filter(Boolean).join('  |  ');
    if (sub) doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(sub, { align: 'center' });
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(title, { align: 'center', characterSpacing: 1.5 });
    const y = doc.y + 4;
    doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).strokeColor(RULE).lineWidth(1).stroke();
    doc.y = y + 8;
  }

  private section(doc: PDFKit.PDFDocument, label: string) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GOLD).text(label.toUpperCase(), { characterSpacing: 1 });
    doc.moveDown(0.2);
  }

  private kv(doc: PDFKit.PDFDocument, rows: Array<[string, string]>) {
    const x = doc.page.margins.left;
    for (const [k, v] of rows) {
      const y = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(k, x, y, { width: 110 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(v, x + 115, y, { width: doc.page.width - x - 115 - doc.page.margins.right });
      doc.y = Math.max(doc.y, y + 13);
    }
    doc.x = x;
  }

  private table(doc: PDFKit.PDFDocument, head: string[], widths: number[], rows: string[][], right: boolean[]) {
    const x0 = doc.page.margins.left;
    const drawRow = (cells: string[], bold: boolean) => {
      const y = doc.y;
      let x = x0;
      let h = 0;
      cells.forEach((c, i) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(bold ? MUTED : INK);
        const opts = { width: widths[i] - 4, align: right[i] ? ('right' as const) : ('left' as const) };
        h = Math.max(h, doc.heightOfString(c, opts));
        doc.text(c, x, y, opts);
        x += widths[i];
      });
      doc.y = y + h + 4;
      doc.moveTo(x0, doc.y - 2).lineTo(x0 + widths.reduce((a, b) => a + b, 0), doc.y - 2).strokeColor(RULE).lineWidth(0.5).stroke();
    };
    drawRow(head, true);
    rows.forEach((r) => drawRow(r, false));
    doc.x = x0;
  }

  private signatures(doc: PDFKit.PDFDocument, labels: string[]) {
    const x0 = doc.page.margins.left;
    const usable = doc.page.width - x0 - doc.page.margins.right;
    const y = Math.max(doc.y + 40, doc.page.height - doc.page.margins.bottom - 40);
    const w = usable / labels.length;
    labels.forEach((label, i) => {
      const x = x0 + i * w + (labels.length === 1 ? w - 150 : 0);
      doc.moveTo(x, y).lineTo(x + 140, y).strokeColor(INK).lineWidth(0.6).stroke();
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(label, x, y + 4, { width: 140 });
    });
  }
}
