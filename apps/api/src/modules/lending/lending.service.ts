import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LoanStatus, Metal, PaymentMode, Prisma, Purity } from '@prisma/client';
import { Role } from '@svarna/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../settings/settings.service';
import { demoRatesAllowed, rateMaxAgeHours, rateUsability, CachedRate } from '../rate-sync/rate-math';
import {
  dueOn, isOverdue, LoanState, monthsCharged, PaymentRuleError, round2, splitPayment,
} from './lending-math';
import { CreateLoanDto, ForfeitDto, LoanItemDto, PaymentDto, PledgeDto } from './dto/lending.dto';

export interface Actor { id: string; role: Role | string }

const LOAN_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true, address: true } },
  items: true,
  payments: { orderBy: { paidAt: 'desc' as const } },
  pledges: { orderBy: { pledgedAt: 'desc' as const } },
} satisfies Prisma.LoanInclude;

type LoanFull = Prisma.LoanGetPayload<{ include: typeof LOAN_INCLUDE }>;

const metalOf = (purity: string): Metal => (purity.startsWith('SILVER') ? Metal.SILVER : Metal.GOLD);
const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : Number(d));

@Injectable()
export class LendingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly settings: SettingsService,
  ) {}

  // ── Settings ───────────────────────────────────────────────────────────────

  async lendingSettings() {
    const [ltv, maxLtv, rate, overdue] = await Promise.all([
      this.settings.get('lendingLtvPct'),
      this.settings.get('lendingMaxLtvPct'),
      this.settings.get('lendingInterestPctMonthly'),
      this.settings.get('lendingOverdueMonths'),
    ]);
    const n = (v: string, d: number) => (v !== '' && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
    return {
      ltvPct: n(ltv, 65),
      maxLtvPct: n(maxLtv, 70),
      monthlyRatePct: n(rate, 2),
      overdueMonths: Math.round(n(overdue, 12)),
    };
  }

  // ── Valuation ──────────────────────────────────────────────────────────────

  /** Values items at the shop's current rate for each purity and suggests a loan amount. */
  async valuate(items: LoanItemDto[]) {
    const cfg = await this.lendingSettings();
    const now = new Date();
    const valued = await Promise.all(items.map(async (it) => {
      const cached = await this.redis.getJson<CachedRate>(`rate:${metalOf(it.purity)}:${it.purity}`);
      const check = rateUsability(cached, {
        now, allowDemo: demoRatesAllowed(), maxAgeHours: rateMaxAgeHours(), label: it.purity.replace('_', ' '),
      });
      if (!check.ok || !cached) return { ...it, ratePerGram: null, value: null, rateProblem: check.ok ? 'No rate' : check.message };
      return { ...it, ratePerGram: cached.ratePerGram, value: round2(it.netWeightG * cached.ratePerGram), rateProblem: null };
    }));
    const allValued = valued.every((v) => v.value != null);
    const total = allValued ? round2(valued.reduce((s, v) => s + (v.value ?? 0), 0)) : null;
    return {
      items: valued,
      total,
      ltvPct: cfg.ltvPct,
      maxLtvPct: cfg.maxLtvPct,
      monthlyRatePct: cfg.monthlyRatePct,
      suggestedAmount: total != null ? Math.round((total * cfg.ltvPct) / 100) : null,
      maxAmount: total != null ? Math.floor((total * cfg.maxLtvPct) / 100) : null,
    };
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async createLoan(dto: CreateLoanDto, actor: Actor) {
    for (const it of dto.items) {
      if (it.netWeightG > it.grossWeightG) {
        throw new BadRequestException(`"${it.description}": net weight cannot be more than gross weight`);
      }
    }

    const loanDate = this.resolveDate(dto.loanDate, actor, 'loan date');
    const valuation = await this.valuate(dto.items);
    const cfg = await this.lendingSettings();
    const ltvPct = valuation.total ? round2((dto.amount / valuation.total) * 100) : null;
    if (ltvPct != null && ltvPct > cfg.maxLtvPct && !dto.confirmAboveMaxLtv) {
      throw new BadRequestException(
        `Loan is ${ltvPct}% of the item value, above the ${cfg.maxLtvPct}% maximum. Confirm to continue.`,
      );
    }

    const customerId = await this.resolveCustomer(dto);
    const rate = dto.monthlyRatePct ?? cfg.monthlyRatePct;

    const loan = await this.prisma.$transaction(async (tx) => {
      const loanNumber = await this.nextLoanNumber(tx, loanDate);
      const created = await tx.loan.create({
        data: {
          loanNumber,
          customerId,
          loanDate,
          interestStartDate: loanDate,
          principalOriginal: new Prisma.Decimal(dto.amount),
          principal: new Prisma.Decimal(dto.amount),
          monthlyRatePct: new Prisma.Decimal(rate),
          ltvPct: ltvPct != null ? new Prisma.Decimal(ltvPct) : null,
          valuationTotal: valuation.total != null ? new Prisma.Decimal(valuation.total) : null,
          disbursedMode: (dto.disbursedMode as PaymentMode) ?? PaymentMode.CASH,
          notes: dto.notes,
          createdById: actor.id,
          items: {
            create: valuation.items.map((it) => ({
              description: it.description.trim(),
              metal: metalOf(it.purity),
              purity: it.purity as Purity,
              grossWeightG: new Prisma.Decimal(it.grossWeightG),
              netWeightG: new Prisma.Decimal(it.netWeightG),
              ratePerGram: it.ratePerGram != null ? new Prisma.Decimal(it.ratePerGram) : null,
              value: it.value != null ? new Prisma.Decimal(it.value) : null,
              notes: it.notes,
            })),
          },
        },
      });
      await this.audit(tx, actor, created.id, 'LOAN_CREATED', null, {
        loanNumber, amount: dto.amount, monthlyRatePct: rate, loanDate, ltvPct,
      });
      return created;
    });

    return this.getLoan(loan.id);
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  async getLoan(id: string) {
    const loan = await this.prisma.loan.findUnique({ where: { id }, include: LOAN_INCLUDE });
    if (!loan) throw new NotFoundException('Loan not found');
    const cfg = await this.lendingSettings();
    return this.present(loan, cfg.overdueMonths, new Date());
  }

  async listLoans(tab = 'active', search?: string) {
    const cfg = await this.lendingSettings();
    const now = new Date();
    const where: Prisma.LoanWhereInput = {};
    if (tab === 'closed') where.status = { in: [LoanStatus.REDEEMED, LoanStatus.FORFEITED] };
    else if (tab !== 'all') where.status = LoanStatus.ACTIVE;
    if (search?.trim()) {
      const q = search.trim();
      where.OR = [
        { loanNumber: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { phone: { contains: q } } },
      ];
    }
    const loans = await this.prisma.loan.findMany({
      where, include: LOAN_INCLUDE, orderBy: { loanDate: 'desc' }, take: 500,
    });
    let rows = loans.map((l) => this.present(l, cfg.overdueMonths, now));
    if (tab === 'overdue') rows = rows.filter((r) => r.overdue);
    if (tab === 'merchant') rows = rows.filter((r) => r.withMerchant);
    return rows.map(({ payments, pledges, ...r }) => ({ ...r, paymentCount: payments.length }));
  }

  async summary() {
    const cfg = await this.lendingSettings();
    const now = new Date();
    const active = await this.prisma.loan.findMany({ where: { status: LoanStatus.ACTIVE }, include: LOAN_INCLUDE });
    const rows = active.map((l) => this.present(l, cfg.overdueMonths, now));
    return {
      activeCount: rows.length,
      principalOutstanding: round2(rows.reduce((s, r) => s + r.principal, 0)),
      interestAccrued: round2(rows.reduce((s, r) => s + (r.due?.interestDue ?? 0), 0)),
      overdueCount: rows.filter((r) => r.overdue).length,
      withMerchantCount: rows.filter((r) => r.withMerchant).length,
      settings: cfg,
    };
  }

  // ── Payments ───────────────────────────────────────────────────────────────

  async previewPayment(id: string, dto: PaymentDto, actor: Actor) {
    const loan = await this.loadActive(id);
    const paidAt = this.resolveDate(dto.paidAt, actor, 'payment date');
    this.assertNotBeforeStart(loan, paidAt);
    try {
      const split = splitPayment(this.state(loan), dto.amount, paidAt);
      return { ...split, blockedByMerchant: split.closesLoan && this.openPledge(loan) != null };
    } catch (e) {
      if (e instanceof PaymentRuleError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  async recordPayment(id: string, dto: PaymentDto, actor: Actor) {
    const paidAt = this.resolveDate(dto.paidAt, actor, 'payment date');
    const paymentId = await this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({ where: { id }, include: LOAN_INCLUDE });
      if (!loan) throw new NotFoundException('Loan not found');
      if (loan.status !== LoanStatus.ACTIVE) throw new BadRequestException('This loan is already closed');
      this.assertNotBeforeStart(loan, paidAt);

      let split;
      try {
        split = splitPayment(this.state(loan), dto.amount, paidAt);
      } catch (e) {
        if (e instanceof PaymentRuleError) throw new BadRequestException(e.message);
        throw e;
      }
      const pledge = this.openPledge(loan);
      if (split.closesLoan && pledge) {
        throw new BadRequestException(
          `The item is with ${pledge.merchantName}. Get it back and mark it returned before closing this loan.`,
        );
      }

      const payment = await tx.loanPayment.create({
        data: {
          loanId: id,
          paidAt,
          amount: new Prisma.Decimal(split.amount),
          interestPart: new Prisma.Decimal(split.interestPart),
          principalPart: new Prisma.Decimal(split.principalPart),
          principalBefore: loan.principal,
          principalAfter: new Prisma.Decimal(split.principalAfter),
          monthsCharged: split.months,
          interestStartBefore: loan.interestStartDate,
          mode: (dto.mode as PaymentMode) ?? PaymentMode.CASH,
          reference: dto.reference,
          createdById: actor.id,
        },
      });
      await tx.loan.update({
        where: { id },
        data: {
          principal: new Prisma.Decimal(split.principalAfter),
          interestStartDate: paidAt,
          ...(split.closesLoan ? { status: LoanStatus.REDEEMED, closedAt: paidAt } : {}),
        },
      });
      await this.audit(tx, actor, id, split.closesLoan ? 'LOAN_REDEEMED' : 'LOAN_PAYMENT', {
        principal: num(loan.principal), interestStartDate: loan.interestStartDate,
      }, { paymentId: payment.id, ...split });
      return payment.id;
    });
    return { paymentId, loan: await this.getLoan(id) };
  }

  /** Owner only: undo the most recent payment, restoring principal and interest start exactly. */
  async reverseLatestPayment(id: string, actor: Actor) {
    this.requireOwner(actor, 'reverse a payment');
    await this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findUnique({ where: { id }, include: LOAN_INCLUDE });
      if (!loan) throw new NotFoundException('Loan not found');
      if (loan.status === LoanStatus.FORFEITED) throw new BadRequestException('This loan was forfeited');
      const latest = loan.payments.filter((p) => !p.reversedAt).sort((a, b) =>
        b.paidAt.getTime() - a.paidAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime())[0];
      if (!latest) throw new BadRequestException('There is no payment to reverse');

      await tx.loanPayment.update({ where: { id: latest.id }, data: { reversedAt: new Date(), reversedById: actor.id } });
      await tx.loan.update({
        where: { id },
        data: {
          principal: latest.principalBefore,
          interestStartDate: latest.interestStartBefore,
          status: LoanStatus.ACTIVE,
          closedAt: null,
        },
      });
      await this.audit(tx, actor, id, 'LOAN_PAYMENT_REVERSED', { paymentId: latest.id, amount: num(latest.amount) }, {
        principal: num(latest.principalBefore), interestStartDate: latest.interestStartBefore,
      });
    });
    return this.getLoan(id);
  }

  // ── Merchant pledge ────────────────────────────────────────────────────────

  async pledgeToMerchant(id: string, dto: PledgeDto, actor: Actor) {
    const loan = await this.loadActive(id);
    if (this.openPledge(loan)) throw new BadRequestException('This item is already with a merchant');
    const pledgedAt = this.resolveDate(dto.pledgedAt, actor, 'pledge date');
    await this.prisma.$transaction(async (tx) => {
      const pledge = await tx.loanMerchantPledge.create({
        data: {
          loanId: id,
          merchantName: dto.merchantName.trim(),
          merchantPhone: dto.merchantPhone?.trim() || null,
          pledgedAt,
          amount: new Prisma.Decimal(dto.amount),
          notes: dto.notes,
          createdById: actor.id,
        },
      });
      await this.audit(tx, actor, id, 'LOAN_PLEDGED_TO_MERCHANT', null, {
        pledgeId: pledge.id, merchantName: pledge.merchantName, amount: dto.amount, pledgedAt,
      });
    });
    return this.getLoan(id);
  }

  async returnFromMerchant(id: string, actor: Actor) {
    const loan = await this.prisma.loan.findUnique({ where: { id }, include: LOAN_INCLUDE });
    if (!loan) throw new NotFoundException('Loan not found');
    const pledge = this.openPledge(loan);
    if (!pledge) throw new BadRequestException('This item is not with a merchant');
    await this.prisma.$transaction(async (tx) => {
      await tx.loanMerchantPledge.update({ where: { id: pledge.id }, data: { returnedAt: new Date() } });
      await this.audit(tx, actor, id, 'LOAN_RETURNED_FROM_MERCHANT', null, { pledgeId: pledge.id });
    });
    return this.getLoan(id);
  }

  // ── Forfeit ────────────────────────────────────────────────────────────────

  async forfeit(id: string, dto: ForfeitDto, actor: Actor) {
    const loan = await this.loadActive(id);
    const pledge = this.openPledge(loan);
    if (pledge) {
      throw new BadRequestException(`The item is with ${pledge.merchantName}. Get it back before closing this loan.`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.loan.update({
        where: { id },
        data: { status: LoanStatus.FORFEITED, closedAt: new Date(), forfeitOutcome: dto.outcome, forfeitNotes: dto.notes },
      });
      await this.audit(tx, actor, id, 'LOAN_FORFEITED', { principal: num(loan.principal) }, dto);
    });
    return this.getLoan(id);
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  async loanForDocument(id: string) {
    const loan = await this.prisma.loan.findUnique({ where: { id }, include: LOAN_INCLUDE });
    if (!loan) throw new NotFoundException('Loan not found');
    return loan;
  }

  async paymentForDocument(loanId: string, paymentId: string) {
    const loan = await this.loanForDocument(loanId);
    const payment = loan.payments.find((p) => p.id === paymentId);
    if (!payment) throw new NotFoundException('Payment not found');
    return { loan, payment };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private present(loan: LoanFull, overdueMonths: number, now: Date) {
    const active = loan.status === LoanStatus.ACTIVE;
    const due = active ? dueOn(this.state(loan), now) : null;
    const pledge = this.openPledge(loan);
    return {
      id: loan.id,
      loanNumber: loan.loanNumber,
      status: loan.status,
      customer: loan.customer,
      loanDate: loan.loanDate,
      interestStartDate: loan.interestStartDate,
      principalOriginal: num(loan.principalOriginal),
      principal: num(loan.principal),
      monthlyRatePct: num(loan.monthlyRatePct),
      ltvPct: loan.ltvPct != null ? num(loan.ltvPct) : null,
      valuationTotal: loan.valuationTotal != null ? num(loan.valuationTotal) : null,
      disbursedMode: loan.disbursedMode,
      notes: loan.notes,
      closedAt: loan.closedAt,
      forfeitOutcome: loan.forfeitOutcome,
      forfeitNotes: loan.forfeitNotes,
      createdAt: loan.createdAt,
      monthsRunning: monthsCharged(loan.loanDate, active ? now : (loan.closedAt ?? now), true),
      due,
      overdue: active && isOverdue(loan.loanDate, now, overdueMonths),
      withMerchant: active && pledge != null,
      items: loan.items.map((i) => ({
        ...i,
        grossWeightG: num(i.grossWeightG),
        netWeightG: num(i.netWeightG),
        ratePerGram: i.ratePerGram != null ? num(i.ratePerGram) : null,
        value: i.value != null ? num(i.value) : null,
      })),
      payments: loan.payments.map((p) => ({
        ...p,
        amount: num(p.amount),
        interestPart: num(p.interestPart),
        principalPart: num(p.principalPart),
        principalBefore: num(p.principalBefore),
        principalAfter: num(p.principalAfter),
      })),
      pledges: loan.pledges.map((p) => ({ ...p, amount: num(p.amount) })),
      activePledge: pledge ? { ...pledge, amount: num(pledge.amount) } : null,
    };
  }

  private state(loan: { principal: Prisma.Decimal; monthlyRatePct: Prisma.Decimal; interestStartDate: Date; payments: Array<{ reversedAt: Date | null }> }): LoanState {
    return {
      principal: num(loan.principal),
      monthlyRatePct: num(loan.monthlyRatePct),
      interestStartDate: loan.interestStartDate,
      firstPeriod: !loan.payments.some((p) => !p.reversedAt),
    };
  }

  private openPledge<T extends { pledges: Array<{ returnedAt: Date | null }> }>(loan: T) {
    return loan.pledges.find((p) => !p.returnedAt) as T['pledges'][number] & { merchantName: string; amount: Prisma.Decimal; id: string } | undefined;
  }

  private async loadActive(id: string) {
    const loan = await this.prisma.loan.findUnique({ where: { id }, include: LOAN_INCLUDE });
    if (!loan) throw new NotFoundException('Loan not found');
    if (loan.status !== LoanStatus.ACTIVE) throw new BadRequestException('This loan is already closed');
    return loan;
  }

  /** Compares India-time calendar dates: same day is fine, an earlier day is not. */
  private assertNotBeforeStart(loan: { interestStartDate: Date }, at: Date) {
    const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (day(at) < day(loan.interestStartDate)) {
      throw new BadRequestException('The date cannot be before the loan date or the last payment');
    }
  }

  /** Dates other than "now" are owner-only and cannot be in the future. */
  private resolveDate(input: string | undefined, actor: Actor, what: string): Date {
    if (!input) return new Date();
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(`Invalid ${what}`);
    const now = new Date();
    if (d.getTime() > now.getTime() + 60_000) throw new BadRequestException(`The ${what} cannot be in the future`);
    const sameDay = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (!sameDay) this.requireOwner(actor, `set an earlier ${what}`);
    return d;
  }

  private requireOwner(actor: Actor, action: string) {
    if (actor.role !== Role.OWNER) throw new ForbiddenException(`Only the owner can ${action}`);
  }

  private async resolveCustomer(dto: CreateLoanDto): Promise<string> {
    if (dto.customerId) {
      const c = await this.prisma.customer.findFirst({ where: { id: dto.customerId, deletedAt: null } });
      if (!c) throw new BadRequestException('Customer not found');
      return c.id;
    }
    if (!dto.newCustomer) throw new BadRequestException('Choose a customer or enter a new one');
    const { name, phone, address } = dto.newCustomer;
    const existing = await this.prisma.customer.findUnique({ where: { phone } });
    if (existing) {
      if (!existing.address && address) {
        await this.prisma.customer.update({ where: { id: existing.id }, data: { address } });
      }
      return existing.id;
    }
    const created = await this.prisma.customer.create({ data: { name: name.trim(), phone, address: address?.trim() || null } });
    return created.id;
  }

  private async nextLoanNumber(tx: Prisma.TransactionClient, at: Date): Promise<string> {
    const ym = at.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7).replace('-', '');
    const prefix = `GL-${ym}-`;
    const last = await tx.loan.findFirst({
      where: { loanNumber: { startsWith: prefix } },
      orderBy: { loanNumber: 'desc' },
      select: { loanNumber: true },
    });
    const seq = last ? parseInt(last.loanNumber.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private async audit(tx: Prisma.TransactionClient, actor: Actor, loanId: string, action: string, before: unknown, after: unknown) {
    await tx.auditEvent.create({
      data: {
        actorId: actor.id,
        entityType: 'Loan',
        entityId: loanId,
        action,
        beforeState: before == null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue),
        afterState: after == null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(after)) as Prisma.InputJsonValue),
      },
    });
  }
}
