import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000'];
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
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
  if (nodeEnv !== 'production') {
    const swagger = new DocumentBuilder()
      .setTitle('Thesauros Partner API')
      .setDescription('Partner Attribution v1 & Partner API v1')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'API key (tsk_test_...)' })
      .build();
    const document = SwaggerModule.createDocument(app, swagger);
    SwaggerModule.setup('swagger', app, document);
  }
  const port = parseInt(process.env.API_PORT ?? '3001', 10);
  await app.listen(port);
  Logger.log(`Partner API running on http://localhost:${port} [${nodeEnv}]`);
  if (nodeEnv !== 'production') {
    Logger.log(`Swagger: http://localhost:${port}/swagger`);
  }
}

bootstrap();
