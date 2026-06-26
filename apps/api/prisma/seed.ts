import { PrismaClient, Role, Purity, Metal, InvoiceStatus, OrderType, OrderStatus, PaymentMode, RegisterType, KarigarEntryType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

function d(v: number | string) { return new Decimal(v); }

function daysAgo(n: number) {
  const dt = new Date();
  dt.setDate(dt.getDate() - n);
  return dt;
}

function invoiceNumber(seq: number, daysBack = 0) {
  const dt = daysAgo(daysBack);
  const ym = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}`;
  return `SVR-${ym}-${String(seq).padStart(4, '0')}`;
}

function orderNumber(seq: number, daysBack = 0) {
  const dt = daysAgo(daysBack);
  const ymd = `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
  return `ORD-${ymd}-${String(seq).padStart(4, '0')}`;
}

const BASE_RATES: Record<string, number> = {
  GOLD_24K: 6520, GOLD_22K: 5977, GOLD_18K: 4890, GOLD_14K: 3803,
  SILVER_999: 85, SILVER_925: 78, PLATINUM_950: 3280,
};

const PURITY_METAL: Record<string, Metal> = {
  GOLD_24K: Metal.GOLD, GOLD_22K: Metal.GOLD, GOLD_18K: Metal.GOLD, GOLD_14K: Metal.GOLD,
  SILVER_999: Metal.SILVER, SILVER_925: Metal.SILVER, PLATINUM_950: Metal.PLATINUM,
};

function jitter(base: number, pct = 0.008) {
  return parseFloat((base * (1 + (Math.random() - 0.5) * 2 * pct)).toFixed(4));
}

