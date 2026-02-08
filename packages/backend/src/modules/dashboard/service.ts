import { db } from '../../database/index.js';
import { sql } from 'kysely';

export interface DashboardStats {
  totalLogsToday: {
    value: number;
    trend: number; // percentage change from yesterday
  };
  errorRate: {
    value: number; // percentage
    trend: number; // percentage point change from yesterday
  };
  activeServices: {
    value: number;
    trend: number; // change from yesterday
  };
  avgThroughput: {
    value: number; // logs per second (last hour)
    trend: number; // percentage change from previous hour
  };
}

export interface TimeseriesDataPoint {
  time: string;
  total: number;
  debug: number;
  info: number;
  warn: number;
  error: number;
  critical: number;
}

export interface RecentError {
  time: string;
  service: string;
  level: 'error' | 'critical';
  message: string;
  projectId: string;
  traceId?: string;
}

export interface TimelineEvent {
  time: string;
  alerts: number;
  detections: number;
  alertDetails: Array<{ ruleName: string; alertType: string; logCount: number }>;
  detectionsBySeverity: { critical: number; high: number; medium: number; low: number };
}

class DashboardService {
  /**
   * Get dashboard statistics for an organization
   *
   * PERFORMANCE: Uses continuous aggregates (logs_hourly_stats) for historical data
   * and real-time queries only for the last hour. This provides 10-50x speedup
   * on large datasets (millions of logs).
   *
   * Metrics calculated:
   * - Total logs today (from aggregate + recent)
   * - Error rate (from aggregate + recent)
   * - Active services (count distinct from aggregate - approximation)
   * - Throughput (logs/sec in last hour - real-time)
   */
  async getStats(organizationId: string): Promise<DashboardStats> {
    // Get all project IDs for this organization
    const projects = await db
      .selectFrom('projects')
      .select('id')
      .where('organization_id', '=', organizationId)
      .execute();

    const projectIds = projects.map((p) => p.id);

    if (projectIds.length === 0) {
      return {
        totalLogsToday: { value: 0, trend: 0 },
        errorRate: { value: 0, trend: 0 },
        activeServices: { value: 0, trend: 0 },
        avgThroughput: { value: 0, trend: 0 },
      };
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const lastHourStart = new Date(now.getTime() - 60 * 60 * 1000);
    const prevHourStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    // Try continuous aggregate first (10-50x faster)
    try {
      return await this.getStatsFromAggregate(
        projectIds,
        todayStart,
        yesterdayStart,
        lastHourStart,
        prevHourStart
      );
    } catch {
      // Fallback to raw logs if aggregate not available
      return await this.getStatsFromRawLogs(
        projectIds,
        todayStart,
        yesterdayStart,
        lastHourStart,
        prevHourStart
      );
    }
  }

  /**
   * Get stats using continuous aggregates (fast path)
   */
  private async getStatsFromAggregate(
    projectIds: string[],
    todayStart: Date,
    yesterdayStart: Date,
    lastHourStart: Date,
    prevHourStart: Date
  ): Promise<DashboardStats> {
    // Query aggregate for historical data (>1 hour old) and raw logs for recent data in parallel
    const [todayAggregateStats, recentStats, yesterdayAggregateStats, prevHourStats] = await Promise.all([
      // Today's historical stats from aggregate (today start to 1 hour ago)
      db
        .selectFrom('logs_hourly_stats')
        .select([
          sql<string>`COALESCE(SUM(log_count), 0)`.as('total'),
          sql<string>`COALESCE(SUM(log_count) FILTER (WHERE level IN ('error', 'critical')), 0)`.as('errors'),
          sql<string>`COUNT(DISTINCT service)`.as('services'),
        ])
        .where('project_id', 'in', projectIds)
        .where('bucket', '>=', todayStart)
        .where('bucket', '<', lastHourStart)
        .executeTakeFirst(),

      // Recent stats from raw logs (last hour - not yet in aggregate)
      db
        .selectFrom('logs')
        .select([
          sql<string>`COUNT(*)`.as('total'),
          sql<string>`COUNT(*) FILTER (WHERE level IN ('error', 'critical'))`.as('errors'),
          sql<string>`COUNT(DISTINCT service)`.as('services'),
        ])
        .where('project_id', 'in', projectIds)
        .where('time', '>=', lastHourStart)
        .executeTakeFirst(),

      // Yesterday's stats from aggregate
      db
        .selectFrom('logs_hourly_stats')
        .select([
          sql<string>`COALESCE(SUM(log_count), 0)`.as('total'),
          sql<string>`COALESCE(SUM(log_count) FILTER (WHERE level IN ('error', 'critical')), 0)`.as('errors'),
          sql<string>`COUNT(DISTINCT service)`.as('services'),
        ])
        .where('project_id', 'in', projectIds)
        .where('bucket', '>=', yesterdayStart)
        .where('bucket', '<', todayStart)
        .executeTakeFirst(),

      // Previous hour stats from raw logs (for throughput trend)
      db
        .selectFrom('logs')
        .select([sql<string>`COUNT(*)`.as('total')])
        .where('project_id', 'in', projectIds)
        .where('time', '>=', prevHourStart)
        .where('time', '<', lastHourStart)
        .executeTakeFirst(),
    ]);

    // Combine aggregate + recent stats
    // Note: SQL results come as strings from Kysely raw sql fragments
    const todayCount = Number(todayAggregateStats?.total ?? 0) + Number(recentStats?.total ?? 0);
    const todayErrorCount = Number(todayAggregateStats?.errors ?? 0) + Number(recentStats?.errors ?? 0);
    const yesterdayCount = Number(yesterdayAggregateStats?.total ?? 0);
    const yesterdayErrorCount = Number(yesterdayAggregateStats?.errors ?? 0);

    // For services, we add distinct counts from aggregate and recent periods.
    // This may slightly overcount if the same service appears in both periods,
    // but provides a reasonable approximation without scanning millions of rows.
    const todayServiceCount = Number(todayAggregateStats?.services ?? 0) + Number(recentStats?.services ?? 0);
    const yesterdayServiceCount = Number(yesterdayAggregateStats?.services ?? 0);

    const lastHourCount = Number(recentStats?.total ?? 0);
    const prevHourCount = Number(prevHourStats?.total ?? 0);

    return this.calculateStats(
      todayCount,
      yesterdayCount,
      todayErrorCount,
      yesterdayErrorCount,
      todayServiceCount,
      yesterdayServiceCount,
      lastHourCount,
      prevHourCount
    );
  }

  /**
   * Get stats from raw logs (fallback path - slower but always works)
   */
  private async getStatsFromRawLogs(
    projectIds: string[],
    todayStart: Date,
    yesterdayStart: Date,
    lastHourStart: Date,
    prevHourStart: Date
  ): Promise<DashboardStats> {
    const [todayStats, yesterdayStats] = await Promise.all([
      db
        .selectFrom('logs')
        .select([
          sql<string>`COUNT(*)`.as('total'),
          sql<string>`COUNT(*) FILTER (WHERE level IN ('error', 'critical'))`.as('errors'),
          sql<string>`COUNT(DISTINCT service)`.as('services'),
          sql<string>`COUNT(*) FILTER (WHERE time >= ${lastHourStart})`.as('last_hour'),
          sql<string>`COUNT(*) FILTER (WHERE time >= ${prevHourStart} AND time < ${lastHourStart})`.as('prev_hour'),
        ])
        .where('project_id', 'in', projectIds)
        .where('time', '>=', todayStart)
        .executeTakeFirst(),

      db
        .selectFrom('logs')
        .select([
          sql<string>`COUNT(*)`.as('total'),
          sql<string>`COUNT(*) FILTER (WHERE level IN ('error', 'critical'))`.as('errors'),
          sql<string>`COUNT(DISTINCT service)`.as('services'),
        ])
        .where('project_id', 'in', projectIds)
        .where('time', '>=', yesterdayStart)
        .where('time', '<', todayStart)
        .executeTakeFirst(),
    ]);

    return this.calculateStats(
      Number(todayStats?.total ?? 0),
      Number(yesterdayStats?.total ?? 0),
      Number(todayStats?.errors ?? 0),
      Number(yesterdayStats?.errors ?? 0),
      Number(todayStats?.services ?? 0),
      Number(yesterdayStats?.services ?? 0),
      Number(todayStats?.last_hour ?? 0),
      Number(todayStats?.prev_hour ?? 0)
    );
  }

  /**
   * Calculate final stats from counts
   */
  private calculateStats(
    todayCount: number,
    yesterdayCount: number,
    todayErrorCount: number,
    yesterdayErrorCount: number,
    todayServiceCount: number,
    yesterdayServiceCount: number,
    lastHourCount: number,
    prevHourCount: number
  ): DashboardStats {
    const logsTrend = yesterdayCount > 0 ? ((todayCount - yesterdayCount) / yesterdayCount) * 100 : 0;
    const todayErrorRate = todayCount > 0 ? (todayErrorCount / todayCount) * 100 : 0;
    const yesterdayErrorRate = yesterdayCount > 0 ? (yesterdayErrorCount / yesterdayCount) * 100 : 0;
    const errorRateTrend = todayErrorRate - yesterdayErrorRate;
    const servicesTrend = todayServiceCount - yesterdayServiceCount;
    const lastHourThroughput = lastHourCount / 3600;
    const prevHourThroughput = prevHourCount / 3600;
    const throughputTrend =
      prevHourThroughput > 0 ? ((lastHourThroughput - prevHourThroughput) / prevHourThroughput) * 100 : 0;

    return {
      totalLogsToday: {
        value: todayCount,
        trend: logsTrend,
      },
      errorRate: {
        value: todayErrorRate,
        trend: errorRateTrend,
      },
      activeServices: {
        value: todayServiceCount,
        trend: servicesTrend,
      },
      avgThroughput: {
        value: lastHourThroughput,
        trend: throughputTrend,
      },
    };
  }

  /**
   * Get timeseries data for dashboard chart (last 24 hours, hourly buckets)
   *
   * Performance optimization: Uses pre-computed continuous aggregate (logs_hourly_stats)
   * for historical data (>1 hour old), with real-time query for the most recent hour.
   * This provides 10-50x faster queries for dashboard charts.
   */
  async getTimeseries(organizationId: string): Promise<TimeseriesDataPoint[]> {
    // Get all project IDs for this organization
    const projects = await db
      .selectFrom('projects')
      .select('id')
      .where('organization_id', '=', organizationId)
      .execute();

    const projectIds = projects.map((p) => p.id);

    if (projectIds.length === 0) {
      return [];
    }

    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

    // Try to use continuous aggregate for historical data (>1 hour old)
    // This is much faster than real-time aggregation
    let historicalResults: Array<{ bucket: string | Date; level: string; count: string }> = [];
    let recentResults: Array<{ bucket: string; level: string; count: string }> = [];

    try {
      // Query pre-computed hourly stats (fast path)
      historicalResults = await db
        .selectFrom('logs_hourly_stats')
        .select([
          'bucket',
          'level',
          sql<string>`sum(log_count)`.as('count'),
        ])
        .where('project_id', 'in', projectIds)
        .where('bucket', '>=', last24Hours)
        .where('bucket', '<', lastHour)
        .groupBy(['bucket', 'level'])
        .orderBy('bucket', 'asc')
        .execute();
    } catch {
      // Continuous aggregate not available, fall back to regular query
      historicalResults = await db
        .selectFrom('logs')
        .select([
          sql<string>`time_bucket('1 hour', time)`.as('bucket'),
          'level',
          sql<string>`count(*)`.as('count'),
        ])
        .where('project_id', 'in', projectIds)
        .where('time', '>=', last24Hours)
        .where('time', '<', lastHour)
        .groupBy(['bucket', 'level'])
        .orderBy('bucket', 'asc')
        .execute();
    }

    // Query real-time data for the last hour (not yet aggregated)
    recentResults = await db
      .selectFrom('logs')
      .select([
        sql<string>`time_bucket('1 hour', time)`.as('bucket'),
        'level',
        sql<string>`count(*)`.as('count'),
      ])
      .where('project_id', 'in', projectIds)
      .where('time', '>=', lastHour)
      .groupBy(['bucket', 'level'])
      .orderBy('bucket', 'asc')
      .execute();

    // Combine historical and recent results
    const allResults = [...historicalResults, ...recentResults];

    // Transform to timeseries format
    const bucketMap = new Map<string, TimeseriesDataPoint>();

    for (const row of allResults) {
      // Normalize bucket timestamp to ISO string for consistent Map keys
      const bucketKey = new Date(row.bucket).toISOString();

      if (!bucketMap.has(bucketKey)) {
        bucketMap.set(bucketKey, {
          time: bucketKey,
          total: 0,
          debug: 0,
          info: 0,
          warn: 0,
          error: 0,
          critical: 0,
        });
      }

      const point = bucketMap.get(bucketKey)!;
      const count = Number(row.count ?? 0);
      point.total += count;

      switch (row.level) {
        case 'debug':
          point.debug += count;
          break;
        case 'info':
          point.info += count;
          break;
        case 'warn':
          point.warn += count;
          break;
        case 'error':
          point.error += count;
          break;
        case 'critical':
          point.critical += count;
          break;
      }
    }

    return Array.from(bucketMap.values());
  }

  /**
   * Get top services by log count (organization-wide, last 7 days)
   *
   * PERFORMANCE: Uses continuous aggregate (logs_daily_stats) for historical data
   * and raw logs only for the most recent day. This provides 10-50x speedup.
   */
  async getTopServices(organizationId: string, limit: number = 5): Promise<Array<{ name: string; count: number; percentage: number }>> {
    const projects = await db
      .selectFrom('projects')
      .select('id')
      .where('organization_id', '=', organizationId)
      .execute();

    const projectIds = projects.map((p) => p.id);

    if (projectIds.length === 0) {
      return [];
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    try {
      return await this.getTopServicesFromAggregate(projectIds, sevenDaysAgo, oneDayAgo, limit);
    } catch {
      // Fallback to raw logs
      return await this.getTopServicesFromRawLogs(projectIds, sevenDaysAgo, limit);
    }
  }

  /**
   * Get top services using continuous aggregates (fast path)
   */
  private async getTopServicesFromAggregate(
    projectIds: string[],
    sevenDaysAgo: Date,
    oneDayAgo: Date,
    limit: number
  ): Promise<Array<{ name: string; count: number; percentage: number }>> {
    // Query historical data from daily aggregate + recent data from raw logs in parallel
    const [historicalServices, recentServices] = await Promise.all([
      // 7 days ago to 1 day ago (use daily stats)
      db
        .selectFrom('logs_daily_stats')
        .select(['service', sql<string>`SUM(log_count)`.as('count')])
        .where('project_id', 'in', projectIds)
        .where('bucket', '>=', sevenDaysAgo)
        .where('bucket', '<', oneDayAgo)
        .groupBy('service')
        .execute(),

      // Last 24 hours (use raw logs - not yet in daily aggregate)
      db
        .selectFrom('logs')
        .select(['service', sql<string>`COUNT(*)`.as('count')])
        .where('project_id', 'in', projectIds)
        .where('time', '>=', oneDayAgo)
        .groupBy('service')
        .execute(),
    ]);

    // Merge service counts
    const serviceMap = new Map<string, number>();

    for (const row of historicalServices) {
      serviceMap.set(row.service, Number(row.count ?? 0));
    }

    for (const row of recentServices) {
      const existing = serviceMap.get(row.service) ?? 0;
      serviceMap.set(row.service, existing + Number(row.count ?? 0));
    }

    const total = Array.from(serviceMap.values()).reduce((sum, count) => sum + count, 0);

    if (total === 0) {
      return [];
    }

    // Sort and limit
    return Array.from(serviceMap.entries())
      .map(([service, count]) => ({
        name: service,
        count,
        percentage: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Get top services from raw logs (fallback path)
   */
  private async getTopServicesFromRawLogs(
    projectIds: string[],
    sevenDaysAgo: Date,
    limit: number
  ): Promise<Array<{ name: string; count: number; percentage: number }>> {
    const totalResult = await db
      .selectFrom('logs')
      .select(sql<string>`COUNT(*)`.as('total'))
      .where('project_id', 'in', projectIds)
      .where('time', '>=', sevenDaysAgo)
      .executeTakeFirst();

    const total = Number(totalResult?.total ?? 0);

    if (total === 0) {
      return [];
    }

    const services = await db
      .selectFrom('logs')
      .select(['service', sql<string>`COUNT(*)`.as('count')])
      .where('project_id', 'in', projectIds)
      .where('time', '>=', sevenDaysAgo)
      .groupBy('service')
      .orderBy('count', 'desc')
      .limit(limit)
      .execute();

    return services.map((s) => {
      const count = Number(s.count ?? 0);
      return {
        name: s.service,
        count,
        percentage: Math.round((count / total) * 100),
      };
    });
  }

  /**
   * Get timeline events (alerts + detections) for last 24 hours, bucketed by hour.
   * Used to overlay markers on the dashboard logs chart.
   */
  async getTimelineEvents(organizationId: string): Promise<TimelineEvent[]> {
    const projects = await db
      .selectFrom('projects')
      .select('id')
      .where('organization_id', '=', organizationId)
      .execute();

    const projectIds = projects.map((p) => p.id);

    if (projectIds.length === 0) {
      return [];
    }

    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

    // Query alerts from alert_history JOIN alert_rules (last 24h)
    const alertRows = await db
      .selectFrom('alert_history')
      .innerJoin('alert_rules', 'alert_rules.id', 'alert_history.rule_id')
      .select([
        sql<string>`time_bucket('1 hour', alert_history.triggered_at)`.as('bucket'),
        'alert_rules.name as rule_name',
        sql<string>`COALESCE(alert_rules.alert_type, 'threshold')`.as('alert_type'),
        'alert_history.log_count',
      ])
      .where('alert_rules.organization_id', '=', organizationId)
      .where('alert_history.triggered_at', '>=', last24Hours)
      .execute();

    // Query detections - try continuous aggregate first, fallback to raw
    let detectionRows: Array<{ bucket: string | Date; severity: string; count: string }> = [];

    try {
      // Historical from aggregate + recent from raw
      const [historicalDetections, recentDetections] = await Promise.all([
        db
          .selectFrom('detection_events_hourly_stats')
          .select([
            'bucket',
            'severity',
            sql<string>`SUM(detection_count)`.as('count'),
          ])
          .where('organization_id', '=', organizationId)
          .where('bucket', '>=', last24Hours)
          .where('bucket', '<', lastHour)
          .groupBy(['bucket', 'severity'])
          .execute(),

        db
          .selectFrom('detection_events')
          .select([
            sql<string>`time_bucket('1 hour', time)`.as('bucket'),
            'severity',
            sql<string>`COUNT(*)`.as('count'),
          ])
          .where('organization_id', '=', organizationId)
          .where('time', '>=', lastHour)
          .groupBy(['bucket', 'severity'])
          .execute(),
      ]);

      detectionRows = [...historicalDetections, ...recentDetections];
    } catch {
      // Fallback: query raw detection_events for full 24h
      detectionRows = await db
        .selectFrom('detection_events')
        .select([
          sql<string>`time_bucket('1 hour', time)`.as('bucket'),
          'severity',
          sql<string>`COUNT(*)`.as('count'),
        ])
        .where('organization_id', '=', organizationId)
        .where('time', '>=', last24Hours)
        .groupBy(['bucket', 'severity'])
        .execute();
    }

    // Merge into hourly buckets
    const bucketMap = new Map<string, TimelineEvent>();

    for (const row of alertRows) {
      const bucketKey = new Date(row.bucket).toISOString();
      if (!bucketMap.has(bucketKey)) {
        bucketMap.set(bucketKey, {
          time: bucketKey,
          alerts: 0,
          detections: 0,
          alertDetails: [],
          detectionsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        });
      }
      const event = bucketMap.get(bucketKey)!;
      event.alerts += 1;
      event.alertDetails.push({
        ruleName: row.rule_name,
        alertType: row.alert_type,
        logCount: row.log_count,
      });
    }

    for (const row of detectionRows) {
      const bucketKey = new Date(row.bucket).toISOString();
      if (!bucketMap.has(bucketKey)) {
        bucketMap.set(bucketKey, {
          time: bucketKey,
          alerts: 0,
          detections: 0,
          alertDetails: [],
          detectionsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
        });
      }
      const event = bucketMap.get(bucketKey)!;
      const count = Number(row.count ?? 0);
      event.detections += count;

      const sev = (row.severity || '').toLowerCase();
      if (sev === 'critical') event.detectionsBySeverity.critical += count;
      else if (sev === 'high') event.detectionsBySeverity.high += count;
      else if (sev === 'medium') event.detectionsBySeverity.medium += count;
      else event.detectionsBySeverity.low += count;
    }

    return Array.from(bucketMap.values());
  }

  /**
   * Get recent errors (last 10 error/critical logs)
   */
  async getRecentErrors(organizationId: string): Promise<RecentError[]> {
    // Get all project IDs for this organization
    const projects = await db
      .selectFrom('projects')
      .select('id')
      .where('organization_id', '=', organizationId)
      .execute();

    const projectIds = projects.map((p) => p.id);

    if (projectIds.length === 0) {
      return [];
    }

    const errors = await db
      .selectFrom('logs')
      .select(['time', 'service', 'level', 'message', 'project_id', 'trace_id'])
      .where('project_id', 'in', projectIds)
      .where('level', 'in', ['error', 'critical'])
      .orderBy('time', 'desc')
      .limit(10)
      .execute();

    return errors.map((e) => ({
      time: e.time.toISOString(),
      service: e.service,
      level: e.level as 'error' | 'critical',
      message: e.message,
      projectId: e.project_id || '',
      traceId: e.trace_id || undefined,
    }));
  }
}

export const dashboardService = new DashboardService();
