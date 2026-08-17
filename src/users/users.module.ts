import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { AuthModule } from '../auth/auth.module';
import { PartnerModule } from '../partner/partner.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { UsersController } from './users.controller';

@Module({
  imports: [StoreModule, AuthModule, PartnerModule, WebhooksModule],
  controllers: [UsersController],
})
export class UsersModule {}
