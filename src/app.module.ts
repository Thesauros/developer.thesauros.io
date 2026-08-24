import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ApiThrottlerGuard } from './common/guards/api-throttler.guard';
import { DatabaseModule } from './database/database.module';
import { StoreModule } from './store/store.module';
import { CryptoModule } from './crypto/crypto.module';
import { AuthModule } from './auth/auth.module';
import { PartnerModule } from './partner/partner.module';
import { YieldModule } from './yield/yield.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { UsageModule } from './usage/usage.module';
import { UsersModule } from './users/users.module';
import { StatusModule } from './status/status.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { VaultsModule } from './vaults/vaults.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{
      ttl: 60_000,
      limit: 60,
    }]),
    DatabaseModule,
    StoreModule,
    CryptoModule,
    AuthModule,
    PartnerModule,
    YieldModule,
    WebhooksModule,
    UsageModule,
    UsersModule,
    StatusModule,
    AnalyticsModule,
    ReconciliationModule,
    VaultsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiThrottlerGuard },
  ],
})
export class AppModule {}
