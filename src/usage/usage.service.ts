import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { RequestLogEntity } from '../database/entities';

export const USAGE_RANGES = ['24h', '7d', '30d'] as const;
export type UsageRange = (typeof USAGE_RANGES)[number];

/** Mirrors the sandbox's bucketing: hourly for 24h, daily for 7d/30d. */
const RANGE_CONFIG: Record<UsageRange, { count: number; stepMs: number }> = {
  '24h': { count: 24, stepMs: 60 * 60 * 1000 },
  '7d': { count: 7, stepMs: 24 * 60 * 60 * 1000 },
  '30d': { count: 30, stepMs: 24 * 60 * 60 * 1000 },
};

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

/**
 * Real request/latency series from the request log — replaces the sandbox's
 * synthetic usageSeries. Same envelope shape: totals{requests, errors,
 * p99_ms}, series[{t, requests, errors, p50_ms, p99_ms}], top_endpoints[].
 * Scoped to the calling partner's own traffic.
 */
@Injectable()
export class UsageService {
  constructor(
    @InjectRepository(RequestLogEntity)
    private readonly requestLogRepo: Repository<RequestLogEntity>,
  ) {}

  async usageSeries(partnerId: string, range: UsageRange) {
    const { count, stepMs } = RANGE_CONFIG[range];
    const now = Date.now();
    const endBucketStart = Math.floor(now / stepMs) * stepMs;
    const windowStart = endBucketStart - (count - 1) * stepMs;

    const rows = await this.requestLogRepo.find({
      where: { partner_id: partnerId, t: MoreThanOrEqual(new Date(windowStart).toISOString()) },
    });

    const buckets = Array.from({ length: count }, (_, i) => ({
      t: new Date(windowStart + i * stepMs).toISOString(),
      requests: 0,
      errors: 0,
      durations: [] as number[],
    }));
    const endpointTotals = new Map<string, { requests: number; errors: number }>();
    const allDurations: number[] = [];
    let totalRequests = 0;
    let totalErrors = 0;

    for (const row of rows) {
      const ts = new Date(row.t).getTime();
      const index = Math.floor((ts - windowStart) / stepMs);
      if (index < 0 || index >= count) continue;
      const bucket = buckets[index];
      const isError = row.status >= 400;
      bucket.requests += 1;
      if (isError) bucket.errors += 1;
      bucket.durations.push(row.duration_ms);
      allDurations.push(row.duration_ms);
      totalRequests += 1;
      if (isError) totalErrors += 1;

      const key = `${row.method} ${row.endpoint}`;
      const acc = endpointTotals.get(key) ?? { requests: 0, errors: 0 };
      acc.requests += 1;
      if (isError) acc.errors += 1;
      endpointTotals.set(key, acc);
    }

    allDurations.sort((a, b) => a - b);
    const series = buckets.map((bucket) => {
      const sorted = [...bucket.durations].sort((a, b) => a - b);
      return {
        t: bucket.t,
        requests: bucket.requests,
        errors: bucket.errors,
        p50_ms: percentile(sorted, 50),
        p99_ms: percentile(sorted, 99),
      };
    });

    const top_endpoints = [...endpointTotals.entries()]
      .map(([endpoint, stats]) => ({ endpoint, ...stats }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    return {
      object: 'usage',
      range,
      totals: {
        requests: totalRequests,
        errors: totalErrors,
        error_rate: totalRequests > 0 ? totalErrors / totalRequests : 0,
        p50_ms: percentile(allDurations, 50),
        p99_ms: percentile(allDurations, 99),
      },
      series,
      top_endpoints,
    };
  }
}
