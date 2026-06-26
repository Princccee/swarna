import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  async generateInvoicePdf(invoice: any): Promise<Buffer> {
    const html = this.buildHtml(invoice);
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore -- puppeteer is optional; fallback to HTML buffer if unavailable
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      await browser.close();
      return Buffer.from(pdf);
    } catch (e) {
      this.logger.warn('Puppeteer not available, returning HTML buffer');
      return Buffer.from(html);
    }
  }

  private buildHtml(invoice: any): string {
    const lines = (invoice.lines ?? []).map((l: any) =>
      '<tr><td>' + (l.item?.name ?? '') + '</td><td>' + l.qty + '</td><td>' + Number(l.netWeightG).toFixed(3) + ' g</td><td>₹' + Number(l.ratePerGram).toFixed(2) + '</td><td>₹' + Number(l.lineTotal).toFixed(2) + '</td></tr>'
    ).join('');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:32px;font-size:13px}h1{color:#92400e}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#fef3c7}.totals{text-align:right;margin-top:16px}.irn{font-size:10px;color:#666;margin-top:24px;word-break:break-all}</style></head><body>' +
      '<h1>Tax Invoice</h1>' +
      '<p><strong>Invoice #:</strong> ' + invoice.invoiceNumber + '</p>' +
      '<p><strong>Date:</strong> ' + new Date(invoice.invoicedAt ?? invoice.createdAt).toLocaleDateString('en-IN') + '</p>' +
      '<p><strong>Customer:</strong> ' + (invoice.customer?.name ?? '') + ' | ' + (invoice.customer?.phone ?? '') + '</p>' +
      '<table><thead><tr><th>Item</th><th>Qty</th><th>Net Wt</th><th>Rate/g</th><th>Total</th></tr></thead><tbody>' + lines + '</tbody></table>' +
      '<div class="totals">' +
      '<p>Subtotal: ₹' + Number(invoice.subtotal).toFixed(2) + '</p>' +
      (Number(invoice.oldGoldDeduction) > 0 ? '<p>Old Gold Deduction: -₹' + Number(invoice.oldGoldDeduction).toFixed(2) + '</p>' : '') +
      '<p>Taxable Amount: ₹' + Number(invoice.taxableAmount).toFixed(2) + '</p>' +
      (Number(invoice.cgst) > 0 ? '<p>CGST (1.5%): ₹' + Number(invoice.cgst).toFixed(2) + '</p><p>SGST (1.5%): ₹' + Number(invoice.sgst).toFixed(2) + '</p>' : '') +
      (Number(invoice.igst) > 0 ? '<p>IGST (3%): ₹' + Number(invoice.igst).toFixed(2) + '</p>' : '') +
      '<p><strong>Total: ₹' + Number(invoice.totalAmount).toFixed(2) + '</strong></p>' +
      '</div>' +
      (invoice.irn ? '<div class="irn"><strong>IRN:</strong> ' + invoice.irn + '</div>' : '') +
      '</body></html>';
  }
}
