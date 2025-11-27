import { sql } from 'kysely';
import { db } from '../../database/index.js';
import { connection } from '../../queue/connection.js';
import type { LogLevel } from '@logward/shared';

export interface LogQueryParams {
  projectId: string | string[]; // Support single or multiple projects
  service?: string | string[]; // Support single or multiple services
  level?: LogLevel | LogLevel[]; // Support single or multiple levels
  traceId?: string; // Filter by trace ID
  from?: Date;
  to?: Date;
  q?: string; // Full-text search
  limit?: number;
  offset?: number;
  cursor?: string;
}

export class QueryService {
  /**
   * Query logs with filters
   */
  async queryLogs(params: LogQueryParams) {
    const {
      projectId,
      service,
      level,
      traceId,
      from,
      to,
      q,
      limit = 100,
      offset = 0,
      cursor,
    } = params;

    // Generate cache key (include cursor)
    const cacheKey = `logs:query:${JSON.stringify(params)}`;
    const cached = await connection.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    let query = db.selectFrom('logs').selectAll();

    // Project filter - support single or multiple projects
    if (Array.isArray(projectId)) {
      query = query.where('project_id', 'in', projectId);
    } else {
      query = query.where('project_id', '=', projectId);
    }

    // Apply cursor filter if present
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
        const [cursorTimeStr, cursorId] = decoded.split(',');
        const cursorTime = new Date(cursorTimeStr);

        // WHERE (time, id) < (cursorTime, cursorId) for DESC order
        query = query.where((eb) => eb.or([
          eb('time', '<', cursorTime),
          eb.and([
            eb('time', '=', cursorTime),
            eb('id', '<', cursorId)
          ])
        ]));
      } catch (e) {
        console.warn('Invalid cursor format', cursor);
      }
    }

    // Apply filters
    if (service) {
      if (Array.isArray(service)) {
        // Multiple services - use IN clause
        query = query.where('service', 'in', service);
      } else {
        // Single service
        query = query.where('service', '=', service);
      }
    }

    if (level) {
      if (Array.isArray(level)) {
        // Multiple levels - use IN clause
        query = query.where('level', 'in', level);
      } else {
        // Single level
        query = query.where('level', '=', level);
      }
    }

    if (traceId) {
      query = query.where('trace_id', '=', traceId);
    }

    if (from) {
      query = query.where('time', '>=', from);
    }

    if (to) {
      query = query.where('time', '<=', to);
    }

    // Full-text search on message
    if (q) {
      query = query.where(
        sql<boolean>`to_tsvector('english', message) @@ plainto_tsquery('english', ${q})`
      );
    }

    // Get total count (only if no cursor, or separate query?)
    // For cursor pagination, total count is often omitted or separate.
    // But we'll keep it for now.
    const countQuery = query
      .clearSelect()
      .select(db.fn.count('time').as('count'));

    // Fetch limit + 1 to determine if there's a next page
    const fetchLimit = limit + 1;

    const [dbLogs, countResult] = await Promise.all([
      query
        .orderBy('time', 'desc')
        .orderBy('id', 'desc') // Deterministic sort
        .limit(fetchLimit)
        .offset(offset) // Keep offset support if cursor not used
        .execute(),
      countQuery.executeTakeFirst(),
    ]);

    let nextCursor: string | undefined;
    let logsToReturn = dbLogs;

    if (dbLogs.length > limit) {
      logsToReturn = dbLogs.slice(0, limit);
      const lastLog = logsToReturn[logsToReturn.length - 1];
      nextCursor = Buffer.from(`${lastLog.time.toISOString()},${lastLog.id}`).toString('base64');
    }

    // Map database fields (snake_case) to API format (camelCase)
    const logs = logsToReturn.map(log => ({
      id: log.id,
      time: log.time,
      projectId: log.project_id,
      service: log.service,
      level: log.level,
      message: log.message,
      metadata: log.metadata,
      traceId: log.trace_id,
    }));

    const result = {
      logs,
      total: Number(countResult?.count || 0),
      limit,
      offset,
      nextCursor,
    };

    // Cache result for 30 seconds
    await connection.setex(cacheKey, 30, JSON.stringify(result));

    return result;
  }

  /**
   * Get logs by trace ID
   */
  async getLogsByTraceId(projectId: string, traceId: string) {
    const logs = await db
      .selectFrom('logs')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('trace_id', '=', traceId)
      .orderBy('time', 'asc')
      .execute();

    return logs.map(log => ({
      id: log.id,
      time: log.time,
      projectId: log.project_id,
      service: log.service,
      level: log.level,
      message: log.message,
      metadata: log.metadata,
      traceId: log.trace_id,
    }));
  }

  /**
   * Get log context (logs before and after a specific timestamp)
   */
  async getLogContext(params: {
    projectId: string;
    time: Date;
    before?: number;
    after?: number;
  }) {
    const { projectId, time, before = 10, after = 10 } = params;

    // Get logs before the timestamp (ordered descending, then reverse)
    const logsBefore = await db
      .selectFrom('logs')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('time', '<', time)
      .orderBy('time', 'desc')
      .limit(before)
      .execute();

    // Get logs after the timestamp (ordered ascending)
    const logsAfter = await db
      .selectFrom('logs')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('time', '>', time)
      .orderBy('time', 'asc')
      .limit(after)
      .execute();

    // Get the current log at the exact timestamp (if exists)
    const currentLog = await db
      .selectFrom('logs')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('time', '=', time)
      .executeTakeFirst();

    // Map to API format
    const mapLog = (log: any) => ({
      id: log.id,
      time: log.time,
      projectId: log.project_id,
      service: log.service,
      level: log.level,
      message: log.message,
      metadata: log.metadata,
      traceId: log.trace_id,
    });

    return {
      before: logsBefore.reverse().map(mapLog), // Reverse to chronological order
      current: currentLog ? mapLog(currentLog) : null,
      after: logsAfter.map(mapLog),
    };
  }

  /**
   * Get aggregated statistics with time buckets
   */
  async getAggregatedStats(params: {
    projectId: string;
    service?: string;
    from: Date;
    to: Date;
    interval: '1m' | '5m' | '1h' | '1d';
  }) {
    const { projectId, service, from, to, interval } = params;

    // Map interval to PostgreSQL interval
    const intervalMap = {
      '1m': '1 minute',
      '5m': '5 minutes',
      '1h': '1 hour',
      '1d': '1 day',
    };

    let query = db
      .selectFrom('logs')
      .select([
        sql<Date>`time_bucket('${sql.raw(intervalMap[interval])}', time)`.as('bucket'),
        db.fn.count('time').as('total'),
        'level',
      ])
      .where('project_id', '=', projectId)
      .where('time', '>=', from)
      .where('time', '<=', to)
      .groupBy(['bucket', 'level'])
      .orderBy('bucket', 'asc');

    if (service) {
      query = query.where('service', '=', service);
    }

    const results = await query.execute();

    // Group by bucket
    const timeseries = results.reduce((acc, row) => {
      const bucketKey = row.bucket.toISOString();
      if (!acc[bucketKey]) {
        acc[bucketKey] = {
          bucket: row.bucket,
          total: 0,
          by_level: {} as Record<string, number>,
        };
      }
      acc[bucketKey].total += Number(row.total);
      acc[bucketKey].by_level[row.level] = Number(row.total);
      return acc;
    }, {} as Record<string, any>);

    return {
      timeseries: Object.values(timeseries),
    };
  }

  /**
   * Get top services by log count
   */
  async getTopServices(projectId: string, limit: number = 5, from?: Date, to?: Date) {
    let query = db
      .selectFrom('logs')
      .select([
        'service',
        db.fn.count('time').as('count'),
      ])
      .where('project_id', '=', projectId)
      .groupBy('service')
      .orderBy('count', 'desc')
      .limit(limit);

    if (from) {
      query = query.where('time', '>=', from);
    }

    if (to) {
      query = query.where('time', '<=', to);
    }

    return query.execute();
  }

  /**
   * Get top error messages
   */
  async getTopErrors(projectId: string, limit: number = 10, from?: Date, to?: Date) {
    let query = db
      .selectFrom('logs')
      .select([
        'message',
        db.fn.count('time').as('count'),
      ])
      .where('project_id', '=', projectId)
      .where('level', 'in', ['error', 'critical'])
      .groupBy('message')
      .orderBy('count', 'desc')
      .limit(limit);

    if (from) {
      query = query.where('time', '>=', from);
    }

    if (to) {
      query = query.where('time', '<=', to);
    }

    return query.execute();
  }
}

export const queryService = new QueryService();
