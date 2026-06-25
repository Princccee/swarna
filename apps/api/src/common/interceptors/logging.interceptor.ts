import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, url } = req;
    const start = Date.now();
    const userId = (req as any).user?.id || 'anonymous';

    return next.handle().pipe(
      tap({
        next: () => {
          const status = context.switchToHttp().getResponse().statusCode;
          this.logger.log(`${method} ${url} ${status} ${Date.now() - start}ms [user:${userId}]`);
        },
        error: (err) => {
          this.logger.error(
            `${method} ${url} ${err?.status || 500} ${Date.now() - start}ms [user:${userId}]`,
          );
        },
      }),
    );
  }
}
