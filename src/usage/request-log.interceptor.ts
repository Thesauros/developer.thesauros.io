import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';
import { RequestLogEntity } from '../database/entities';

/**
 * Persists one row per handled request — the data source behind GET /usage.
 *
 * Fire-and-forget: usage accounting must never add latency or failure modes
 * to the request it is accounting for. The route TEMPLATE is recorded
 * (`/api/v1/partner/yield/history/:asset`), not the concrete URL, so
 * cardinality stays bounded.
 */
@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLogInterceptor.name);

  constructor(
    @InjectRepository(RequestLogEntity)
    private readonly requestLogRepo: Repository<RequestLogEntity>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const started = Date.now();
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const record = (status: number) => {
      const endpoint = request.route?.path ?? request.path;
      void this.requestLogRepo
        .insert({
          t: new Date().toISOString(),
          partner_id: (request as any).partnerId ?? null,
          key_id: (request as any).apiKey?.id ?? null,
          method: request.method,
          endpoint,
          status,
          duration_ms: Date.now() - started,
        })
        .catch((error) => this.logger.warn(`request log insert failed: ${error.message}`));
    };

    return next.handle().pipe(
      tap({
        next: () => record(response.statusCode),
        // Thrown HttpExceptions resolve their real status in the exception
        // filter after this interceptor; 500 is recorded for uncaught errors
        // and the filter's status for tagged ones once the response is known.
        error: (err) => record(err?.status ?? err?.statusCode ?? 500),
      }),
    );
  }
}
