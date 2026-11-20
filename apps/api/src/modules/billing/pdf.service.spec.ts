import { billStatus, ITEM_COLUMNS, pdfPurityLabel } from './pdf.service';

describe('bill PDF rules', () => {
  it('has no HSN column, and the columns fill the page width', () => {
    expect(ITEM_COLUMNS.map((c) => c.label)).not.toContain('HSN');
    expect(ITEM_COLUMNS.reduce((sum, c) => sum + c.w, 0)).toBe(505);
  });

  it.each([
    ['GOLD_24K', 'GOLD 24K'],
    ['GOLD_22K', 'GOLD 22K'],
    ['GOLD_18K', 'GOLD 18K'],
    ['SILVER_999', ''],
    ['SILVER_925', ''],
    ['PLATINUM_950', ''],
    [null, ''],
  ])('purity %s is printed as "%s" (gold items only)', (purity, label) => {
    expect(pdfPurityLabel(purity as any)).toBe(label);
  });

  it.each([
    [{ billType: 'TAX_INVOICE', balanceDue: 0, amountPaid: 1000 }, 'PAID'],
    [{ billType: 'TAX_INVOICE', balanceDue: 500, amountPaid: 500 }, 'BALANCE DUE'],
    [{ billType: 'ESTIMATE', balanceDue: 0, amountPaid: 1000 }, 'PAID'],
    [{ billType: 'ESTIMATE', balanceDue: 500, amountPaid: 500 }, 'BALANCE DUE'],
    [{ billType: 'ESTIMATE', balanceDue: 500, amountPaid: 0 }, 'BALANCE DUE'],
    // Estimates made before non-GST bills took payments: nothing paid, nothing owed
    [{ billType: 'ESTIMATE', balanceDue: 0, amountPaid: 0 }, 'QUOTATION'],
  ])('status of %o is %s', (inv, status) => {
    expect(billStatus(inv)).toBe(status);
  });
});
