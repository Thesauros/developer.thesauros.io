import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  configureApp(app);
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
  const port = parseInt(process.env.PORT ?? process.env.API_PORT ?? '3001', 10);
  await app.listen(port);
  Logger.log(`Partner API running on http://localhost:${port} [${nodeEnv}]`);
  if (nodeEnv !== 'production') {
    Logger.log(`Swagger: http://localhost:${port}/swagger`);
  }
}

bootstrap();
