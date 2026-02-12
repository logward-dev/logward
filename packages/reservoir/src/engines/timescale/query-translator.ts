import { QueryTranslator, type NativeQuery } from '../../core/query-translator.js';
import type { AggregateParams, AggregationInterval, QueryParams } from '../../core/types.js';

const INTERVAL_MAP: Record<AggregationInterval, string> = {
  '1m': '1 minute',
  '5m': '5 minutes',
  '15m': '15 minutes',
  '1h': '1 hour',
  '6h': '6 hours',
  '1d': '1 day',
  '1w': '1 week',
};

function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export class TimescaleQueryTranslator extends QueryTranslator {
  private schema: string;
  private tableName: string;

  constructor(schema = 'public', tableName = 'logs') {
    super();
    this.schema = schema;
    this.tableName = tableName;
  }

  private get table(): string {
    return `${this.schema}.${this.tableName}`;
  }

  translateQuery(params: QueryParams): NativeQuery {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    // organization_id (optional - logs-explorer doesn't have it in logs table)
    if (params.organizationId !== undefined) {
      idx = this.pushFilter(conditions, values, idx, 'organization_id', params.organizationId);
    }

    // project_id
    if (params.projectId !== undefined) {
      idx = this.pushFilter(conditions, values, idx, 'project_id', params.projectId);
    }

    // service
    if (params.service !== undefined) {
      idx = this.pushFilter(conditions, values, idx, 'service', params.service);
    }

    // level
    if (params.level !== undefined) {
      idx = this.pushFilter(conditions, values, idx, 'level', params.level);
    }

    // hostname (stored in metadata jsonb)
    if (params.hostname !== undefined) {
      if (Array.isArray(params.hostname)) {
        conditions.push(`metadata->>'hostname' = ANY($${idx})`);
        values.push(params.hostname);
        idx++;
      } else {
        conditions.push(`metadata->>'hostname' = $${idx}`);
        values.push(params.hostname);
        idx++;
      }
    }

    // trace_id
    if (params.traceId !== undefined) {
      conditions.push(`trace_id = $${idx}`);
      values.push(params.traceId);
      idx++;
    }

    // time range
    conditions.push(`time >= $${idx}`);
    values.push(params.from);
    idx++;
    conditions.push(`time <= $${idx}`);
    values.push(params.to);
    idx++;

    // search
    if (params.search) {
      if (params.searchMode === 'substring') {
        conditions.push(`message ILIKE $${idx}`);
        values.push(`%${escapeIlike(params.search)}%`);
        idx++;
      } else {
        conditions.push(`to_tsvector('english', message) @@ plainto_tsquery('english', $${idx})`);
        values.push(params.search);
        idx++;
      }
    }

    // cursor-based pagination: (time, id) < ($N, $N) for DESC ordering
    if (params.cursor) {
      try {
        const decoded = Buffer.from(params.cursor, 'base64').toString('utf-8');
        const commaIdx = decoded.indexOf(',');
        if (commaIdx > 0) {
          const cursorTime = decoded.slice(0, commaIdx);
          const cursorId = decoded.slice(commaIdx + 1);
          const parsedTime = new Date(cursorTime);
          if (cursorId && !isNaN(parsedTime.getTime())) {
            conditions.push(`(time, id) < ($${idx}, $${idx + 1})`);
            values.push(parsedTime, cursorId);
            idx += 2;
          }
        }
      } catch {
        // invalid cursor format - skip silently
      }
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    let query = `SELECT * FROM ${this.table}${where} ORDER BY time DESC, id DESC LIMIT $${idx}`;
    values.push(limit + 1);
    idx++;

    if (offset > 0) {
      query += ` OFFSET $${idx}`;
      values.push(offset);
      idx++;
    }

    return { query, parameters: values, metadata: { limit } };
  }

  translateAggregate(params: AggregateParams): NativeQuery {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const interval = INTERVAL_MAP[params.interval];
    values.push(interval);
    idx++;

    // organization_id (optional)
    if (params.organizationId !== undefined) {
      idx = this.pushFilter(conditions, values, idx, 'organization_id', params.organizationId);
    }

    if (params.projectId !== undefined) {
      idx = this.pushFilter(conditions, values, idx, 'project_id', params.projectId);
    }

    if (params.service !== undefined) {
      idx = this.pushFilter(conditions, values, idx, 'service', params.service);
    }

    conditions.push(`time >= $${idx}`);
    values.push(params.from);
    idx++;
    conditions.push(`time <= $${idx}`);
    values.push(params.to);
    idx++;

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    const query = `SELECT time_bucket($1, time) AS bucket, level, COUNT(*) AS total FROM ${this.table}${where} GROUP BY bucket, level ORDER BY bucket ASC`;

    return { query, parameters: values };
  }

  private pushFilter(
    conditions: string[],
    values: unknown[],
    idx: number,
    column: string,
    value: string | string[],
  ): number {
    if (Array.isArray(value)) {
      conditions.push(`${column} = ANY($${idx})`);
      values.push(value);
    } else {
      conditions.push(`${column} = $${idx}`);
      values.push(value);
    }
    return idx + 1;
  }
}
