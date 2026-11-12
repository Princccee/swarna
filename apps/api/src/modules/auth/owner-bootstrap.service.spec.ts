import * as bcrypt from 'bcrypt';
import { OwnerBootstrapService } from './owner-bootstrap.service';

function setup(userCount: number, env: Record<string, string | undefined>) {
  const prisma = {
    user: {
      count: jest.fn().mockResolvedValue(userCount),
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  const service = new OwnerBootstrapService(prisma as any);
  return { service, prisma, restore: () => (process.env = saved) };
}

const ENV = {
  BOOTSTRAP_OWNER_EMAIL: 'owner@shop.in',
  BOOTSTRAP_OWNER_PASSWORD: 'a-long-enough-password',
  BOOTSTRAP_OWNER_NAME: 'Shop Owner',
};

describe('OwnerBootstrapService', () => {
  it('creates the first owner when the database has no users', async () => {
    const { service, prisma, restore } = setup(0, ENV);
    await service.onApplicationBootstrap();
    restore();

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ email: 'owner@shop.in', name: 'Shop Owner', role: 'OWNER' });
    expect(await bcrypt.compare('a-long-enough-password', data.passwordHash)).toBe(true);
  });

  it('does nothing once any user exists', async () => {
    const { service, prisma, restore } = setup(3, ENV);
    await service.onApplicationBootstrap();
    restore();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('does nothing when the bootstrap settings are not provided', async () => {
    const { service, prisma, restore } = setup(0, {
      BOOTSTRAP_OWNER_EMAIL: undefined,
      BOOTSTRAP_OWNER_PASSWORD: undefined,
    });
    await service.onApplicationBootstrap();
    restore();
    expect(prisma.user.count).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses a short password', async () => {
    const { service, prisma, restore } = setup(0, { ...ENV, BOOTSTRAP_OWNER_PASSWORD: 'short' });
    await service.onApplicationBootstrap();
    restore();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
