import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

function strategyFor(user: any) {
  const config = { get: jest.fn().mockReturnValue('test-secret') };
  const authService = { validateUser: jest.fn().mockResolvedValue(user) };
  return new JwtStrategy(config as any, authService as any);
}

describe('JwtStrategy (staff routes)', () => {
  it('accepts staff users', async () => {
    const owner = { id: 'u1', role: 'OWNER', active: true };
    await expect(strategyFor(owner).validate({ sub: 'u1' } as any)).resolves.toEqual(owner);
  });

  it('rejects customer accounts — a customer login must never open staff endpoints', async () => {
    const customer = { id: 'c1', role: 'CUSTOMER', active: true };
    await expect(strategyFor(customer).validate({ sub: 'c1' } as any)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects unknown or inactive users', async () => {
    await expect(strategyFor(null).validate({ sub: 'x' } as any)).rejects.toThrow(UnauthorizedException);
  });
});
