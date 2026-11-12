import { NotFoundException } from '@nestjs/common';
import { CustomerPortalGuard } from './customer-portal.guard';
import { customerPortalEnabled } from '../config/features';

describe('customer portal switch', () => {
  const saved = process.env.CUSTOMER_PORTAL_ENABLED;
  afterEach(() => {
    if (saved === undefined) delete process.env.CUSTOMER_PORTAL_ENABLED;
    else process.env.CUSTOMER_PORTAL_ENABLED = saved;
  });

  it('is off unless CUSTOMER_PORTAL_ENABLED is exactly "true"', () => {
    delete process.env.CUSTOMER_PORTAL_ENABLED;
    expect(customerPortalEnabled()).toBe(false);
    process.env.CUSTOMER_PORTAL_ENABLED = 'false';
    expect(customerPortalEnabled()).toBe(false);
    process.env.CUSTOMER_PORTAL_ENABLED = 'true';
    expect(customerPortalEnabled()).toBe(true);
  });

  it('guard answers 404 while the portal is off, so the endpoints look absent', () => {
    delete process.env.CUSTOMER_PORTAL_ENABLED;
    expect(() => new CustomerPortalGuard().canActivate()).toThrow(NotFoundException);
  });

  it('guard lets requests through when the portal is on', () => {
    process.env.CUSTOMER_PORTAL_ENABLED = 'true';
    expect(new CustomerPortalGuard().canActivate()).toBe(true);
  });
});
