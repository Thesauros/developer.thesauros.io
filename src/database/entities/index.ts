import { PartnerEntity } from './partner.entity';
import { CampaignEntity } from './campaign.entity';
import { AttributionEntity } from './attribution.entity';
import { ApiKeyEntity } from './api-key.entity';
import { UserEntity } from './user.entity';
import { PositionEntity } from './position.entity';
import { VaultEntity } from './vault.entity';
import { PositionEventEntity } from './position-event.entity';
import { LockEntity } from './lock.entity';
import { WebhookEntity } from './webhook.entity';
import { WebhookDeliveryEntity } from './webhook-delivery.entity';
import { RequestLogEntity } from './request-log.entity';
import { VaultApySnapshotEntity } from './vault-apy-snapshot.entity';

export const entities = [
  PartnerEntity,
  CampaignEntity,
  AttributionEntity,
  ApiKeyEntity,
  UserEntity,
  PositionEntity,
  VaultEntity,
  PositionEventEntity,
  LockEntity,
  WebhookEntity,
  WebhookDeliveryEntity,
  RequestLogEntity,
  VaultApySnapshotEntity,
];

export {
  PartnerEntity,
  CampaignEntity,
  AttributionEntity,
  ApiKeyEntity,
  UserEntity,
  PositionEntity,
  VaultEntity,
  PositionEventEntity,
  LockEntity,
  WebhookEntity,
  WebhookDeliveryEntity,
  RequestLogEntity,
  VaultApySnapshotEntity,
};

export type StoreCollection =
  | 'partners'
  | 'campaigns'
  | 'attributions'
  | 'keys'
  | 'users'
  | 'positions'
  | 'vaults'
  | 'positionEvents'
  | 'locks'
  | 'webhooks'
  | 'webhookDeliveries';
