import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { YieldController } from './yield.controller';
import { YieldService } from './yield.service';

@Module({
  imports: [AnalyticsModule],
  controllers: [YieldController],
  providers: [YieldService],
  exports: [YieldService],
})
export class YieldModule {}