async function main() {
  console.log('\n🌱 Svarna seed starting...\n');

  // ── 1. Users ──────────────────────────────────────────────────────────────
  console.log('▸ Users...');
  const hash = await bcrypt.hash('svarna@2026', 12);

  const owner = await prisma.user.upsert({
    where: { email: 'owner@svarna.local' },
    update: { name: 'Rajesh Mehta', phone: '9820001111' },
    create: { name: 'Rajesh Mehta', email: 'owner@svarna.local', phone: '9820001111', passwordHash: hash, role: Role.OWNER },
  });

  const staff = await prisma.user.upsert({
    where: { email: 'staff@svarna.local' },
    update: {},
    create: { name: 'Priya Sharma', email: 'staff@svarna.local', phone: '9820002222', passwordHash: hash, role: Role.STAFF },
  });

  await prisma.user.upsert({
    where: { email: 'accountant@svarna.local' },
    update: {},
    create: { name: 'Amit Joshi', email: 'accountant@svarna.local', phone: '9820003333', passwordHash: hash, role: Role.ACCOUNTANT },
  });

  const karigar1 = await prisma.user.upsert({
    where: { email: 'karigar.ramesh@svarna.local' },
    update: {},
    create: { name: 'Ramesh Soni', email: 'karigar.ramesh@svarna.local', phone: '9820004444', passwordHash: hash, role: Role.STAFF },
  });

  const karigar2 = await prisma.user.upsert({
    where: { email: 'karigar.suresh@svarna.local' },
    update: {},
    create: { name: 'Suresh Kumawat', email: 'karigar.suresh@svarna.local', phone: '9820005555', passwordHash: hash, role: Role.STAFF },
  });

  console.log('  ✓ 5 users');

  // ── 2. Settings ───────────────────────────────────────────────────────────
  console.log('▸ Settings...');
  for (const s of [
    { key: 'shopName', value: 'Svarna Jewels' },
    { key: 'shopAddress', value: '42, Zaveri Bazaar, Mumbai - 400002, Maharashtra' },
    { key: 'shopPhone', value: '+91 22 2342 5678' },
    { key: 'gstin', value: '27AABCS1681F1ZQ' },
    { key: 'stateCode', value: '27' },
    { key: 'isInterstate', value: 'false' },
    { key: 'irnAutoRegister', value: 'false' },
    { key: 'wastagePct', value: '1.5' },
    { key: 'bullionFeedUrl', value: '' },
  ]) {
    await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s });
  }
  console.log('  ✓ Shop settings');

  // ── 3. Categories ─────────────────────────────────────────────────────────
  console.log('▸ Categories...');
  const catDefs = [
    { name: 'Necklace', slug: 'necklace', sortOrder: 1 },
    { name: 'Ring', slug: 'ring', sortOrder: 2 },
    { name: 'Bangle', slug: 'bangle', sortOrder: 3 },
    { name: 'Earring', slug: 'earring', sortOrder: 4 },
    { name: 'Bracelet', slug: 'bracelet', sortOrder: 5 },
    { name: 'Pendant', slug: 'pendant', sortOrder: 6 },
    { name: 'Chain', slug: 'chain', sortOrder: 7 },
  ];
  const cats: Record<string, string> = {};
  for (const c of catDefs) {
    const cat = await prisma.category.upsert({ where: { slug: c.slug }, update: {}, create: { ...c, visible: true } });
    cats[c.slug] = cat.id;
  }
  console.log('  ✓ 7 categories');

  // ── 4. Rate Snapshots — 30 days ───────────────────────────────────────────
  console.log('▸ Rate snapshots (30 days × 7 purities)...');
  const purities = Object.keys(BASE_RATES) as Purity[];
  const latestRates: Record<string, number> = { ...BASE_RATES };

  for (let day = 29; day >= 0; day--) {
    const snappedAt = daysAgo(day);
    snappedAt.setHours(10, 0, 0, 0);
    for (const purity of purities) {
      const rate = jitter(BASE_RATES[purity]);
      if (day === 0) latestRates[purity] = rate;
      await prisma.rateSnapshot.create({
        data: { metal: PURITY_METAL[purity], purity: purity as Purity, ratePerGram: d(rate), source: 'seed', snappedAt },
      });
    }
  }
  console.log('  ✓ 210 rate snapshots');

  // ── 5. Customers ──────────────────────────────────────────────────────────
  console.log('▸ Customers...');
  const customerDefs = [
    { name: 'Sunita Agarwal',  phone: '9876543210', email: 'sunita.agarwal@gmail.com',  panNumber: 'AAKPA1234C', kycVerified: true },
    { name: 'Vijay Patel',     phone: '9876543211', email: 'vijay.patel@gmail.com',      panNumber: 'BBNPP5678D', kycVerified: true },
    { name: 'Meera Desai',     phone: '9876543212', email: 'meera.desai@gmail.com',      panNumber: null,         kycVerified: false },
    { name: 'Arjun Kapoor',    phone: '9876543213', email: 'arjun.kapoor@yahoo.com',     panNumber: 'CCNPK9012E', kycVerified: true },
    { name: 'Deepa Nair',      phone: '9876543214', email: 'deepa.nair@gmail.com',       panNumber: null,         kycVerified: false },
    { name: 'Ramesh Shah',     phone: '9876543215', email: 'ramesh.shah@gmail.com',      panNumber: 'DDNRS3456F', kycVerified: true },
    { name: 'Kavitha Reddy',   phone: '9876543216', email: null,                         panNumber: null,         kycVerified: false },
    { name: 'Prakash Gupta',   phone: '9876543217', email: 'prakash.gupta@gmail.com',    panNumber: 'EENPG7890G', kycVerified: true },
  ];
  const customers: any[] = [];
  for (const c of customerDefs) {
    const existing = await prisma.customer.findUnique({ where: { phone: c.phone } });
    if (existing) { customers.push(existing); continue; }
    customers.push(await prisma.customer.create({ data: c }));
  }
  console.log('  ✓ 8 customers');

  // ── 6. Items ──────────────────────────────────────────────────────────────
  console.log('▸ Inventory items...');
  const itemDefs = [
    // Necklaces
    { catSlug: 'necklace', name: 'Kundan Bridal Necklace',        purity: Purity.GOLD_22K,      grossWt: 45.5,  netWt: 43.2,  stoneWt: 2.3,  makingPct: 14, stoneVal: 8500,  huid: 'HU0001', visible: true,  stock: 1 },
    { catSlug: 'necklace', name: 'Temple Lakshmi Necklace',       purity: Purity.GOLD_22K,      grossWt: 28.3,  netWt: 27.1,  stoneWt: 1.2,  makingPct: 12, stoneVal: 2200,  huid: 'HU0002', visible: true,  stock: 1 },
    { catSlug: 'necklace', name: 'Diamond Cut Chain Necklace',    purity: Purity.GOLD_18K,      grossWt: 12.6,  netWt: 12.0,  stoneWt: 0.6,  makingPct: 10, stoneVal: 0,     huid: 'HU0003', visible: true,  stock: 2 },
    { catSlug: 'necklace', name: 'Antique Polki Necklace',        purity: Purity.GOLD_22K,      grossWt: 52.1,  netWt: 50.0,  stoneWt: 2.1,  makingPct: 16, stoneVal: 15000, huid: null,     visible: false, stock: 1 },
    // Rings
    { catSlug: 'ring',     name: 'Solitaire Diamond Ring',        purity: Purity.GOLD_18K,      grossWt: 5.2,   netWt: 4.8,   stoneWt: 0.4,  makingPct: 15, stoneVal: 12000, huid: 'HU0010', visible: true,  stock: 1 },
    { catSlug: 'ring',     name: 'Plain Band Ring',               purity: Purity.GOLD_22K,      grossWt: 3.1,   netWt: 3.0,   stoneWt: 0.1,  makingPct: 8,  stoneVal: 0,     huid: 'HU0011', visible: true,  stock: 3 },
    { catSlug: 'ring',     name: 'Ruby Cocktail Ring',            purity: Purity.GOLD_18K,      grossWt: 6.8,   netWt: 6.0,   stoneWt: 0.8,  makingPct: 18, stoneVal: 6500,  huid: 'HU0012', visible: true,  stock: 1 },
    { catSlug: 'ring',     name: 'Engagement Ring Set',           purity: Purity.GOLD_14K,      grossWt: 4.5,   netWt: 4.2,   stoneWt: 0.3,  makingPct: 12, stoneVal: 18000, huid: null,     visible: true,  stock: 1 },
    // Bangles
    { catSlug: 'bangle',   name: 'Plain Gold Bangle (pair)',      purity: Purity.GOLD_22K,      grossWt: 22.8,  netWt: 22.2,  stoneWt: 0.6,  makingPct: 8,  stoneVal: 0,     huid: 'HU0020', visible: true,  stock: 3 },
    { catSlug: 'bangle',   name: 'Filigree Bangle',               purity: Purity.GOLD_22K,      grossWt: 18.4,  netWt: 17.8,  stoneWt: 0.6,  makingPct: 14, stoneVal: 0,     huid: 'HU0021', visible: true,  stock: 1 },
    { catSlug: 'bangle',   name: 'Studded Meenakari Bangle',      purity: Purity.GOLD_22K,      grossWt: 35.2,  netWt: 33.0,  stoneWt: 2.2,  makingPct: 18, stoneVal: 4500,  huid: null,     visible: false, stock: 1 },
    // Earrings
    { catSlug: 'earring',  name: 'Jhumka Earrings',               purity: Purity.GOLD_22K,      grossWt: 7.8,   netWt: 7.4,   stoneWt: 0.4,  makingPct: 12, stoneVal: 800,   huid: 'HU0030', visible: true,  stock: 2 },
    { catSlug: 'earring',  name: 'Diamond Stud Earrings',         purity: Purity.GOLD_18K,      grossWt: 3.2,   netWt: 2.9,   stoneWt: 0.3,  makingPct: 15, stoneVal: 22000, huid: 'HU0031', visible: true,  stock: 1 },
    { catSlug: 'earring',  name: 'Chandbali Earrings',            purity: Purity.GOLD_22K,      grossWt: 9.6,   netWt: 9.0,   stoneWt: 0.6,  makingPct: 16, stoneVal: 1200,  huid: 'HU0032', visible: true,  stock: 1 },
    { catSlug: 'earring',  name: 'Silver Drop Earrings',          purity: Purity.SILVER_999,    grossWt: 8.5,   netWt: 8.2,   stoneWt: 0.3,  makingPct: 10, stoneVal: 0,     huid: null,     visible: true,  stock: 4 },
    // Bracelets
    { catSlug: 'bracelet', name: 'Gold Tennis Bracelet',          purity: Purity.GOLD_18K,      grossWt: 14.2,  netWt: 13.5,  stoneWt: 0.7,  makingPct: 14, stoneVal: 28000, huid: 'HU0040', visible: true,  stock: 1 },
    { catSlug: 'bracelet', name: 'Charm Bracelet',                purity: Purity.GOLD_22K,      grossWt: 10.8,  netWt: 10.2,  stoneWt: 0.6,  makingPct: 12, stoneVal: 0,     huid: 'HU0041', visible: true,  stock: 2 },
    { catSlug: 'bracelet', name: 'Silver Kada',                   purity: Purity.SILVER_925,    grossWt: 45.0,  netWt: 44.0,  stoneWt: 1.0,  makingPct: 8,  stoneVal: 0,     huid: null,     visible: true,  stock: 4 },
    // Pendants
    { catSlug: 'pendant',  name: 'Ganesh Pendant',                purity: Purity.GOLD_22K,      grossWt: 2.8,   netWt: 2.6,   stoneWt: 0.2,  makingPct: 16, stoneVal: 0,     huid: 'HU0050', visible: true,  stock: 2 },
    { catSlug: 'pendant',  name: 'Heart Diamond Pendant',         purity: Purity.GOLD_18K,      grossWt: 3.4,   netWt: 3.0,   stoneWt: 0.4,  makingPct: 18, stoneVal: 9500,  huid: 'HU0051', visible: true,  stock: 1 },
    { catSlug: 'pendant',  name: 'Om Pendant',                    purity: Purity.GOLD_24K,      grossWt: 1.9,   netWt: 1.85,  stoneWt: 0.05, makingPct: 10, stoneVal: 0,     huid: 'HU0052', visible: true,  stock: 3 },
    // Chains
    { catSlug: 'chain',    name: 'Singapore Chain 18 inch',       purity: Purity.GOLD_22K,      grossWt: 8.2,   netWt: 8.0,   stoneWt: 0.2,  makingPct: 8,  stoneVal: 0,     huid: 'HU0060', visible: true,  stock: 2 },
    { catSlug: 'chain',    name: 'Box Chain 20 inch',             purity: Purity.GOLD_22K,      grossWt: 11.5,  netWt: 11.2,  stoneWt: 0.3,  makingPct: 8,  stoneVal: 0,     huid: 'HU0061', visible: true,  stock: 1 },
    { catSlug: 'chain',    name: 'Platinum Chain',                purity: Purity.PLATINUM_950,  grossWt: 10.2,  netWt: 10.0,  stoneWt: 0.2,  makingPct: 12, stoneVal: 0,     huid: null,     visible: true,  stock: 1 },
    { catSlug: 'chain',    name: 'Silver Rope Chain',             purity: Purity.SILVER_999,    grossWt: 22.0,  netWt: 21.5,  stoneWt: 0.5,  makingPct: 6,  stoneVal: 0,     huid: null,     visible: true,  stock: 5 },
  ];

  const items: any[] = [];
  let itemSeq = 1;
  const ym = `${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  for (const def of itemDefs) {
    const sku = `${def.catSlug.toUpperCase().slice(0, 3)}-${ym}-${String(itemSeq).padStart(4, '0')}`;
    itemSeq++;

    let existing = def.huid
      ? await prisma.item.findUnique({ where: { huid: def.huid } })
      : await prisma.item.findUnique({ where: { sku } });

    if (existing) { items.push(existing); continue; }

    const item = await prisma.item.create({
      data: {
        categoryId: cats[def.catSlug],
        sku,
        name: def.name,
        purity: def.purity,
        grossWeightG: d(def.grossWt),
        netWeightG: d(def.netWt),
        stoneWeightG: d(def.stoneWt),
        huid: def.huid ?? undefined,
        makingPct: d(def.makingPct),
        makingPerGram: d(0),
        stoneValue: d(def.stoneVal),
        stockQty: def.stock,
        catalogueVisible: def.visible,
        active: true,
      },
    });

    if (def.huid) {
      await prisma.huidLog.create({
        data: { itemId: item.id, huid: def.huid, action: 'REGISTERED', loggedAt: daysAgo(15) },
      });
    }

    await prisma.stockMovement.create({
      data: { itemId: item.id, type: 'IN', qty: def.stock, reason: 'Initial stock entry', createdAt: daysAgo(25) },
    });

    items.push(item);
  }
  console.log(`  ✓ ${items.length} items across 7 categories`);

  // ── 7. Invoices ───────────────────────────────────────────────────────────
  console.log('▸ Invoices...');

  const snap22K = await prisma.rateSnapshot.findFirst({ where: { purity: Purity.GOLD_22K }, orderBy: { snappedAt: 'desc' } });

  const invoiceDefs: any[] = [
    { customer: customers[0], daysBack: 18, seq: 1, status: InvoiceStatus.IRN_REGISTERED, lines: [{ item: items[0], qty: 1 }, { item: items[11], qty: 1 }], paymentMode: PaymentMode.UPI,         irn: 'ABC123DEF456GHI789JKL012MNO345PQR678STU901' },
    { customer: customers[1], daysBack: 14, seq: 2, status: InvoiceStatus.CONFIRMED,       lines: [{ item: items[4], qty: 1 }],                               paymentMode: PaymentMode.CASH },
    { customer: customers[2], daysBack: 10, seq: 3, status: InvoiceStatus.CONFIRMED,       lines: [{ item: items[8], qty: 1 }, { item: items[18], qty: 1 }],  paymentMode: PaymentMode.CARD,        partialPaid: 50000 },
    { customer: customers[3], daysBack:  8, seq: 4, status: InvoiceStatus.CONFIRMED,       lines: [{ item: items[1], qty: 1 }],                               paymentMode: PaymentMode.UPI,         oldGoldWt: 10.5, oldGoldRate: 5800 },
    { customer: customers[4], daysBack:  5, seq: 5, status: InvoiceStatus.IRN_PENDING,     lines: [{ item: items[15], qty: 1 }],                              paymentMode: PaymentMode.NET_BANKING },
    { customer: customers[5], daysBack:  2, seq: 6, status: InvoiceStatus.DRAFT,           lines: [{ item: items[6], qty: 1 }, { item: items[12], qty: 1 }],  paymentMode: PaymentMode.CASH },
    { customer: customers[6], daysBack: 20, seq: 7, status: InvoiceStatus.CANCELLED,       lines: [{ item: items[9], qty: 1 }],                               paymentMode: PaymentMode.CASH },
    { customer: customers[7], daysBack:  0, seq: 8, status: InvoiceStatus.CONFIRMED,       lines: [{ item: items[19], qty: 1 }, { item: items[21], qty: 1 }], paymentMode: PaymentMode.UPI },
    { customer: customers[0], daysBack:  7, seq: 9, status: InvoiceStatus.CONFIRMED,       lines: [{ item: items[16], qty: 1 }],                              paymentMode: PaymentMode.CASH },
    { customer: customers[1], daysBack:  3, seq:10, status: InvoiceStatus.IRN_REGISTERED,  lines: [{ item: items[20], qty: 1 }],                              paymentMode: PaymentMode.UPI,         irn: 'XYZ987WVU654TSR321QPO098NML765KJI432' },
  ];

  for (const def of invoiceDefs) {
    const invoicedAt = daysAgo(def.daysBack);
    invoicedAt.setHours(11 + (def.seq % 6), 0, 0, 0);

    let subtotal = d(0); let makingTotal = d(0); let stoneTotal = d(0);
    const lineData: any[] = [];

    for (const l of def.lines) {
      const purity = l.item.purity as string;
      const rate = latestRates[purity] ?? BASE_RATES['GOLD_22K'];
      const netWt: Decimal = l.item.netWeightG;
      const metalValue = netWt.mul(d(rate));
      const making = metalValue.mul(d(l.item.makingPct)).div(100);
      const stone: Decimal = l.item.stoneValue;
      const lineTotal = metalValue.add(making).add(stone);
      subtotal = subtotal.add(lineTotal);
      makingTotal = makingTotal.add(making);
      stoneTotal = stoneTotal.add(stone);
      lineData.push({ itemId: l.item.id, qty: l.qty, netWeightG: netWt, ratePerGram: d(rate), makingCharge: making.toDecimalPlaces(2), stoneValue: stone.toDecimalPlaces(2), lineTotal: lineTotal.toDecimalPlaces(2) });
    }

    const oldGoldDeduction = def.oldGoldWt ? d(def.oldGoldWt).mul(d(def.oldGoldRate)) : d(0);
    const taxableAmount = subtotal.sub(oldGoldDeduction);
    const cgst = taxableAmount.mul(d('0.015')).toDecimalPlaces(2);
    const sgst = taxableAmount.mul(d('0.015')).toDecimalPlaces(2);
    const totalAmount = taxableAmount.add(cgst).add(sgst).toDecimalPlaces(2);

    let amountPaid: Decimal;
    if (def.status === InvoiceStatus.DRAFT || def.status === InvoiceStatus.CANCELLED) {
      amountPaid = d(0);
    } else if (def.partialPaid !== undefined) {
      amountPaid = d(def.partialPaid);
    } else {
      amountPaid = totalAmount;
    }
    const balanceDue = totalAmount.sub(amountPaid).toDecimalPlaces(2);

    const snapForItem = await prisma.rateSnapshot.findFirst({
      where: { purity: def.lines[0].item.purity }, orderBy: { snappedAt: 'desc' },
    }) ?? snap22K!;

    const inv = await prisma.invoice.create({
      data: {
        customerId: def.customer.id,
        rateSnapshotId: snapForItem.id,
        createdById: owner.id,
        invoiceNumber: invoiceNumber(def.seq, def.daysBack),
        subtotal: subtotal.toDecimalPlaces(2),
        makingTotal: makingTotal.toDecimalPlaces(2),
        wastageTotal: d(0),
        stoneTotal: stoneTotal.toDecimalPlaces(2),
        oldGoldDeduction: oldGoldDeduction.toDecimalPlaces(2),
        oldGoldWeightG: d(def.oldGoldWt ?? 0),
        oldGoldRatePerGram: d(def.oldGoldRate ?? 0),
        taxableAmount: taxableAmount.toDecimalPlaces(2),
        cgst, sgst, igst: d(0),
        totalAmount, amountPaid, balanceDue,
        status: def.status,
        irn: def.irn ?? null,
        invoicedAt: def.status !== InvoiceStatus.DRAFT ? invoicedAt : null,
        createdAt: invoicedAt, updatedAt: invoicedAt,
        lines: { create: lineData },
      },
    });

    if (amountPaid.gt(0)) {
      await prisma.payment.create({ data: { invoiceId: inv.id, amount: amountPaid, mode: def.paymentMode, paidAt: invoicedAt } });
    }

    if (![InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED].includes(def.status)) {
      for (const l of def.lines) {
        await prisma.stockMovement.create({ data: { itemId: l.item.id, type: 'OUT', qty: l.qty, reason: `Sale — ${inv.invoiceNumber}`, refId: inv.id, createdAt: invoicedAt } });
        await prisma.item.update({ where: { id: l.item.id }, data: { stockQty: { decrement: l.qty } } });
      }
      await prisma.registerEntry.create({
        data: { createdById: owner.id, refInvoiceId: inv.id, registerType: RegisterType.SALES, description: `Invoice ${inv.invoiceNumber}`, amount: totalAmount, entryDate: invoicedAt, createdAt: invoicedAt },
      });
      if (def.oldGoldWt) {
        await prisma.registerEntry.create({
          data: { createdById: owner.id, registerType: RegisterType.OLD_GOLD_EXCHANGE, description: `Old gold — ${inv.invoiceNumber}: ${def.oldGoldWt}g`, amount: oldGoldDeduction.toDecimalPlaces(2), entryDate: invoicedAt, createdAt: invoicedAt },
        });
      }
    }

    await prisma.auditEvent.create({
      data: { actorId: owner.id, entityType: 'Invoice', entityId: inv.id, action: 'CREATE', afterState: { invoiceNumber: inv.invoiceNumber, totalAmount: totalAmount.toFixed(2), status: def.status }, occurredAt: invoicedAt },
    });
  }
  console.log('  ✓ 10 invoices (IRN registered / confirmed / partial / old gold / draft / cancelled)');

  // Update customer totalSpent
  for (const customer of customers) {
    const paid = await prisma.payment.aggregate({ where: { invoice: { customerId: customer.id } }, _sum: { amount: true } });
    if (paid._sum.amount) await prisma.customer.update({ where: { id: customer.id }, data: { totalSpent: paid._sum.amount } });
  }

  // ── 8. Orders ─────────────────────────────────────────────────────────────
  console.log('▸ Orders...');
  const orderDefs = [
    { customer: customers[2], type: OrderType.CUSTOM,    status: OrderStatus.MAKING,    daysBack: 15, seq: 1, desc: 'Bridal necklace set — Kundan work with meenakari',        purity: Purity.GOLD_22K,     estWt: 80.0,  estVal: 520000, advance: 150000, expectedDays: 10, karigar: karigar1 },
    { customer: customers[3], type: OrderType.REPAIR,    status: OrderStatus.READY,     daysBack:  8, seq: 2, desc: 'Ring resizing and rhodium plating',                       purity: Purity.GOLD_18K,     estWt: 5.0,   estVal:   3500, advance:   1000, expectedDays:  2, karigar: karigar2 },
    { customer: customers[4], type: OrderType.PRE_ORDER, status: OrderStatus.CONFIRMED, daysBack:  5, seq: 3, desc: 'Jhumka earrings — traditional design, size medium',       purity: Purity.GOLD_22K,     estWt: 12.0,  estVal:  78000, advance:  25000, expectedDays: 20, karigar: null     },
    { customer: customers[5], type: OrderType.CUSTOM,    status: OrderStatus.CONFIRMED, daysBack:  3, seq: 4, desc: 'Silver kada — antique finish, size 2.8',                  purity: null,                estWt: 50.0,  estVal:   5500, advance:   2000, expectedDays:  7, karigar: karigar1 },
    { customer: customers[0], type: OrderType.REPAIR,    status: OrderStatus.DRAFT,     daysBack:  1, seq: 5, desc: 'Chain soldering and cleaning',                            purity: null,                estWt: null,  estVal:    800, advance:      0, expectedDays:  3, karigar: null     },
    { customer: customers[6], type: OrderType.PRE_ORDER, status: OrderStatus.MAKING,    daysBack: 20, seq: 6, desc: 'Custom platinum band — wedding ring with engraving',      purity: Purity.PLATINUM_950, estWt:  8.0,  estVal:  35000, advance:  10000, expectedDays:  5, karigar: karigar2 },
    { customer: customers[7], type: OrderType.CUSTOM,    status: OrderStatus.READY,     daysBack: 25, seq: 7, desc: 'Diamond pendant setting — customer\'s own stones',        purity: Purity.GOLD_18K,     estWt:  4.0,  estVal:  28000, advance:  10000, expectedDays:  3, karigar: karigar1 },
    { customer: customers[1], type: OrderType.REPAIR,    status: OrderStatus.CANCELLED, daysBack: 30, seq: 8, desc: 'Bangle repair — clasp replacement',                      purity: null,                estWt: null,  estVal:   1200, advance:      0, expectedDays:  2, karigar: null     },
  ];

  for (const def of orderDefs) {
    const createdAt = daysAgo(def.daysBack);
    const expectedReady = new Date(createdAt);
    expectedReady.setDate(expectedReady.getDate() + def.expectedDays);

    const order = await prisma.order.create({
      data: {
        customerId: def.customer.id,
        assignedToId: def.karigar?.id ?? staff.id,
        orderNumber: orderNumber(def.seq, def.daysBack),
        type: def.type, status: def.status, description: def.desc,
        metalPurity: def.purity ?? undefined,
        estimatedWeightG: def.estWt ? d(def.estWt) : undefined,
        estimatedValue: d(def.estVal),
        advancePaid: d(def.advance),
        balanceDue: d(def.estVal - def.advance),
        expectedReady, createdAt, updatedAt: createdAt,
      },
    });

    if (def.advance > 0) {
      await prisma.orderPayment.create({ data: { orderId: order.id, amount: d(def.advance), mode: PaymentMode.CASH, paidAt: createdAt } });
    }

    const statusStr = def.status as string;
    if (def.karigar && ['MAKING', 'READY', 'INVOICED'].includes(statusStr)) {
      const issuedWt = (def.estWt ?? 10) * 1.05;
      await prisma.karigarLedger.create({
        data: { karigarUserId: def.karigar.id, orderId: order.id, entryType: KarigarEntryType.ISSUED, goldWeightG: d(issuedWt.toFixed(3)), metal: Metal.GOLD, purity: def.purity ?? undefined, notes: `Issued for ${order.orderNumber}`, entryAt: new Date(createdAt.getTime() + 86400000) },
      });

      if (['READY', 'INVOICED'].includes(statusStr)) {
        const returnWt = issuedWt - (def.estWt ?? 10) * 0.05 - 0.200;
        await prisma.karigarLedger.create({
          data: { karigarUserId: def.karigar.id, orderId: order.id, entryType: KarigarEntryType.RETURNED, goldWeightG: d(returnWt.toFixed(3)), metal: Metal.GOLD, purity: def.purity ?? undefined, notes: `Returned after completion`, entryAt: new Date(createdAt.getTime() + 86400000 * (def.expectedDays - 1)) },
        });
      }
    }

    await prisma.auditEvent.create({
      data: { actorId: staff.id, entityType: 'Order', entityId: order.id, action: 'CREATE', afterState: { orderNumber: order.orderNumber, type: def.type, status: def.status }, occurredAt: createdAt },
    });
  }
  console.log('  ✓ 8 orders (PRE_ORDER / CUSTOM / REPAIR across all statuses)');

  // ── 9. Purchase entries ────────────────────────────────────────────────────
  console.log('▸ Purchase register entries...');
  for (const p of [
    { desc: 'Gold bullion purchase — 100g @ ₹6,480/g', amount: 648000, days: 22 },
    { desc: 'Silver ingot purchase — 500g',             amount:  43000, days: 17 },
    { desc: 'Diamond parcel — 0.5ct mixed lots',        amount:  85000, days: 12 },
    { desc: 'Gold bullion purchase — 50g @ ₹6,510/g',  amount: 325500, days:  6 },
    { desc: 'Packaging & display materials',            amount:   8400, days:  3 },
  ]) {
    const entryDate = daysAgo(p.days);
    await prisma.registerEntry.create({ data: { createdById: owner.id, registerType: RegisterType.PURCHASE, description: p.desc, amount: d(p.amount), entryDate, createdAt: entryDate } });
  }
  console.log('  ✓ 5 purchase entries');

  // ── 10. Misc audit events ──────────────────────────────────────────────────
  console.log('▸ Audit events...');
  for (const a of [
    { actor: staff.id,     entity: 'Item',          action: 'UPDATE', msg: 'Stock adjusted — manual count',   days: 4 },
    { actor: owner.id,     entity: 'Setting',       action: 'UPDATE', msg: 'GST type changed to intra-state', days: 9 },
    { actor: owner.id,     entity: 'User',          action: 'CREATE', msg: 'New staff account created',       days: 25 },
    { actor: staff.id,     entity: 'Customer',      action: 'CREATE', msg: 'Walk-in customer registered',     days: 2 },
    { actor: owner.id,     entity: 'Item',          action: 'UPDATE', msg: 'Catalogue visibility updated',    days: 11 },
  ]) {
    await prisma.auditEvent.create({
      data: { actorId: a.actor, entityType: a.entity, entityId: `seed-${Math.random().toString(36).slice(2, 10)}`, action: a.action, afterState: { note: a.msg }, occurredAt: daysAgo(a.days) },
    });
  }
  console.log('  ✓ Audit trail entries');

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('\n✅ Seed complete!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  All passwords: svarna@2026');
  console.log('  Owner      → owner@svarna.local');
  console.log('  Staff      → staff@svarna.local');
  console.log('  Accountant → accountant@svarna.local');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
