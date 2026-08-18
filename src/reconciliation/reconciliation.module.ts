import { Module } from '@nestjs/common';
import { MonitorClient } from './monitor.client';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';

@Module({
  controllers: [ReconciliationController],
  providers: [ReconciliationService, MonitorClient],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
