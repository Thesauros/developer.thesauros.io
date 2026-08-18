import { Module } from '@nestjs/common';
import { StoreModule } from '../store/store.module';
import { CryptoModule } from '../crypto/crypto.module';
import { AuthModule } from '../auth/auth.module';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [StoreModule, CryptoModule, AuthModule],
  providers: [WebhooksService],
  controllers: [WebhooksController],
  exports: [WebhooksService],
})
export class WebhooksModule {}
