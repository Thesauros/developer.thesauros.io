import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp, swaggerEnabled } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  configureApp(app);
  // Swagger is configured inside configureApp, so tests share it.
  const port = parseInt(process.env.PORT ?? process.env.API_PORT ?? '3001', 10);
  await app.listen(port);
  Logger.log(`Partner API running on http://localhost:${port} [${nodeEnv}]`);
  if (swaggerEnabled()) {
    Logger.log(`Swagger: http://localhost:${port}/swagger`);
    Logger.log(`OpenAPI: http://localhost:${port}/api/v1/openapi.json`);
  }
}

bootstrap();
