import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { Request, Response } from 'express';

export interface EnvelopedResponse {
  object: string;
  data: unknown;
  meta?: Record<string, unknown>;
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = crypto.randomUUID();
    response.setHeader('X-Request-Id', requestId);
    response.setHeader('Access-Control-Allow-Origin', '*');
    return next.handle().pipe(
      map((body: unknown) => {
        if (body && typeof body === 'object' && 'object' in (body as Record<string, unknown>)) {
          return body;
        }
        const objectType = this.resolveObjectType(request.path);
        return { object: objectType, data: body };
      }),
    );
  }

  private resolveObjectType(path: string): string {
    if (path.includes('/partners')) return 'partner';
    if (path.includes('/campaigns')) return 'campaign';
    if (path.includes('/keys')) return 'api_key';
    if (path.includes('/summary')) return 'partner_summary';
    if (path.includes('/tvl')) return 'partner_tvl';
    if (path.includes('/revenue')) return 'revenue_share';
    if (path.includes('/yield')) return 'yield';
    return 'object';
  }
}
