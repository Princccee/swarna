const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const CUSTOMER_ID = '026c87ae-0ad4-46b5-a5fa-0ae5a9660335'; // Test Customer (9999999999)

const orders = [
  {
    orderNumber: 'ORD-20260610-0010',
    type: 'CUSTOM',
    status: 'MAKING',
    metalPurity: 'GOLD_22K',
    description: 'Bridal necklace set with kundan work',
    estimatedWeightG: 45.5,
    estimatedValue: 285000,
    advancePaid: 100000,
    balanceDue: 185000,
    expectedReady: new Date('2026-07-15'),
    createdAt: new Date('2026-06-10T10:30:00Z'),
  },
  {
    orderNumber: 'ORD-20260605-0008',
    type: 'PRE_ORDER',
    status: 'CONFIRMED',
    metalPurity: 'GOLD_18K',
    description: 'Diamond solitaire ring - size 16',
    estimatedWeightG: 5.2,
    estimatedValue: 68000,
    advancePaid: 20000,
    balanceDue: 48000,
    expectedReady: new Date('2026-07-01'),
    createdAt: new Date('2026-06-05T14:15:00Z'),
  },
  {
    orderNumber: 'ORD-20260520-0006',
    type: 'CUSTOM',
    status: 'READY',
    metalPurity: 'GOLD_22K',
    description: 'Gold bangles set of 4 - traditional design',
    estimatedWeightG: 32.8,
    estimatedValue: 198000,
    advancePaid: 198000,
    balanceDue: 0,
    expectedReady: new Date('2026-06-20'),
    createdAt: new Date('2026-05-20T09:00:00Z'),
  },
  {
    orderNumber: 'ORD-20260501-0004',
    type: 'REPAIR',
    status: 'INVOICED',
    metalPurity: 'GOLD_22K',
    description: 'Chain repair and rhodium polishing',
    estimatedWeightG: 12.0,
    estimatedValue: 4500,
    advancePaid: 4500,
    balanceDue: 0,
    expectedReady: new Date('2026-05-10'),
    createdAt: new Date('2026-05-01T11:00:00Z'),
  },
  {
    orderNumber: 'ORD-20260415-0003',
    type: 'CUSTOM',
    status: 'INVOICED',
    metalPurity: 'SILVER_925',
    description: 'Silver anklets pair with ghungroo - antique finish',
    estimatedWeightG: 68.0,
    estimatedValue: 9800,
    advancePaid: 9800,
    balanceDue: 0,
    expectedReady: new Date('2026-04-28'),
    createdAt: new Date('2026-04-15T16:45:00Z'),
  },
  {
    orderNumber: 'ORD-20260620-0011',
    type: 'PRE_ORDER',
    status: 'DRAFT',
    metalPurity: 'GOLD_24K',
    description: 'Gold coin 10g - Lakshmi motif',
    estimatedWeightG: 10.0,
    estimatedValue: 75000,
    advancePaid: 0,
    balanceDue: 75000,
    expectedReady: null,
    createdAt: new Date('2026-06-20T08:30:00Z'),
  },
];

async function main() {
  for (const o of orders) {
    const existing = await p.order.findUnique({ where: { orderNumber: o.orderNumber } });
    if (existing) {
      console.log(`Skipping ${o.orderNumber} (already exists)`);
      continue;
    }
    await p.order.create({
      data: {
        orderNumber: o.orderNumber,
        type: o.type,
        status: o.status,
        customerId: CUSTOMER_ID,
        metalPurity: o.metalPurity,
        description: o.description,
        estimatedWeightG: o.estimatedWeightG,
        estimatedValue: o.estimatedValue,
        advancePaid: o.advancePaid,
        balanceDue: o.balanceDue,
        expectedReady: o.expectedReady,
        createdAt: o.createdAt,
      },
    });
    console.log(`Created ${o.orderNumber} — ${o.status}`);
  }
  console.log('Done.');
}

main().finally(() => p.$disconnect());
