import { Module } from '@nestjs/common';
import { PartnerController } from './partner.controller';
import { PartnerApiController } from './partner-api.controller';
import { PartnerService } from './partner.service';
import { AttributionService } from './attribution.service';
import { RevenueService } from './revenue.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [PartnerController, PartnerApiController],
  providers: [PartnerService, AttributionService, RevenueService],
  exports: [PartnerService, AttributionService, RevenueService],
})
export class PartnerModule {}
