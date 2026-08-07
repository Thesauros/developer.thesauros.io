import { createHash } from 'node:crypto';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * The stock ThrottlerGuard buckets by `class-handler-tracker`, so the 60 req/min
 * limit was applied *per endpoint* — a client spraying 12 different endpoints
 * only got a 429 after ~700 requests. This guard collapses every route into a
 * single bucket per caller and tracks by API key (falling back to IP), so the
 * documented "60 requests per minute" holds account-wide.
 */
@Injectable()
export class ApiThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const header = String(req?.headers?.authorization ?? '');
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return `key:${createHash('sha256').update(match[1].trim()).digest('hex')}`;
    }
    const ip = req?.ip ?? req?.socket?.remoteAddress ?? 'unknown';
    return `ip:${ip}`;
  }

  protected generateKey(_context: ExecutionContext, suffix: string, name: string): string {
    return createHash('sha256').update(`global-${name}-${suffix}`).digest('hex');
  }
}
