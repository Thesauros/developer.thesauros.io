import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());
  const swagger = new DocumentBuilder()
    .setTitle('Thesauros Partner API')
    .setDescription('Partner Attribution v1 & Partner API v1')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'API key (tsk_test_... or tsk_live_...)' })
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('swagger', app, document);
  const port = parseInt(process.env.API_PORT ?? '3001', 10);
  await app.listen(port);
  Logger.log(`Partner API running on http://localhost:${port}/swagger`);
}

bootstrap();
