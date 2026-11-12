import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { customerPortalEnabled } from '../config/features';

/** Makes customer-facing endpoints answer 404 while the customer portal is switched off. */
@Injectable()
export class CustomerPortalGuard implements CanActivate {
  canActivate(): boolean {
    if (!customerPortalEnabled()) throw new NotFoundException();
    return true;
  }
}
