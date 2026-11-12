import { toast } from 'sonner';
import { api } from './api';
import { downloadBlob, shareFile } from './share-file';

async function fetchInvoicePdf(invoiceId: string): Promise<Blob> {
  const res = await api.get(`/billing/invoices/${invoiceId}/pdf`, { responseType: 'blob' });
  return new Blob([res.data], { type: 'application/pdf' });
}

const pdfName = (invoiceId: string, invoiceNumber?: string) =>
  `invoice-${invoiceNumber ?? invoiceId}.pdf`;

export async function downloadInvoicePdf(invoiceId: string, invoiceNumber?: string) {
  await downloadBlob(await fetchInvoicePdf(invoiceId), pdfName(invoiceId, invoiceNumber));
}

export interface ShareInvoiceOptions {
  invoiceNumber?: string;
  /** ESTIMATE bills are worded as an estimate in the caption */
  billType?: string;
  amount?: number | string;
  /** Customer's phone — copied to the clipboard so it can be pasted into WhatsApp's search */
  customerPhone?: string;
}

/** Fetch the invoice PDF and open the share sheet (WhatsApp, etc.) with it attached. */
export async function shareInvoicePdf(invoiceId: string, opts: ShareInvoiceOptions = {}) {
  // Copy first, while we still hold the user's tap (clipboard needs it)
  if (opts.customerPhone && navigator.clipboard) {
    navigator.clipboard
      .writeText(opts.customerPhone)
      .then(() => toast.info(`Customer number ${opts.customerPhone} copied — paste it in WhatsApp search`))
      .catch(() => undefined);
  }

  const label = opts.billType === 'ESTIMATE' ? 'Estimate' : 'Invoice';
  const ref = opts.invoiceNumber ? ` ${opts.invoiceNumber}` : '';
  const amount =
    opts.amount != null
      ? ` for ₹${Number(opts.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '';
  const text = `${label}${ref}${amount}. Thank you for shopping with us!`;

  try {
    const blob = await fetchInvoicePdf(invoiceId);
    await shareFile(blob, pdfName(invoiceId, opts.invoiceNumber), { text, title: `${label}${ref}` });
  } catch {
    toast.error('Could not share the PDF. Please try again.');
  }
}
