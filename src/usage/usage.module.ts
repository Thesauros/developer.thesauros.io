import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestLogEntity } from '../database/entities';
import { AuthModule } from '../auth/auth.module';
import { RequestLogInterceptor } from './request-log.interceptor';
import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RequestLogEntity]), AuthModule],
  providers: [
    UsageService,
    // Global: every route is accounted, not just the ones in this module.
    { provide: APP_INTERCEPTOR, useClass: RequestLogInterceptor },
  ],
  controllers: [UsageController],
})
export class UsageModule {}
