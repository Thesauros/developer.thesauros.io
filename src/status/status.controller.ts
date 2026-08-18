import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators';

const MONITOR_TIMEOUT_MS = 3000;
const bootedAt = Date.now();

interface ServiceHealth {
  id: string;
  name: string;
  status: 'operational' | 'degraded' | 'down';
  latency_ms: number | null;
  detail?: string;
}

interface ChainHealth {
  key: string;
  name: string;
  chainId: number | null;
  status: 'operational' | 'degraded' | 'down';
  block_lag_s: number | null;
  rpc_error: string | null;
}

/**
 * GET /api/v1/status — public component health, sandbox envelope shape
 * ({status, version, uptime_s, services[], chains[]}) with real checks
 * behind it: this process, the database, and the monitoring service
 * (per-chain RPC health + data age) when MONITOR_API_URL is configured.
 */
@ApiTags('Status')
@Controller('status')
export class StatusController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Component health (public, no auth)' })
  async getStatus() {
    const [db, monitoring] = await Promise.all([this.checkDatabase(), this.checkMonitoring()]);

    const services: ServiceHealth[] = [
      { id: 'api', name: 'Partner API v1', status: 'operational', latency_ms: 0 },
      db,
      monitoring.service,
    ];

    const overall = services.some((s) => s.status === 'down')
      ? 'down'
      : services.some((s) => s.status === 'degraded')
        ? 'degraded'
        : 'operational';

    return {
      object: 'status',
      status: overall,
      version: process.env.npm_package_version || '1.0.0',
      uptime_s: Math.floor((Date.now() - bootedAt) / 1000),
      services,
      chains: monitoring.chains,
      updated_at: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<ServiceHealth> {
    const started = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { id: 'db', name: 'Database', status: 'operational', latency_ms: Date.now() - started };
    } catch (error) {
      return {
        id: 'db',
        name: 'Database',
        status: 'down',
        latency_ms: Date.now() - started,
        detail: (error as Error).message,
      };
    }
  }

  private async checkMonitoring(): Promise<{ service: ServiceHealth; chains: ChainHealth[] }> {
    const base = process.env.MONITOR_API_URL;
    if (!base) {
      return {
        service: {
          id: 'monitoring',
          name: 'Chain Monitoring',
          status: 'degraded',
          latency_ms: null,
          detail: 'MONITOR_API_URL is not configured.',
        },
        chains: [],
      };
    }

    const started = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), MONITOR_TIMEOUT_MS);
      const response = await fetch(`${base.replace(/\/$/, '')}/api/networks`, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`monitoring answered ${response.status}`);
      const networks = (await response.json()) as Array<{
        key: string;
        name: string;
        chainId?: number;
        rpcReady?: boolean;
        rpcError?: string | null;
      }>;

      const chains: ChainHealth[] = (Array.isArray(networks) ? networks : []).map((network) => ({
        key: network.key,
        name: network.name,
        chainId: network.chainId ?? null,
        status: network.rpcReady ? 'operational' : 'down',
        // Block lag needs per-chain head timestamps the monitoring /networks
        // payload doesn't carry yet; surfaced as null rather than invented.
        block_lag_s: null,
        rpc_error: network.rpcError ?? null,
      }));

      return {
        service: {
          id: 'monitoring',
          name: 'Chain Monitoring',
          status: chains.length && chains.every((c) => c.status === 'operational') ? 'operational' : 'degraded',
          latency_ms: Date.now() - started,
        },
        chains,
      };
    } catch (error) {
      return {
        service: {
          id: 'monitoring',
          name: 'Chain Monitoring',
          status: 'down',
          latency_ms: Date.now() - started,
          detail: (error as Error).message,
        },
        chains: [],
      };
    }
  }
}
