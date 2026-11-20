import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateItemDto } from '../modules/inventory/dto/create-item.dto';
import { InvoiceLineDto } from '../modules/billing/dto/create-invoice.dto';
import { CreateOrderDto } from '../modules/orders/dto/order.dto';
import { LoanItemDto } from '../modules/lending/dto/lending.dto';
import { ManualRateEntryDto } from '../modules/rate-sync/dto/manual-rates.dto';
import { DEFAULT_RATE_PURITIES, SELECTABLE_PURITIES } from './purities';

/** Does `purity` pass validation for this DTO? (other fields filled with valid values) */
async function purityOk(cls: any, base: Record<string, unknown>, field: string, purity: string) {
  const errors = await validate(plainToInstance(cls, { ...base, [field]: purity }) as object);
  return !errors.some((e) => e.property === field);
}

const CASES: [string, any, Record<string, unknown>, string][] = [
  ['new inventory item', CreateItemDto, { name: 'Ring', categoryId: '11111111-1111-4111-8111-111111111111', grossWeightG: '5', netWeightG: '5' }, 'purity'],
  ['manual bill line', InvoiceLineDto, { qty: 1, description: 'Ring', netWeightG: 5 }, 'purity'],
  ['new order', CreateOrderDto, { customerId: '22222222-2222-4222-8222-222222222222', type: 'CUSTOM', description: 'Ring' }, 'metalPurity'],
  ['loan item', LoanItemDto, { description: 'Chain', grossWeightG: 10, netWeightG: 9 }, 'purity'],
  ['manual rate', ManualRateEntryDto, { ratePer10g: 60000 }, 'purity'],
];

describe('purities in use: 22K, 18K, Silver (+ 24K on request)', () => {
  it('shows 22K, 18K and silver by default; 24K is selectable but not shown by default', () => {
    expect(DEFAULT_RATE_PURITIES).toEqual(['GOLD_22K', 'GOLD_18K', 'SILVER_999']);
    expect(SELECTABLE_PURITIES).toEqual(['GOLD_22K', 'GOLD_18K', 'SILVER_999', 'GOLD_24K']);
  });

  describe.each(CASES)('%s', (_name, cls, base, field) => {
    it.each(['GOLD_22K', 'GOLD_18K', 'SILVER_999', 'GOLD_24K'])('accepts %s', async (p) => {
      expect(await purityOk(cls, base, field, p)).toBe(true);
    });
    it.each(['PLATINUM_950', 'GOLD_14K', 'SILVER_925'])('refuses %s for anything new', async (p) => {
      expect(await purityOk(cls, base, field, p)).toBe(false);
    });
  });
});
