import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const ownerEmail = 'owner@svarna.local';
  const existing = await prisma.user.findUnique({ where: { email: ownerEmail } });

  if (!existing) {
    const passwordHash = await bcrypt.hash('svarna@2026', 12);
    await prisma.user.create({
      data: {
        name: 'Shop Owner',
        email: ownerEmail,
        passwordHash,
        role: Role.OWNER,
      },
    });
    console.log('Created owner user: owner@svarna.local / svarna@2026');
  } else {
    console.log('Owner user already exists');
  }

  const categories = [
    { name: 'Necklace', slug: 'necklace', sortOrder: 1 },
    { name: 'Ring', slug: 'ring', sortOrder: 2 },
    { name: 'Bangle', slug: 'bangle', sortOrder: 3 },
    { name: 'Earring', slug: 'earring', sortOrder: 4 },
    { name: 'Bracelet', slug: 'bracelet', sortOrder: 5 },
    { name: 'Pendant', slug: 'pendant', sortOrder: 6 },
    { name: 'Chain', slug: 'chain', sortOrder: 7 },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }
  console.log('Seeded 7 categories');

  const settings = [
    { key: 'shop_name', value: 'Svarna Jewels' },
    { key: 'gst_rate', value: '3' },
    { key: 'irn_auto_register', value: 'false' },
    { key: 'making_charge_default_pct', value: '12' },
    { key: 'wastage_default_pct', value: '2' },
  ];

  for (const s of settings) {
    await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s });
  }
  console.log('Seeded default settings');

  console.log('Seed complete.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
