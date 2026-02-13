import pg from 'pg';
import { StorageEngine } from '../../core/storage-engine.js';
import type {
  LogRecord,
  LogLevel,
  StoredLogRecord,
  QueryParams,
  QueryResult,
  AggregateParams,
  AggregateResult,
  IngestResult,
  IngestReturningResult,
  HealthStatus,
  EngineCapabilities,
  StorageSegment,
  TimeBucket,
  StorageConfig,
  GetByIdParams,
  GetByIdsParams,
  CountParams,
  CountResult,
  DistinctParams,
  DistinctResult,
  TopValuesParams,
  TopValuesResult,
  DeleteByTimeRangeParams,
  DeleteResult,
  SpanRecord,
  TraceRecord,
  SpanQueryParams,
  SpanQueryResult,
  TraceQueryParams,
  TraceQueryResult,
  IngestSpansResult,
  ServiceDependencyResult,
  ServiceDependency,
  DeleteSpansByTimeRangeParams,
  SpanKind,
  SpanStatusCode,
} from '../../core/types.js';
import { TimescaleQueryTranslator } from './query-translator.js';

const { Pool } = pg;

function sanitizeNull(value: string): string {
  return value.includes('\0') ? value.replace(/\0/g, '') : value;
}

export interface TimescaleEngineOptions {
  /** Use an existing pg.Pool instead of creating a new one */
  pool?: pg.Pool;
  /** Table name to use (default: 'logs') */
  tableName?: string;
  /** Skip schema initialization (use when connecting to existing DB) */
  skipInitialize?: boolean;
  /** Include organization_id column in INSERT/queries (default: false) */
  hasOrganizationId?: boolean;
}

export class TimescaleEngine extends StorageEngine {
  private pool: pg.Pool | null = null;
  private ownsPool: boolean;
  private translator: TimescaleQueryTranslator;
  private options: TimescaleEngineOptions;

  private get schema(): string {
    return this.config.schema ?? 'public';
  }

  private get tableName(): string {
    return this.options.tableName ?? 'logs';
  }

  constructor(config: StorageConfig, options: TimescaleEngineOptions = {}) {
    super(config);
    this.options = options;
    this.ownsPool = !options.pool;
    if (options.pool) {
      this.pool = options.pool;
    }
    this.translator = new TimescaleQueryTranslator(this.schema, this.tableName);
  }

