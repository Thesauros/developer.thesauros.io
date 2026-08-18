import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ApySnapshotService } from './apy-snapshot.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, ApySnapshotService],
  exports: [AnalyticsService, ApySnapshotService],
})
export class AnalyticsModule {}
