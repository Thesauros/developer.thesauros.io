import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

/**
 * The API surface is public documentation — partners integrate against it —
 * so the schema ships in production too. Set SWAGGER=false to withhold it.
 * Auth is unaffected: every documented route still requires its key.
 */
function swaggerEnabled(): boolean {
  return process.env.SWAGGER !== 'false';
}

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