  async connect(): Promise<void> {
    if (this.pool) return;
    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      max: this.config.poolSize ?? 10,
      connectionTimeoutMillis: this.config.connectionTimeoutMs ?? 5000,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
    });
    if (typeof this.pool.on === 'function') {
      this.pool.on('error', (err) => {
        console.error('[TimescaleEngine] Pool error:', err.message);
      });
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool && this.ownsPool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      await this.getPool().query('SELECT 1');
      const responseTimeMs = Date.now() - start;
      let status: HealthStatus['status'] = 'healthy';
      if (responseTimeMs >= 200) status = 'unhealthy';
      else if (responseTimeMs >= 50) status = 'degraded';
      return { status, engine: 'timescale', connected: true, responseTimeMs };
    } catch (err) {
      return {
        status: 'unhealthy',
        engine: 'timescale',
        connected: false,
        responseTimeMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async initialize(): Promise<void> {
    if (this.options.skipInitialize) return;

    const pool = this.getPool();
    const s = this.schema;
    const t = this.tableName;

    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${s}`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${s}.${t} (
        time TIMESTAMPTZ NOT NULL,
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        project_id TEXT NOT NULL,
        service TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        trace_id TEXT,
        span_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // hypertable (ignore error if already exists)
    try {
      await pool.query(
        `SELECT create_hypertable('${s}.${t}', 'time', if_not_exists => TRUE)`,
      );
    } catch {
      // not a TimescaleDB instance or already a hypertable
    }

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${t}_service_time ON ${s}.${t} (service, time DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${t}_level_time ON ${s}.${t} (level, time DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${t}_trace_id ON ${s}.${t} (trace_id) WHERE trace_id IS NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${t}_span_id ON ${s}.${t} (span_id) WHERE span_id IS NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${t}_fulltext ON ${s}.${t} USING GIN (to_tsvector('english', message))`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${t}_composite ON ${s}.${t} (project_id, time DESC, id DESC)`);

    try {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_${t}_message_trgm ON ${s}.${t} USING GIN (message gin_trgm_ops)`);
    } catch {
      // pg_trgm not available
    }

    // compression policy (ignore error if not supported)
    try {
      await pool.query(`ALTER TABLE ${s}.${t} SET (timescaledb.compress, timescaledb.compress_segmentby = 'project_id', timescaledb.compress_orderby = 'time DESC, id DESC')`);
      await pool.query(`SELECT add_compression_policy('${s}.${t}', INTERVAL '7 days', if_not_exists => TRUE)`);
    } catch {
      // compression not available
    }
  }

  async migrate(_version: string): Promise<void> {
    // placeholder for future migrations
  }

  async ingest(logs: LogRecord[]): Promise<IngestResult> {
    if (logs.length === 0) {
      return { ingested: 0, failed: 0, durationMs: 0 };
    }

    const start = Date.now();
    const pool = this.getPool();
    const { query, values } = this.buildInsertQuery(logs);

    try {
      await pool.query(query, values);
      return { ingested: logs.length, failed: 0, durationMs: Date.now() - start };
    } catch (err) {
      return {
        ingested: 0,
        failed: logs.length,
        durationMs: Date.now() - start,
        errors: [{ index: 0, error: err instanceof Error ? err.message : String(err) }],
      };
    }
  }

  async ingestReturning(logs: LogRecord[]): Promise<IngestReturningResult> {
    if (logs.length === 0) {
      return { ingested: 0, failed: 0, durationMs: 0, rows: [] };
    }

    const start = Date.now();
    const pool = this.getPool();
    const { query, values } = this.buildInsertQuery(logs, true);

    try {
      const result = await pool.query(query, values);
      const rows = result.rows.map(mapRowToStoredLogRecord);
      return { ingested: logs.length, failed: 0, durationMs: Date.now() - start, rows };
    } catch (err) {
      return {
        ingested: 0,
        failed: logs.length,
        durationMs: Date.now() - start,
        rows: [],
        errors: [{ index: 0, error: err instanceof Error ? err.message : String(err) }],
      };
    }
  }

  async query(params: QueryParams): Promise<QueryResult<StoredLogRecord>> {
    const start = Date.now();
    const pool = this.getPool();
    const native = this.translator.translateQuery(params);
    const limit = (native.metadata?.limit as number) ?? 50;
    const offset = params.offset ?? 0;

    const result = await pool.query(native.query as string, native.parameters);
    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;

    let nextCursor: string | undefined;
    if (hasMore) {
      const last = rows[rows.length - 1];
      const cursorStr = `${(last.time as Date).toISOString()},${last.id}`;
      nextCursor = Buffer.from(cursorStr).toString('base64');
    }

    const logs = rows.map(mapRowToStoredLogRecord);

    return {
      logs,
      total: rows.length,
      hasMore,
      limit,
      offset,
      nextCursor,
      executionTimeMs: Date.now() - start,
    };
  }

  async aggregate(params: AggregateParams): Promise<AggregateResult> {
    const start = Date.now();
    const pool = this.getPool();
    const native = this.translator.translateAggregate(params);

    const result = await pool.query(native.query as string, native.parameters);

    const bucketMap = new Map<string, TimeBucket>();

    for (const row of result.rows) {
      const key = (row.bucket as Date).toISOString();
      let bucket = bucketMap.get(key);
      if (!bucket) {
        bucket = { bucket: row.bucket as Date, total: 0, byLevel: {} as Record<LogLevel, number> };
        bucketMap.set(key, bucket);
      }
      const count = Number(row.total);
      bucket.total += count;
      if (row.level && bucket.byLevel) {
        bucket.byLevel[row.level as LogLevel] = count;
      }
    }

    const timeseries = Array.from(bucketMap.values());
    const total = timeseries.reduce((sum, b) => sum + b.total, 0);

    return {
      timeseries,
      total,
      executionTimeMs: Date.now() - start,
    };
  }

  async getById(params: GetByIdParams): Promise<StoredLogRecord | null> {
    const pool = this.getPool();
    const result = await pool.query(
      `SELECT * FROM ${this.schema}.${this.tableName} WHERE id = $1 AND project_id = $2 LIMIT 1`,
      [params.id, params.projectId],
    );
    return result.rows.length > 0 ? mapRowToStoredLogRecord(result.rows[0]) : null;
  }

  async getByIds(params: GetByIdsParams): Promise<StoredLogRecord[]> {
    if (params.ids.length === 0) return [];
    const pool = this.getPool();
    const result = await pool.query(
      `SELECT * FROM ${this.schema}.${this.tableName} WHERE id = ANY($1::uuid[]) AND project_id = $2 ORDER BY time DESC`,
      [params.ids, params.projectId],
    );
    return result.rows.map(mapRowToStoredLogRecord);
  }

  async count(params: CountParams): Promise<CountResult> {
    const start = Date.now();
    const pool = this.getPool();
    const native = this.translator.translateCount(params);
    const result = await pool.query(native.query as string, native.parameters);
    return {
      count: Number(result.rows[0]?.count ?? 0),
      executionTimeMs: Date.now() - start,
    };
  }

  async distinct(params: DistinctParams): Promise<DistinctResult> {
    const start = Date.now();
    const pool = this.getPool();
    const native = this.translator.translateDistinct(params);
    const result = await pool.query(native.query as string, native.parameters);
    return {
      values: result.rows.map((row: Record<string, unknown>) => row.value as string).filter((v) => v != null),
      executionTimeMs: Date.now() - start,
    };
  }

  async topValues(params: TopValuesParams): Promise<TopValuesResult> {
    const start = Date.now();
    const pool = this.getPool();
    const native = this.translator.translateTopValues(params);
    const result = await pool.query(native.query as string, native.parameters);
    return {
      values: result.rows.map((row: Record<string, unknown>) => ({
        value: row.value as string,
        count: Number(row.count),
      })),
      executionTimeMs: Date.now() - start,
    };
  }

  async deleteByTimeRange(params: DeleteByTimeRangeParams): Promise<DeleteResult> {
    const start = Date.now();
    const pool = this.getPool();
    const native = this.translator.translateDelete(params);
    const result = await pool.query(native.query as string, native.parameters);
    return {
      deleted: Number(result.rowCount ?? 0),
      executionTimeMs: Date.now() - start,
    };
  }

  getCapabilities(): EngineCapabilities {
    return {
      engine: 'timescale',
      supportsFullTextSearch: true,
      supportsAggregations: true,
      supportsStreaming: true,
      supportsTransactions: true,
      maxBatchSize: 10000,
      nativeCompression: true,
      nativeTiering: false,
      supportedOperators: ['=', '!=', '>', '>=', '<', '<=', 'in', 'not in', 'like', 'not like'],
      supportedIntervals: ['1m', '5m', '15m', '1h', '6h', '1d', '1w'],
    };
  }

  async getSegments(_startTime: Date, _endTime: Date): Promise<StorageSegment[]> {
    return [];
  }

  private getPool(): pg.Pool {
    if (!this.pool) {
      throw new Error('Not connected. Call connect() first.');
    }
    return this.pool;
  }

  private buildInsertQuery(logs: LogRecord[], returning = false): { query: string; values: unknown[] } {
    const s = this.schema;
    const t = this.tableName;

    const times: Date[] = [];
    const projectIds: string[] = [];
    const services: string[] = [];
    const levels: string[] = [];
    const messages: string[] = [];
    const metadatas: (string | null)[] = [];
    const traceIds: (string | null)[] = [];
    const spanIds: (string | null)[] = [];

    for (const log of logs) {
      times.push(log.time);
      projectIds.push(sanitizeNull(log.projectId));
      services.push(sanitizeNull(log.service));
      levels.push(log.level);
      messages.push(sanitizeNull(log.message));
      metadatas.push(log.metadata ? JSON.stringify(log.metadata) : null);
      traceIds.push(log.traceId ?? null);
      spanIds.push(log.spanId ?? null);
    }

    let query = `INSERT INTO ${s}.${t} (time, project_id, service, level, message, metadata, trace_id, span_id) SELECT * FROM UNNEST($1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::text[], $6::jsonb[], $7::text[], $8::text[])`;
    if (returning) {
      query += ' RETURNING *';
    }

    return { query, values: [times, projectIds, services, levels, messages, metadatas, traceIds, spanIds] };
  }

  // =========================================================================
  // Span & Trace Operations
  // =========================================================================

  async ingestSpans(spans: SpanRecord[]): Promise<IngestSpansResult> {
    if (spans.length === 0) return { ingested: 0, failed: 0, durationMs: 0 };

    const start = Date.now();
    const pool = this.getPool();
    const s = this.schema;

    const times: Date[] = [];
    const spanIds: string[] = [];
    const traceIds: string[] = [];
    const parentSpanIds: (string | null)[] = [];
    const orgIds: (string | null)[] = [];
    const projectIds: string[] = [];
    const serviceNames: string[] = [];
    const operationNames: string[] = [];
    const startTimes: Date[] = [];
    const endTimes: Date[] = [];
    const durations: number[] = [];
    const kinds: (string | null)[] = [];
    const statusCodes: (string | null)[] = [];
    const statusMessages: (string | null)[] = [];
    const attributesJsons: (string | null)[] = [];
    const eventsJsons: (string | null)[] = [];
    const linksJsons: (string | null)[] = [];
    const resourceAttrsJsons: (string | null)[] = [];

    for (const span of spans) {
      times.push(span.time);
      spanIds.push(span.spanId);
      traceIds.push(span.traceId);
      parentSpanIds.push(span.parentSpanId ?? null);
      orgIds.push(span.organizationId ?? null);
      projectIds.push(span.projectId);
      serviceNames.push(sanitizeNull(span.serviceName));
      operationNames.push(sanitizeNull(span.operationName));
      startTimes.push(span.startTime);
      endTimes.push(span.endTime);
      durations.push(span.durationMs);
      kinds.push(span.kind ?? null);
      statusCodes.push(span.statusCode ?? null);
      statusMessages.push(span.statusMessage ? sanitizeNull(span.statusMessage) : null);
      attributesJsons.push(span.attributes ? JSON.stringify(span.attributes) : null);
      eventsJsons.push(span.events ? JSON.stringify(span.events) : null);
      linksJsons.push(span.links ? JSON.stringify(span.links) : null);
      resourceAttrsJsons.push(span.resourceAttributes ? JSON.stringify(span.resourceAttributes) : null);
    }

    try {
      await pool.query(
        `INSERT INTO ${s}.spans (
          time, span_id, trace_id, parent_span_id, organization_id, project_id,
          service_name, operation_name, start_time, end_time, duration_ms,
          kind, status_code, status_message, attributes, events, links, resource_attributes
        )
        SELECT * FROM UNNEST(
          $1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::uuid[], $6::uuid[],
          $7::text[], $8::text[], $9::timestamptz[], $10::timestamptz[], $11::integer[],
          $12::text[], $13::text[], $14::text[], $15::jsonb[], $16::jsonb[], $17::jsonb[], $18::jsonb[]
        )`,
        [times, spanIds, traceIds, parentSpanIds, orgIds, projectIds,
         serviceNames, operationNames, startTimes, endTimes, durations,
         kinds, statusCodes, statusMessages, attributesJsons, eventsJsons, linksJsons, resourceAttrsJsons],
      );
      return { ingested: spans.length, failed: 0, durationMs: Date.now() - start };
    } catch (err) {
      return {
        ingested: 0,
        failed: spans.length,
        durationMs: Date.now() - start,
        errors: [{ index: 0, error: err instanceof Error ? err.message : String(err) }],
      };
    }
  }

  async upsertTrace(trace: TraceRecord): Promise<void> {
    const pool = this.getPool();
    const s = this.schema;

    const existing = await pool.query(
      `SELECT trace_id, start_time, end_time, span_count, error FROM ${s}.traces
       WHERE trace_id = $1 AND project_id = $2`,
      [trace.traceId, trace.projectId],
    );

    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO ${s}.traces (
          trace_id, organization_id, project_id, service_name, root_service_name, root_operation_name,
          start_time, end_time, duration_ms, span_count, error
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [trace.traceId, trace.organizationId ?? null, trace.projectId, trace.serviceName,
         trace.rootServiceName ?? null, trace.rootOperationName ?? null,
         trace.startTime, trace.endTime, trace.durationMs, trace.spanCount, trace.error],
      );
    } else {
      const row = existing.rows[0];
      const existingStart = new Date(row.start_time);
      const existingEnd = new Date(row.end_time);
      const newStart = trace.startTime < existingStart ? trace.startTime : existingStart;
      const newEnd = trace.endTime > existingEnd ? trace.endTime : existingEnd;
      const newDuration = newEnd.getTime() - newStart.getTime();

      await pool.query(
        `UPDATE ${s}.traces SET
          start_time = $1, end_time = $2, duration_ms = $3,
          span_count = span_count + $4, error = error OR $5,
          root_service_name = COALESCE($6, root_service_name),
          root_operation_name = COALESCE($7, root_operation_name)
        WHERE trace_id = $8 AND project_id = $9`,
        [newStart, newEnd, newDuration, trace.spanCount, trace.error,
         trace.rootServiceName ?? null, trace.rootOperationName ?? null,
         trace.traceId, trace.projectId],
      );
    }
  }

  async querySpans(params: SpanQueryParams): Promise<SpanQueryResult> {
    const start = Date.now();
    const pool = this.getPool();
    const s = this.schema;
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    // Time range
    conditions.push(`time ${params.fromExclusive ? '>' : '>='} $${idx++}`);
    values.push(params.from);
    conditions.push(`time ${params.toExclusive ? '<' : '<='} $${idx++}`);
    values.push(params.to);

    // Filters
    if (params.projectId) {
      const pids = Array.isArray(params.projectId) ? params.projectId : [params.projectId];
      conditions.push(`project_id = ANY($${idx++})`);
      values.push(pids);
    }
    if (params.traceId) {
      const tids = Array.isArray(params.traceId) ? params.traceId : [params.traceId];
      conditions.push(`trace_id = ANY($${idx++})`);
      values.push(tids);
    }
    if (params.serviceName) {
      const svc = Array.isArray(params.serviceName) ? params.serviceName : [params.serviceName];
      conditions.push(`service_name = ANY($${idx++})`);
      values.push(svc);
    }
    if (params.kind) {
      const k = Array.isArray(params.kind) ? params.kind : [params.kind];
      conditions.push(`kind = ANY($${idx++})`);
      values.push(k);
    }
    if (params.statusCode) {
      const sc = Array.isArray(params.statusCode) ? params.statusCode : [params.statusCode];
      conditions.push(`status_code = ANY($${idx++})`);
      values.push(sc);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortBy = params.sortBy ?? 'start_time';
    const sortOrder = params.sortOrder ?? 'asc';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM ${s}.spans ${where}`,
      values,
    );
    const total = countResult.rows[0]?.count ?? 0;

    const result = await pool.query(
      `SELECT * FROM ${s}.spans ${where}
       ORDER BY ${sortBy} ${sortOrder}
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset],
    );

    return {
      spans: result.rows.map(mapRowToSpanRecord),
      total,
      hasMore: offset + result.rows.length < total,
      limit,
      offset,
      executionTimeMs: Date.now() - start,
    };
  }

  async getSpansByTraceId(traceId: string, projectId: string): Promise<SpanRecord[]> {
    const pool = this.getPool();
    const s = this.schema;
    const result = await pool.query(
      `SELECT * FROM ${s}.spans WHERE trace_id = $1 AND project_id = $2 ORDER BY start_time ASC`,
      [traceId, projectId],
    );
    return result.rows.map(mapRowToSpanRecord);
  }

  async queryTraces(params: TraceQueryParams): Promise<TraceQueryResult> {
    const start = Date.now();
    const pool = this.getPool();
    const s = this.schema;
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    conditions.push(`start_time >= $${idx++}`);
    values.push(params.from);
    conditions.push(`start_time <= $${idx++}`);
    values.push(params.to);

    if (params.projectId) {
      const pids = Array.isArray(params.projectId) ? params.projectId : [params.projectId];
      conditions.push(`project_id = ANY($${idx++})`);
      values.push(pids);
    }
    if (params.serviceName) {
      const svc = Array.isArray(params.serviceName) ? params.serviceName : [params.serviceName];
      conditions.push(`service_name = ANY($${idx++})`);
      values.push(svc);
    }
    if (params.error !== undefined) {
      conditions.push(`error = $${idx++}`);
      values.push(params.error);
    }
    if (params.minDurationMs !== undefined) {
      conditions.push(`duration_ms >= $${idx++}`);
      values.push(params.minDurationMs);
    }
    if (params.maxDurationMs !== undefined) {
      conditions.push(`duration_ms <= $${idx++}`);
      values.push(params.maxDurationMs);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM ${s}.traces ${where}`,
      values,
    );
    const total = countResult.rows[0]?.count ?? 0;

    const result = await pool.query(
      `SELECT * FROM ${s}.traces ${where}
       ORDER BY start_time DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset],
    );

    return {
      traces: result.rows.map(mapRowToTraceRecord),
      total,
      hasMore: offset + result.rows.length < total,
      limit,
      offset,
      executionTimeMs: Date.now() - start,
    };
  }

  async getTraceById(traceId: string, projectId: string): Promise<TraceRecord | null> {
    const pool = this.getPool();
    const s = this.schema;
    const result = await pool.query(
      `SELECT * FROM ${s}.traces WHERE trace_id = $1 AND project_id = $2`,
      [traceId, projectId],
    );
    return result.rows.length > 0 ? mapRowToTraceRecord(result.rows[0]) : null;
  }

  async getServiceDependencies(
    projectId: string,
    from?: Date,
    to?: Date,
  ): Promise<ServiceDependencyResult> {
    const pool = this.getPool();
    const s = this.schema;
    const values: unknown[] = [projectId];
    let idx = 2;
    let timeFilter = '';

    if (from) {
      timeFilter += ` AND child.start_time >= $${idx++}`;
      values.push(from);
    }
    if (to) {
      timeFilter += ` AND child.start_time <= $${idx++}`;
      values.push(to);
    }

    const result = await pool.query(
      `SELECT
        parent.service_name AS source_service,
        child.service_name AS target_service,
        COUNT(child.span_id)::int AS call_count
      FROM ${s}.spans child
      INNER JOIN ${s}.spans parent
        ON child.parent_span_id = parent.span_id
        AND child.trace_id = parent.trace_id
      WHERE child.project_id = $1
        AND child.service_name <> parent.service_name
        ${timeFilter}
      GROUP BY parent.service_name, child.service_name`,
      values,
    );

    const serviceCallCounts = new Map<string, number>();
    const edges: ServiceDependency[] = [];

    for (const row of result.rows) {
      const source = row.source_service as string;
      const target = row.target_service as string;
      const count = row.call_count as number;

      serviceCallCounts.set(source, (serviceCallCounts.get(source) || 0) + count);
      serviceCallCounts.set(target, (serviceCallCounts.get(target) || 0) + count);
      edges.push({ source, target, callCount: count });
    }

    const nodes = Array.from(serviceCallCounts.entries()).map(([name, callCount]) => ({
      id: name,
      name,
      callCount,
    }));

    return { nodes, edges };
  }

  async deleteSpansByTimeRange(params: DeleteSpansByTimeRangeParams): Promise<DeleteResult> {
    const start = Date.now();
    const pool = this.getPool();
    const s = this.schema;
    const pids = Array.isArray(params.projectId) ? params.projectId : [params.projectId];

    const conditions = ['project_id = ANY($1)', 'time >= $2', 'time <= $3'];
    const values: unknown[] = [pids, params.from, params.to];
    let idx = 4;

    if (params.serviceName) {
      const svc = Array.isArray(params.serviceName) ? params.serviceName : [params.serviceName];
      conditions.push(`service_name = ANY($${idx++})`);
      values.push(svc);
    }

    const result = await pool.query(
      `DELETE FROM ${s}.spans WHERE ${conditions.join(' AND ')}`,
      values,
    );

    // Also clean up orphaned traces
    await pool.query(
      `DELETE FROM ${s}.traces WHERE project_id = ANY($1)
       AND NOT EXISTS (SELECT 1 FROM ${s}.spans WHERE spans.trace_id = traces.trace_id AND spans.project_id = traces.project_id)`,
      [pids],
    );

    return {
      deleted: Number(result.rowCount ?? 0),
      executionTimeMs: Date.now() - start,
    };
  }
}

