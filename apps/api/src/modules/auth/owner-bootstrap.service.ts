import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * First-run setup for a fresh production database: users can only be registered by an
 * OWNER, so an empty database would be locked forever. If — and only if — the database
 * has no users at all, create the owner from BOOTSTRAP_OWNER_EMAIL / _PASSWORD / _NAME.
 * With those unset, or once any user exists, this does nothing.
 */
@Injectable()
export class OwnerBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OwnerBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
    const password = process.env.BOOTSTRAP_OWNER_PASSWORD;
    if (!email || !password) return;

    if (password.length < 12) {
      this.logger.error('BOOTSTRAP_OWNER_PASSWORD must be at least 12 characters — owner not created');
      return;
    }

    if ((await this.prisma.user.count()) > 0) return;

    await this.prisma.user.create({
      data: {
        email,
        name: process.env.BOOTSTRAP_OWNER_NAME?.trim() || 'Owner',
        passwordHash: await bcrypt.hash(password, 12),
        role: 'OWNER',
      },
    });
    this.logger.log(`Created first owner account ${email}. Remove BOOTSTRAP_OWNER_PASSWORD now.`);
  }
}
