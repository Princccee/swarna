import { api } from './api';

export async function downloadInvoicePdf(invoiceId: string, invoiceNumber?: string) {
  const res = await api.get(`/billing/invoices/${invoiceId}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `invoice-${invoiceNumber ?? invoiceId}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