function mapRowToLogRecord(row: Record<string, unknown>): LogRecord {
  return {
    time: row.time as Date,
    organizationId: row.organization_id as string | undefined,
    projectId: row.project_id as string,
    service: row.service as string,
    level: row.level as LogLevel,
    message: row.message as string,
    metadata: row.metadata as Record<string, unknown> | undefined,
    traceId: row.trace_id as string | undefined,
    spanId: row.span_id as string | undefined,
    hostname: row.hostname as string | undefined,
  };
}

function mapRowToStoredLogRecord(row: Record<string, unknown>): StoredLogRecord {
  return {
    id: row.id as string,
    ...mapRowToLogRecord(row),
  };
}

function mapRowToSpanRecord(row: Record<string, unknown>): SpanRecord {
  return {
    time: row.time as Date,
    spanId: row.span_id as string,
    traceId: row.trace_id as string,
    parentSpanId: row.parent_span_id as string | undefined,
    organizationId: row.organization_id as string | undefined,
    projectId: row.project_id as string,
    serviceName: row.service_name as string,
    operationName: row.operation_name as string,
    startTime: row.start_time as Date,
    endTime: row.end_time as Date,
    durationMs: row.duration_ms as number,
    kind: row.kind as SpanKind | undefined,
    statusCode: row.status_code as SpanStatusCode | undefined,
    statusMessage: row.status_message as string | undefined,
    attributes: row.attributes as Record<string, unknown> | undefined,
    events: row.events as Array<Record<string, unknown>> | undefined,
    links: row.links as Array<Record<string, unknown>> | undefined,
    resourceAttributes: row.resource_attributes as Record<string, unknown> | undefined,
  };
}

function mapRowToTraceRecord(row: Record<string, unknown>): TraceRecord {
  return {
    traceId: row.trace_id as string,
    organizationId: row.organization_id as string | undefined,
    projectId: row.project_id as string,
    serviceName: row.service_name as string,
    rootServiceName: row.root_service_name as string | undefined,
    rootOperationName: row.root_operation_name as string | undefined,
    startTime: row.start_time as Date,
    endTime: row.end_time as Date,
    durationMs: row.duration_ms as number,
    spanCount: row.span_count as number,
    error: row.error as boolean,
  };
}
