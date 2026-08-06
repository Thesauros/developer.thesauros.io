import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, map } from 'rxjs';
import { Request, Response } from 'express';

export interface EnvelopedResponse<T = unknown> {
  object: string;
  data: T;
  meta?: Record<string, unknown>;
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = randomUUID();
    response.setHeader('X-Request-Id', requestId);
    return next.handle().pipe(
      map((body: unknown) => ({
        object: this.resolveObjectType(request.path, body),
        data: body ?? null,
      })),
    );
  }

  /**
   * Envelope type: the resource's own `object` discriminator when the payload
   * carries one, `list` for collections, otherwise derived from the route.
   * The resource keeps its own `object` field inside `data` (Stripe-style).
   */
  private resolveObjectType(path: string, body: unknown): string {
    if (Array.isArray(body)) return 'list';
    if (body && typeof body === 'object') {
      const inner = (body as Record<string, unknown>).object;
      if (typeof inner === 'string' && inner.length > 0) return inner;
    }
    return this.resolveObjectTypeFromPath(path);
  }

  private resolveObjectTypeFromPath(path: string): string {
    if (path.includes('/partners')) return 'partner';
    if (path.includes('/campaigns')) return 'campaign';
    if (path.includes('/keys')) return 'api_key';
    if (path.includes('/summary')) return 'partner_summary';
    if (path.includes('/deposits')) return 'partner_deposits';
    if (path.includes('/withdrawals')) return 'partner_withdrawals';
    if (path.includes('/tvl')) return 'partner_tvl';
    if (path.includes('/points')) return 'partner_points';
    if (path.includes('/revenue')) return 'revenue_share';
    if (path.includes('/yield')) return 'partner_yield';
    return 'object';
  }
}
