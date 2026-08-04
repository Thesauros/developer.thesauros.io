import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

const DOC_URL = 'https://developer.thesauros.io/api/v1/openapi.json#errors';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'internal';
    let message = 'An unexpected error occurred.';
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = this.statusToCode(status);
      const body = exception.getResponse();
      message = typeof body === 'string'
        ? body
        : (body as any).message ?? message;
      if (Array.isArray(message)) {
        message = message.join('; ');
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }
    response.status(status).json({
      error: { code, message, doc_url: DOC_URL },
    });
  }

  private statusToCode(status: number): string {
    switch (status) {
      case 400: return 'invalid_request';
      case 401: return 'unauthorized';
      case 403: return 'forbidden';
      case 404: return 'not_found';
      case 409: return 'conflict';
      case 429: return 'rate_limited';
      default: return 'internal';
    }
  }
}
