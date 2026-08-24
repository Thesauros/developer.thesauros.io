import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';

/**
 * Global HTTP configuration shared by the real server (main.ts) and the e2e
 * suite, so tests exercise the same prefix, validation, error and envelope
 * behaviour that ships.
 */
export function configureApp(app: INestApplication): void {
  // Railway (and any reverse proxy) terminates TLS upstream: without this every
  // request reports the proxy IP, which would collapse rate limiting into one bucket.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : true;
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: [
      'X-Request-Id',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
    ],
    credentials: true,
  });
  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  if (process.env.SWAGGER !== 'false') {
    setupSwagger(app);
  }
}

/**
 * The API surface is public documentation — partners integrate against it —
 * so the schema ships in production too. Set SWAGGER=false to withhold it.
 * Auth is unaffected: every documented route still requires its key.
 *
 * Lives here rather than in main.ts so the e2e suite exercises the same
 * document the deployment serves.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Thesauros Partner API')
    .setDescription(
      'Partner Attribution v1 & Partner API v1.\n\n' +
        'Every response is enveloped: `{object, data}` for a single resource, ' +
        '`{object:"list", data, meta}` for collections. Paginated lists take ' +
        '`?limit=` and `?cursor=`, where the cursor is the previous page\'s ' +
        '`meta.next_cursor` — omit it for the first page.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'API key (tsk_test_...)' })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // Raw schema for tooling (Postman/Insomnia import, codegen), under the same
  // prefix as the API itself.
  app.getHttpAdapter().get('/api/v1/openapi.json', (_req: unknown, res: any) => res.json(document));
  SwaggerModule.setup('swagger', app, document);
}
