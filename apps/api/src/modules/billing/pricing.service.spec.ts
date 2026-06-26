import { PricingService, PriceLineInput } from './pricing.service';
import { Prisma } from '@prisma/client';

const D = (v: string | number) => new Prisma.Decimal(v);
const ZERO = D(0);

function makeLine(overrides: Partial<PriceLineInput> & { itemId?: string } = {}): PriceLineInput {
  return {
    itemId: 'item-1',
    qty: 1,
    netWeightG: D('10'),
    ratePerGram: D('6000'),
    makingPct: D('12'),
    makingPerGram: D('0'),
    stoneValue: D('0'),
    ...overrides,
  };
}

describe('PricingService.computeInvoice()', () => {
  let service: PricingService;

  beforeEach(() => {
    service = new PricingService();
  });

  // ---------------------------------------------------------------------------
  // 1. Basic gold 22K item — metalValue, makingCharge (via makingPct), lineTotal
  // ---------------------------------------------------------------------------
  it('1: computes metalValue, makingCharge via makingPct, and lineTotal for a single gold item', () => {
    // netWeightG=10, ratePerGram=6000, qty=1 → metalValue = 60000
    // makingPct=12 → makingCharge = 60000 * 12 / 100 = 7200
    // stoneValue=0, wastage=0 → lineTotal = 67200
    const line = makeLine({
      netWeightG: D('10'),
      ratePerGram: D('6000'),
      makingPct: D('12'),
      makingPerGram: D('0'),
      stoneValue: D('0'),
    });

    const result = service.computeInvoice([line], ZERO, ZERO, false);

    expect(result.lines[0].metalValue.toFixed(2)).toBe('60000.00');
    expect(result.lines[0].makingCharge.toFixed(2)).toBe('7200.00');
    expect(result.lines[0].lineTotal.toFixed(2)).toBe('67200.00');
  });

  // ---------------------------------------------------------------------------
  // 2. Making via makingPerGram (makingPct = 0)
  // ---------------------------------------------------------------------------
  it('2: computes makingCharge via makingPerGram when makingPct is 0', () => {
    // netWeightG=8, ratePerGram=5500, qty=2 → metalValue = 8*5500*2 = 88000
    // makingPct=0, makingPerGram=300 → makingCharge = 300 * 8 * 2 = 4800
    // lineTotal = 88000 + 4800 = 92800
    const line = makeLine({
      netWeightG: D('8'),
      ratePerGram: D('5500'),
      qty: 2,
      makingPct: D('0'),
      makingPerGram: D('300'),
      stoneValue: D('0'),
    });

    const result = service.computeInvoice([line], ZERO, ZERO, false);

    expect(result.lines[0].metalValue.toFixed(2)).toBe('88000.00');
    expect(result.lines[0].makingCharge.toFixed(2)).toBe('4800.00');
    expect(result.lines[0].lineTotal.toFixed(2)).toBe('92800.00');
  });

  // ---------------------------------------------------------------------------
  // 3. Stone value included in lineTotal
  // ---------------------------------------------------------------------------
  it('3: adds stoneValue (multiplied by qty) into lineTotal', () => {
    // netWeightG=5, ratePerGram=6200, qty=2 → metalValue = 5*6200*2 = 62000
    // makingPct=10 → makingCharge = 62000 * 10/100 = 6200
    // stoneValue=1500 per line × qty=2 → 3000
    // lineTotal = 62000 + 6200 + 3000 = 71200
    const line = makeLine({
      netWeightG: D('5'),
      ratePerGram: D('6200'),
      qty: 2,
      makingPct: D('10'),
      makingPerGram: D('0'),
      stoneValue: D('1500'),
    });

    const result = service.computeInvoice([line], ZERO, ZERO, false);

    expect(result.lines[0].metalValue.toFixed(2)).toBe('62000.00');
    expect(result.lines[0].makingCharge.toFixed(2)).toBe('6200.00');
    expect(result.lines[0].lineTotal.toFixed(2)).toBe('71200.00');
    expect(result.stoneTotal.toFixed(2)).toBe('3000.00');
  });

  // ---------------------------------------------------------------------------
  // 4. Old gold deduction reduces taxableAmount
  // ---------------------------------------------------------------------------
  it('4: deducts old gold value from subtotal to produce taxableAmount', () => {
    // Single item: metalValue=10*6000=60000, making=7200, lineTotal=67200
    // oldGold: 5g × 5500 = 27500
    // taxableAmount = 67200 - 27500 = 39700
    const line = makeLine({
      netWeightG: D('10'),
      ratePerGram: D('6000'),
      makingPct: D('12'),
      makingPerGram: D('0'),
      stoneValue: D('0'),
    });

    const result = service.computeInvoice([line], D('5'), D('5500'), false);

    expect(result.oldGoldDeduction.toFixed(2)).toBe('27500.00');
    expect(result.subtotal.toFixed(2)).toBe('67200.00');
    expect(result.taxableAmount.toFixed(2)).toBe('39700.00');
  });

  // ---------------------------------------------------------------------------
  // 5. Intra-state GST: cgst=1.5%, sgst=1.5%, igst=0
  // ---------------------------------------------------------------------------
  it('5: applies CGST 1.5% and SGST 1.5% for intra-state transactions', () => {
    // lineTotal=67200, taxableAmount=67200 (no old gold)
    // cgst = 67200 * 0.015 = 1008
    // sgst = 67200 * 0.015 = 1008
    // igst = 0
    // totalAmount = 67200 + 1008 + 1008 = 69216
    const line = makeLine({
      netWeightG: D('10'),
      ratePerGram: D('6000'),
      makingPct: D('12'),
      makingPerGram: D('0'),
      stoneValue: D('0'),
    });

    const result = service.computeInvoice([line], ZERO, ZERO, false);

    expect(result.cgst.toFixed(2)).toBe('1008.00');
    expect(result.sgst.toFixed(2)).toBe('1008.00');
    expect(result.igst.toFixed(2)).toBe('0.00');
    expect(result.totalAmount.toFixed(2)).toBe('69216.00');
  });

  // ---------------------------------------------------------------------------
  // 6. Inter-state GST: igst=3%, cgst=0, sgst=0
  // ---------------------------------------------------------------------------
  it('6: applies IGST 3% and zeroes CGST/SGST for inter-state transactions', () => {
    // lineTotal=67200, taxableAmount=67200
    // igst = 67200 * 0.03 = 2016
    // cgst = 0, sgst = 0
    // totalAmount = 67200 + 2016 = 69216
    const line = makeLine({
      netWeightG: D('10'),
      ratePerGram: D('6000'),
      makingPct: D('12'),
      makingPerGram: D('0'),
      stoneValue: D('0'),
    });

    const result = service.computeInvoice([line], ZERO, ZERO, true);

    expect(result.igst.toFixed(2)).toBe('2016.00');
    expect(result.cgst.toFixed(2)).toBe('0.00');
    expect(result.sgst.toFixed(2)).toBe('0.00');
    expect(result.totalAmount.toFixed(2)).toBe('69216.00');
  });

  // ---------------------------------------------------------------------------
  // 7. Multiple lines — subtotals and grand totals are summed correctly
  // ---------------------------------------------------------------------------
  it('7: aggregates multiple lines into correct subtotals and totals', () => {
    // Line A: netWeightG=10, rate=6000, qty=1, makingPct=12, stone=0
    //   metalValue=60000, making=7200, lineTotal=67200
    // Line B: netWeightG=5, rate=6500, qty=1, makingPct=0, makingPerGram=400, stone=2000
    //   metalValue=32500, making=400*5*1=2000, stone=2000, lineTotal=36500
    // subtotal = 67200 + 36500 = 103700
    // makingTotal = 7200 + 2000 = 9200
    // stoneTotal = 0 + 2000 = 2000
    // taxableAmount = 103700 (no old gold)
    // intra-state: cgst=103700*0.015=1555.50, sgst=1555.50
    // totalAmount = 103700 + 1555.50 + 1555.50 = 106811
    const lineA = makeLine({
      itemId: 'item-A',
      netWeightG: D('10'),
      ratePerGram: D('6000'),
      qty: 1,
      makingPct: D('12'),
      makingPerGram: D('0'),
      stoneValue: D('0'),
    });

    const lineB = makeLine({
      itemId: 'item-B',
      netWeightG: D('5'),
      ratePerGram: D('6500'),
      qty: 1,
      makingPct: D('0'),
      makingPerGram: D('400'),
      stoneValue: D('2000'),
    });

    const result = service.computeInvoice([lineA, lineB], ZERO, ZERO, false);

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].lineTotal.toFixed(2)).toBe('67200.00');
    expect(result.lines[1].lineTotal.toFixed(2)).toBe('36500.00');
    expect(result.subtotal.toFixed(2)).toBe('103700.00');
    expect(result.makingTotal.toFixed(2)).toBe('9200.00');
    expect(result.stoneTotal.toFixed(2)).toBe('2000.00');
    expect(result.taxableAmount.toFixed(2)).toBe('103700.00');
    expect(result.cgst.toFixed(2)).toBe('1555.50');
    expect(result.sgst.toFixed(2)).toBe('1555.50');
    expect(result.totalAmount.toFixed(2)).toBe('106811.00');
  });

  // ---------------------------------------------------------------------------
  // 8. All computed values are rounded to 2 decimal places
  // ---------------------------------------------------------------------------
  it('8: rounds all monetary values to exactly 2 decimal places', () => {
    // netWeightG=3, ratePerGram=6333, qty=1 → metalValue = 18999.00 (exact)
    // makingPct=13 → makingCharge = 18999 * 13/100 = 2469.87
    // stoneValue=0, wastage=0
    // lineTotal = 18999 + 2469.87 = 21468.87
    // taxableAmount = 21468.87
    // intra-state: cgst = 21468.87 * 0.015 = 322.0330... → rounded to 322.03
    // sgst = 322.03
    // totalAmount = 21468.87 + 322.03 + 322.03 = 22112.93
    const line = makeLine({
      netWeightG: D('3'),
      ratePerGram: D('6333'),
      qty: 1,
      makingPct: D('13'),
      makingPerGram: D('0'),
      stoneValue: D('0'),
    });

    const result = service.computeInvoice([line], ZERO, ZERO, false);

    // Verify every Decimal result has at most 2 decimal places
    const twoDecimalRegex = /^\d+\.\d{2}$/;

    expect(result.lines[0].metalValue.toFixed(2)).toMatch(twoDecimalRegex);
    expect(result.lines[0].makingCharge.toFixed(2)).toMatch(twoDecimalRegex);
    expect(result.lines[0].lineTotal.toFixed(2)).toMatch(twoDecimalRegex);
    expect(result.subtotal.toFixed(2)).toMatch(twoDecimalRegex);
    expect(result.taxableAmount.toFixed(2)).toMatch(twoDecimalRegex);
    expect(result.cgst.toFixed(2)).toMatch(twoDecimalRegex);
    expect(result.sgst.toFixed(2)).toMatch(twoDecimalRegex);
    expect(result.totalAmount.toFixed(2)).toMatch(twoDecimalRegex);

    // Spot-check actual values
    expect(result.lines[0].metalValue.toFixed(2)).toBe('18999.00');
    expect(result.lines[0].makingCharge.toFixed(2)).toBe('2469.87');
    expect(result.lines[0].lineTotal.toFixed(2)).toBe('21468.87');
    expect(result.cgst.toFixed(2)).toBe('322.03');
    expect(result.sgst.toFixed(2)).toBe('322.03');
    expect(result.totalAmount.toFixed(2)).toBe('22112.93');
  });
});
