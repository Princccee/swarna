// Run: node /app/apps/api/prisma/add-images.js  (inside the API container)
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const u = (id, crop = 'center') =>
  `https://images.unsplash.com/photo-${id}?w=600&h=600&fit=crop&crop=${crop}&q=80`;
const pu = (id, crop = 'center') =>
  `https://plus.unsplash.com/premium_photo-${id}?w=600&h=600&fit=crop&crop=${crop}&q=80`;

// 3-image arrays per category — verified Unsplash jewellery photos
const CATEGORY_IMAGES = {
  necklace: [
    [u('1611107683227-e9060eccd846'), u('1569397288884-4d43d6738fbd'),  u('1601121141461-9d6647bca1ed')],
    [u('1569397288884-4d43d6738fbd'),  u('1620656798579-1984d9e87df7'), u('1611107683227-e9060eccd846')],
    [u('1601121141461-9d6647bca1ed'),  u('1611107683227-e9060eccd846'), u('1569397288884-4d43d6738fbd')],
    [u('1620656798579-1984d9e87df7'), u('1601121141461-9d6647bca1ed'),  u('1569397288884-4d43d6738fbd')],
  ],
  ring: [
    [u('1543294001-f7cd5d7fb516'),        u('1611955167811-4711904bb9f8'), u('1629118639934-2b241503956c')],
    [u('1611955167811-4711904bb9f8'), u('1705326455036-0fab8ecba04d'),      u('1543294001-f7cd5d7fb516')],
    [u('1629118639934-2b241503956c'), u('1543294001-f7cd5d7fb516'),        u('1705326455036-0fab8ecba04d')],
    [u('1705326455036-0fab8ecba04d'),      u('1629118639934-2b241503956c'), u('1611955167811-4711904bb9f8')],
  ],
  bangle: [
    [u('1689367436629-1d288f1e23b6'), u('1679156271456-d6068c543ee7'), u('1689367436442-76c859315008')],
    [u('1679156271456-d6068c543ee7'), u('1655707063513-a08dad26440e'), u('1689367436629-1d288f1e23b6')],
    [u('1655707063513-a08dad26440e'), u('1689367436442-76c859315008'), u('1679156271456-d6068c543ee7')],
  ],
  earring: [
    [u('1626784215021-2e39ccf971cd'), u('1705326453292-f3d35cd96514'), u('1626784215021-2e39ccf971cd', 'top')],
    [u('1705326453292-f3d35cd96514'), u('1626784215021-2e39ccf971cd'), u('1705326453292-f3d35cd96514', 'top')],
    [u('1626784215021-2e39ccf971cd', 'entropy'), u('1705326453292-f3d35cd96514'), u('1626784215021-2e39ccf971cd')],
    [u('1705326453292-f3d35cd96514', 'entropy'), u('1626784215021-2e39ccf971cd'), u('1705326453292-f3d35cd96514')],
  ],
  bracelet: [
    [u('1626784215013-13322cb0e471'), u('1758995116383-f51775896add'), u('1626784215013-13322cb0e471', 'top')],
    [u('1758995116383-f51775896add'), u('1626784215013-13322cb0e471'), u('1758995116383-f51775896add', 'top')],
    [u('1626784215013-13322cb0e471', 'entropy'), u('1758995116383-f51775896add'), u('1626784215013-13322cb0e471')],
  ],
  pendant: [
    [u('1506630448388-4e683c67ddb0'), u('1721807550979-6e662d370e92'), u('1506630448388-4e683c67ddb0', 'top')],
    [u('1721807550979-6e662d370e92'), u('1506630448388-4e683c67ddb0'), u('1721807550979-6e662d370e92', 'top')],
    [u('1506630448388-4e683c67ddb0', 'entropy'), u('1721807550979-6e662d370e92'), u('1506630448388-4e683c67ddb0')],
  ],
  chain: [
    [u('1611107683227-e9060eccd846'), u('1613498510372-8901cad084a2'), u('1721807550979-6e662d370e92')],
    [u('1613498510372-8901cad084a2'), u('1721807550979-6e662d370e92'), u('1611107683227-e9060eccd846')],
    [u('1721807550979-6e662d370e92'), u('1611107683227-e9060eccd846'), u('1613498510372-8901cad084a2')],
    [u('1613498510372-8901cad084a2'), u('1611107683227-e9060eccd846'), u('1721807550979-6e662d370e92')],
  ],
};

async function main() {
  const items = await prisma.item.findMany({
    include: { category: { select: { slug: true } } },
    orderBy: { createdAt: 'asc' },
  });

  // Group items by category so each category cycles through its own pool
  const countByCat = {};
  let updated = 0;

  for (const item of items) {
    const slug = item.category?.slug ?? 'chain';
    const pool = CATEGORY_IMAGES[slug] ?? CATEGORY_IMAGES.chain;
    const idx = countByCat[slug] ?? 0;
    countByCat[slug] = idx + 1;

    const imageUrls = pool[idx % pool.length];
    await prisma.item.update({ where: { id: item.id }, data: { imageUrls } });
    updated++;
    console.log(`  ✓ [${slug}] ${item.name}`);
  }

  console.log(`\nDone — updated ${updated} items with jewellery-specific images.`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
