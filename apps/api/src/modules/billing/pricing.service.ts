import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface PriceLineInput {
  itemId: string;
  qty: number;
  netWeightG: Prisma.Decimal;
  ratePerGram: Prisma.Decimal;
  makingPct: Prisma.Decimal;
  makingPerGram: Prisma.Decimal;
  stoneValue: Prisma.Decimal;
  wastagePct?: Prisma.Decimal; // default 0
}

export interface PriceLineResult extends PriceLineInput {
  metalValue: Prisma.Decimal;
  makingCharge: Prisma.Decimal;
  wastage: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}

export interface InvoiceCalculation {
  lines: PriceLineResult[];
  subtotal: Prisma.Decimal;
  makingTotal: Prisma.Decimal;
  wastageTotal: Prisma.Decimal;
  stoneTotal: Prisma.Decimal;
  oldGoldDeduction: Prisma.Decimal;
  taxableAmount: Prisma.Decimal;
  cgst: Prisma.Decimal;
  sgst: Prisma.Decimal;
  igst: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

const ZERO = new Prisma.Decimal(0);
const IGST_RATE = new Prisma.Decimal('0.03');
const CGST_RATE = new Prisma.Decimal('0.015');
const SGST_RATE = new Prisma.Decimal('0.015');

@Injectable()
export class PricingService {
  computeInvoice(
    lines: PriceLineInput[],
    oldGoldWeightG: Prisma.Decimal,
    oldGoldRatePerGram: Prisma.Decimal,
    isInterstate: boolean,
  ): InvoiceCalculation {
    const computedLines: PriceLineResult[] = lines.map((line) => {
      const wastagePct = line.wastagePct ?? ZERO;

      // metalValue = netWeightG * ratePerGram * qty
      const metalValue = line.netWeightG
        .mul(line.ratePerGram)
        .mul(new Prisma.Decimal(line.qty))
        .toDecimalPlaces(2);

      // makingCharge = (makingPct > 0) ? metalValue * makingPct/100 : makingPerGram * netWeightG * qty
      let makingCharge: Prisma.Decimal;
      if (line.makingPct.greaterThan(ZERO)) {
        makingCharge = metalValue
          .mul(line.makingPct)
          .div(new Prisma.Decimal(100))
          .toDecimalPlaces(2);
      } else {
        makingCharge = line.makingPerGram
          .mul(line.netWeightG)
          .mul(new Prisma.Decimal(line.qty))
          .toDecimalPlaces(2);
      }

      // wastage = metalValue * wastagePct / 100
      const wastage = metalValue
        .mul(wastagePct)
        .div(new Prisma.Decimal(100))
        .toDecimalPlaces(2);

      // stoneValue adjusted for qty
      const stoneValue = line.stoneValue
        .mul(new Prisma.Decimal(line.qty))
        .toDecimalPlaces(2);

      // lineTotal = metalValue + makingCharge + wastage + stoneValue
      const lineTotal = metalValue
        .add(makingCharge)
        .add(wastage)
        .add(stoneValue)
        .toDecimalPlaces(2);

      return {
        ...line,
        metalValue,
        makingCharge,
        wastage,
        lineTotal,
        stoneValue,
      };
    });

    // invoiceSubtotal = sum of all lineTotals
    const subtotal = computedLines
      .reduce((acc, l) => acc.add(l.lineTotal), ZERO)
      .toDecimalPlaces(2);

    const makingTotal = computedLines
      .reduce((acc, l) => acc.add(l.makingCharge), ZERO)
      .toDecimalPlaces(2);

    const wastageTotal = computedLines
      .reduce((acc, l) => acc.add(l.wastage), ZERO)
      .toDecimalPlaces(2);

    const stoneTotal = computedLines
      .reduce((acc, l) => acc.add(l.stoneValue), ZERO)
      .toDecimalPlaces(2);

    // oldGoldDeduction = oldGoldWeightG * oldGoldRatePerGram
    const oldGoldDeduction = oldGoldWeightG
      .mul(oldGoldRatePerGram)
      .toDecimalPlaces(2);

    // taxableAmount = invoiceSubtotal - oldGoldDeduction
    const taxableAmount = subtotal
      .sub(oldGoldDeduction)
      .toDecimalPlaces(2);

    let cgst: Prisma.Decimal;
    let sgst: Prisma.Decimal;
    let igst: Prisma.Decimal;

    if (isInterstate) {
      igst = taxableAmount.mul(IGST_RATE).toDecimalPlaces(2);
      cgst = ZERO;
      sgst = ZERO;
    } else {
      cgst = taxableAmount.mul(CGST_RATE).toDecimalPlaces(2);
      sgst = taxableAmount.mul(SGST_RATE).toDecimalPlaces(2);
      igst = ZERO;
    }

    // totalAmount = taxableAmount + cgst + sgst + igst
    const totalAmount = taxableAmount
      .add(cgst)
      .add(sgst)
      .add(igst)
      .toDecimalPlaces(2);

    return {
      lines: computedLines,
      subtotal,
      makingTotal,
      wastageTotal,
      stoneTotal,
      oldGoldDeduction,
      taxableAmount,
      cgst,
      sgst,
      igst,
      totalAmount,
    };
  }
}
