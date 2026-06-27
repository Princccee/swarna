import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULTS: Record<string, string> = {
  shopName: 'Svarna Jewels',
  shopAddress: '',
  shopPhone: '',
  gstin: process.env.GSTIN ?? '22AAAAA0000A1Z5',
  stateCode: '27',
  isInterstate: 'false',
  irnAutoRegister: 'false',
  wastagePct: '0',
  bullionFeedUrl: '',
  goldApiKey: '',
};

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(): Promise<Record<string, string>> {
    const rows = await this.prisma.setting.findMany();
    const stored: Record<string, string> = {};
    for (const row of rows) {
      stored[row.key] = row.value;
    }
    return { ...DEFAULTS, ...stored };
  }

  async update(data: Record<string, string>): Promise<Record<string, string>> {
    await Promise.all(
      Object.entries(data).map(([key, value]) =>
        this.prisma.setting.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        }),
      ),
    );
    return this.getAll();
  }

  async get(key: string): Promise<string> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (row) return row.value;
    return DEFAULTS[key] ?? '';
  }
}
