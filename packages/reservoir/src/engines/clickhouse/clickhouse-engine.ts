import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { randomUUID } from 'crypto';
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
import { ClickHouseQueryTranslator } from './query-translator.js';

export interface ClickHouseEngineOptions {
  /** Use an existing ClickHouse client instead of creating a new one */
  client?: ClickHouseClient;
  /** Table name to use (default: 'logs') */
  tableName?: string;
  /** Skip schema initialization (use when connecting to existing DB) */
  skipInitialize?: boolean;
}

export class ClickHouseEngine extends StorageEngine {
  private client: ClickHouseClient | null = null;
  private ownsClient: boolean;
  private translator: ClickHouseQueryTranslator;
  private options: ClickHouseEngineOptions;

  private get tableName(): string {
    return this.options.tableName ?? 'logs';
  }

  constructor(config: StorageConfig, options: ClickHouseEngineOptions = {}) {
    super(config);
    this.options = options;
    this.ownsClient = !options.client;
    if (options.client) {
      this.client = options.client;
    }
    this.translator = new ClickHouseQueryTranslator(this.tableName);
  }

  async connect(): Promise<void> {
    if (this.client) return;
    this.client = createClient({
      url: `http://${this.config.host}:${this.config.port}`,
      username: this.config.username,
      password: this.config.password,
      database: this.config.database,
      max_open_connections: this.config.poolSize ?? 50,
      request_timeout: this.config.connectionTimeoutMs ?? 30_000,
      compression: { request: true, response: true },
      keep_alive: { enabled: true },
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 1,
      },
    });
  }

  async disconnect(): Promise<void> {
    if (this.client && this.ownsClient) {
      await this.client.close();
      this.client = null;
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const start = Date.now();
    try {
      await this.getClient().query({ query: 'SELECT 1', format: 'JSONEachRow' });
      const responseTimeMs = Date.now() - start;
      let status: HealthStatus['status'] = 'healthy';
      if (responseTimeMs >= 200) status = 'unhealthy';
      else if (responseTimeMs >= 50) status = 'degraded';
      return { status, engine: 'clickhouse', connected: true, responseTimeMs };
    } catch (err) {
      return {
        status: 'unhealthy',
        engine: 'clickhouse',
        connected: false,
        responseTimeMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async initialize(): Promise<void> {
    if (this.options.skipInitialize) return;

    const client = this.getClient();
    const t = this.tableName;

    await client.command({
      query: `
        CREATE TABLE IF NOT EXISTS ${t} (
          id UUID DEFAULT generateUUIDv4(),
          time DateTime64(3) NOT NULL,
          project_id String NOT NULL,
          service LowCardinality(String) NOT NULL,
          level LowCardinality(String) NOT NULL,
          message String NOT NULL,
          metadata String DEFAULT '{}',
          trace_id Nullable(String) DEFAULT NULL,
          span_id Nullable(String) DEFAULT NULL,
          created_at DateTime DEFAULT now()
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(time)
        ORDER BY (project_id, time)
        SETTINGS index_granularity = 8192
      `,
    });

    try {
      await client.command({
        query: `ALTER TABLE ${t} ADD INDEX IF NOT EXISTS idx_message_fulltext message TYPE ngrambf_v1(3, 32768, 3, 0) GRANULARITY 1`,
      });
    } catch {
      // index may already exist
    }

    try {
      await client.command({
        query: `ALTER TABLE ${t} ADD INDEX IF NOT EXISTS idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 1`,
      });
    } catch {
      // index may already exist
    }

    try {
      await client.command({
        query: `ALTER TABLE ${t} ADD INDEX IF NOT EXISTS idx_span_id span_id TYPE bloom_filter(0.01) GRANULARITY 1`,
      });
    } catch {
      // index may already exist
    }

    // Spans table
    await client.command({
      query: `
        CREATE TABLE IF NOT EXISTS spans (
          time DateTime64(3) NOT NULL,
          span_id String NOT NULL,
          trace_id String NOT NULL,
          parent_span_id Nullable(String) DEFAULT NULL,
          organization_id Nullable(String) DEFAULT NULL,
          project_id String NOT NULL,
          service_name LowCardinality(String) NOT NULL,
          operation_name String NOT NULL,
          start_time DateTime64(3) NOT NULL,
          end_time DateTime64(3) NOT NULL,
          duration_ms UInt32 NOT NULL,
          kind LowCardinality(Nullable(String)) DEFAULT NULL,
          status_code LowCardinality(Nullable(String)) DEFAULT NULL,
          status_message Nullable(String) DEFAULT NULL,
          attributes String DEFAULT '{}',
          events String DEFAULT '[]',
          links String DEFAULT '[]',
          resource_attributes String DEFAULT '{}'
        )
        ENGINE = MergeTree()
        PARTITION BY toYYYYMM(time)
        ORDER BY (project_id, trace_id, time)
        SETTINGS index_granularity = 8192
      `,
    });

    try {
      await client.command({
        query: `ALTER TABLE spans ADD INDEX IF NOT EXISTS idx_spans_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 1`,
      });
    } catch { /* index may already exist */ }

    try {
      await client.command({
        query: `ALTER TABLE spans ADD INDEX IF NOT EXISTS idx_spans_parent parent_span_id TYPE bloom_filter(0.01) GRANULARITY 1`,
      });
    } catch { /* index may already exist */ }

    // Traces table (ReplacingMergeTree for upsert semantics)
    await client.command({
      query: `
        CREATE TABLE IF NOT EXISTS traces (
          trace_id String NOT NULL,
          organization_id Nullable(String) DEFAULT NULL,
          project_id String NOT NULL,
          service_name LowCardinality(String) NOT NULL,
          root_service_name Nullable(String) DEFAULT NULL,
          root_operation_name Nullable(String) DEFAULT NULL,
          start_time DateTime64(3) NOT NULL,
          end_time DateTime64(3) NOT NULL,
          duration_ms UInt32 NOT NULL,
          span_count UInt32 NOT NULL,
          error UInt8 DEFAULT 0,
          updated_at DateTime DEFAULT now()
        )
        ENGINE = ReplacingMergeTree(updated_at)
        ORDER BY (project_id, trace_id)
        SETTINGS index_granularity = 8192
      `,
    });
  }

  async migrate(_version: string): Promise<void> {
    // placeholder
  }

  async ingest(logs: LogRecord[]): Promise<IngestResult> {
    if (logs.length === 0) {
      return { ingested: 0, failed: 0, durationMs: 0 };
    }

    const start = Date.now();
    const client = this.getClient();

    try {
      const values = logs.map((log) => this.toClickHouseRow(log));
      await client.insert({ table: this.tableName, values, format: 'JSONEachRow' });
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
    const client = this.getClient();

    // Generate UUIDs client-side since ClickHouse has no RETURNING
    const logsWithIds = logs.map((log) => ({
      id: randomUUID(),
      ...this.toClickHouseRow(log),
    }));

    try {
      await client.insert({ table: this.tableName, values: logsWithIds, format: 'JSONEachRow' });

      const rows: StoredLogRecord[] = logsWithIds.map((row, i) => ({
        id: row.id,
        time: logs[i].time,
        projectId: logs[i].projectId,
        service: logs[i].service,
        level: logs[i].level,
        message: logs[i].message,
        metadata: logs[i].metadata,
        traceId: logs[i].traceId,
        spanId: logs[i].spanId,
        hostname: logs[i].hostname,
      }));

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
    const client = this.getClient();
    const native = this.translator.translateQuery(params);
    const limit = (native.metadata?.limit as number) ?? 50;
    const offset = params.offset ?? 0;

    const resultSet = await client.query({
      query: native.query as string,
      query_params: (native.parameters as Record<string, unknown>[])[0],
      format: 'JSONEachRow',
    });
    const rows = await resultSet.json() as Record<string, unknown>[];
    const hasMore = rows.length > limit;
    const trimmedRows = hasMore ? rows.slice(0, limit) : rows;

    let nextCursor: string | undefined;
    if (hasMore) {
      const last = trimmedRows[trimmedRows.length - 1];
      const lastTime = parseClickHouseTime(last.time);
      const cursorStr = `${lastTime.toISOString()},${last.id}`;
      nextCursor = Buffer.from(cursorStr).toString('base64');
    }

    const logs = trimmedRows.map(mapClickHouseRowToStoredLogRecord);

    return {
      logs,
      total: trimmedRows.length,
      hasMore,
      limit,
      offset,
      nextCursor,
      executionTimeMs: Date.now() - start,
    };
  }

  async aggregate(params: AggregateParams): Promise<AggregateResult> {
    const start = Date.now();
    const client = this.getClient();
    const native = this.translator.translateAggregate(params);

    const resultSet = await client.query({
      query: native.query as string,
      query_params: (native.parameters as Record<string, unknown>[])[0],
      format: 'JSONEachRow',
    });
    const rows = await resultSet.json() as Record<string, unknown>[];

    const bucketMap = new Map<string, TimeBucket>();

    for (const row of rows) {
      const bucketTime = parseClickHouseTime(row.bucket);
      const key = bucketTime.toISOString();
      let bucket = bucketMap.get(key);
      if (!bucket) {
        bucket = { bucket: bucketTime, total: 0, byLevel: {} as Record<LogLevel, number> };
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
    const client = this.getClient();
    const resultSet = await client.query({
      query: `SELECT * FROM ${this.tableName} WHERE id = {p_id:UUID} AND project_id = {p_project_id:String} LIMIT 1`,
      query_params: { p_id: params.id, p_project_id: params.projectId },
      format: 'JSONEachRow',
    });
    const rows = await resultSet.json() as Record<string, unknown>[];
    return rows.length > 0 ? mapClickHouseRowToStoredLogRecord(rows[0]) : null;
  }

  async getByIds(params: GetByIdsParams): Promise<StoredLogRecord[]> {
    if (params.ids.length === 0) return [];
    const client = this.getClient();
    const resultSet = await client.query({
      query: `SELECT * FROM ${this.tableName} WHERE id IN {p_ids:Array(UUID)} AND project_id = {p_project_id:String} ORDER BY time DESC`,
      query_params: { p_ids: params.ids, p_project_id: params.projectId },
      format: 'JSONEachRow',
    });
    const rows = await resultSet.json() as Record<string, unknown>[];
    return rows.map(mapClickHouseRowToStoredLogRecord);
  }

  async count(params: CountParams): Promise<CountResult> {
    const start = Date.now();
    const client = this.getClient();
    const native = this.translator.translateCount(params);
    const resultSet = await client.query({
      query: native.query as string,
      query_params: (native.parameters as Record<string, unknown>[])[0],
      format: 'JSONEachRow',
    });
    const rows = await resultSet.json() as Record<string, unknown>[];
    return {
      count: Number(rows[0]?.count ?? 0),
      executionTimeMs: Date.now() - start,
    };
  }

  async distinct(params: DistinctParams): Promise<DistinctResult> {
    const start = Date.now();
    const client = this.getClient();
    const native = this.translator.translateDistinct(params);
    const resultSet = await client.query({
      query: native.query as string,
      query_params: (native.parameters as Record<string, unknown>[])[0],
      format: 'JSONEachRow',
    });
    const rows = await resultSet.json() as Record<string, unknown>[];
    return {
      values: rows.map((row) => row.value as string).filter((v) => v != null && v !== ''),
      executionTimeMs: Date.now() - start,
    };
  }

  async topValues(params: TopValuesParams): Promise<TopValuesResult> {
    const start = Date.now();
    const client = this.getClient();
    const native = this.translator.translateTopValues(params);
    const resultSet = await client.query({
      query: native.query as string,
      query_params: (native.parameters as Record<string, unknown>[])[0],
      format: 'JSONEachRow',
    });
    const rows = await resultSet.json() as Record<string, unknown>[];
    return {
      values: rows.map((row) => ({
        value: String(row.value),
        count: Number(row.count),
      })),
      executionTimeMs: Date.now() - start,
    };
  }

  async deleteByTimeRange(params: DeleteByTimeRangeParams): Promise<DeleteResult> {
    const start = Date.now();
    const client = this.getClient();
    const native = this.translator.translateDelete(params);
    // ClickHouse mutations are async - the command returns immediately
    await client.command({
      query: native.query as string,
      query_params: (native.parameters as Record<string, unknown>[])[0],
    });
    return {
      // ClickHouse async mutations don't report row count immediately
      deleted: 0,
      executionTimeMs: Date.now() - start,
    };
  }

  getCapabilities(): EngineCapabilities {
    return {
      engine: 'clickhouse',
      supportsFullTextSearch: true,
      supportsAggregations: true,
      supportsStreaming: true,
      supportsTransactions: false,
      maxBatchSize: 100_000,
      nativeCompression: true,
      nativeTiering: false,
      supportedOperators: ['=', '!=', '>', '>=', '<', '<=', 'in', 'not in', 'like', 'not like'],
      supportedIntervals: ['1m', '5m', '15m', '1h', '6h', '1d', '1w'],
    };
  }

  async getSegments(_startTime: Date, _endTime: Date): Promise<StorageSegment[]> {
    return [];
  }

  private getClient(): ClickHouseClient {
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }
    return this.client;
  }

  private toClickHouseRow(log: LogRecord): Record<string, unknown> {
    return {
      time: log.time.getTime(),
      project_id: log.projectId,
      service: log.service,
      level: log.level,
      message: log.message,
      metadata: log.metadata ? JSON.stringify(log.metadata) : '{}',
      trace_id: log.traceId ?? null,
      span_id: log.spanId ?? null,
    };
  }

  // =========================================================================
  // Span & Trace Operations
  // =========================================================================

  async ingestSpans(spans: SpanRecord[]): Promise<IngestSpansResult> {
    if (spans.length === 0) return { ingested: 0, failed: 0, durationMs: 0 };

    const start = Date.now();
    const client = this.getClient();

    try {
      const values = spans.map((span) => ({
        time: span.time.getTime(),
        span_id: span.spanId,
        trace_id: span.traceId,
        parent_span_id: span.parentSpanId ?? null,
        organization_id: span.organizationId ?? null,
        project_id: span.projectId,
        service_name: span.serviceName,
        operation_name: span.operationName,
        start_time: span.startTime.getTime(),
        end_time: span.endTime.getTime(),
        duration_ms: span.durationMs,
        kind: span.kind ?? null,
        status_code: span.statusCode ?? null,
        status_message: span.statusMessage ?? null,
        attributes: span.attributes ? JSON.stringify(span.attributes) : '{}',
        events: span.events ? JSON.stringify(span.events) : '[]',
        links: span.links ? JSON.stringify(span.links) : '[]',
        resource_attributes: span.resourceAttributes ? JSON.stringify(span.resourceAttributes) : '{}',
      }));

      await client.insert({ table: 'spans', values, format: 'JSONEachRow' });
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
    const client = this.getClient();

    // ReplacingMergeTree handles dedup by (project_id, trace_id) using updated_at
    // We read the existing row, merge, and insert the merged version
    const resultSet = await client.query({
      query: `SELECT trace_id, start_time, end_time, span_count, error
              FROM traces FINAL
              WHERE trace_id = {traceId:String} AND project_id = {projectId:String}`,
      query_params: { traceId: trace.traceId, projectId: trace.projectId },
      format: 'JSONEachRow',
    });
    const existing = (await resultSet.json<{
      trace_id: string;
      start_time: string;
      end_time: string;
      span_count: number;
      error: number;
    }>())[0];

    let startTime = trace.startTime;
    let endTime = trace.endTime;
    let spanCount = trace.spanCount;
    let error = trace.error;

    if (existing) {
      const existingStart = parseClickHouseTime(existing.start_time);
      const existingEnd = parseClickHouseTime(existing.end_time);
      startTime = trace.startTime < existingStart ? trace.startTime : existingStart;
      endTime = trace.endTime > existingEnd ? trace.endTime : existingEnd;
      spanCount = existing.span_count + trace.spanCount;
      error = !!existing.error || trace.error;
    }

    const durationMs = endTime.getTime() - startTime.getTime();

    await client.insert({
      table: 'traces',
      values: [{
        trace_id: trace.traceId,
        organization_id: trace.organizationId ?? null,
        project_id: trace.projectId,
        service_name: trace.serviceName,
        root_service_name: trace.rootServiceName ?? null,
        root_operation_name: trace.rootOperationName ?? null,
        start_time: startTime.getTime(),
        end_time: endTime.getTime(),
        duration_ms: durationMs,
        span_count: spanCount,
        error: error ? 1 : 0,
      }],
      format: 'JSONEachRow',
    });
  }

  async querySpans(params: SpanQueryParams): Promise<SpanQueryResult> {
    const start = Date.now();
    const client = this.getClient();
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    const conditions: string[] = [];
    const queryParams: Record<string, unknown> = {};

    // Time range
    conditions.push(`time ${params.fromExclusive ? '>' : '>='} {p_from:DateTime64(3)}`);
    queryParams.p_from = Math.floor(params.from.getTime() / 1000);
    conditions.push(`time ${params.toExclusive ? '<' : '<='} {p_to:DateTime64(3)}`);
    queryParams.p_to = Math.floor(params.to.getTime() / 1000);

    if (params.projectId) {
      const pids = Array.isArray(params.projectId) ? params.projectId : [params.projectId];
      conditions.push(`project_id IN {p_pids:Array(String)}`);
      queryParams.p_pids = pids;
    }
    if (params.traceId) {
      const tids = Array.isArray(params.traceId) ? params.traceId : [params.traceId];
      conditions.push(`trace_id IN {p_tids:Array(String)}`);
      queryParams.p_tids = tids;
    }
    if (params.serviceName) {
      const svc = Array.isArray(params.serviceName) ? params.serviceName : [params.serviceName];
      conditions.push(`service_name IN {p_svc:Array(String)}`);
      queryParams.p_svc = svc;
    }
    if (params.kind) {
      const k = Array.isArray(params.kind) ? params.kind : [params.kind];
      conditions.push(`kind IN {p_kind:Array(String)}`);
      queryParams.p_kind = k;
    }
    if (params.statusCode) {
      const sc = Array.isArray(params.statusCode) ? params.statusCode : [params.statusCode];
      conditions.push(`status_code IN {p_sc:Array(String)}`);
      queryParams.p_sc = sc;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortBy = params.sortBy ?? 'start_time';
    const sortOrder = params.sortOrder ?? 'ASC';

    const countResult = await client.query({
      query: `SELECT count() AS count FROM spans ${where}`,
      query_params: queryParams,
      format: 'JSONEachRow',
    });
    const total = Number((await countResult.json<{ count: string }>())[0]?.count ?? 0);

    const resultSet = await client.query({
      query: `SELECT * FROM spans ${where} ORDER BY ${sortBy} ${sortOrder} LIMIT ${limit} OFFSET ${offset}`,
      query_params: queryParams,
      format: 'JSONEachRow',
    });
    const rows = await resultSet.json<Record<string, unknown>>();

    return {
      spans: rows.map(mapClickHouseRowToSpanRecord),
      total,
      hasMore: offset + rows.length < total,
      limit,
      offset,
      executionTimeMs: Date.now() - start,
    };
  }

  async getSpansByTraceId(traceId: string, projectId: string): Promise<SpanRecord[]> {
    const client = this.getClient();
    const resultSet = await client.query({
      query: `SELECT * FROM spans WHERE trace_id = {traceId:String} AND project_id = {projectId:String} ORDER BY start_time ASC`,
      query_params: { traceId, projectId },
      format: 'JSONEachRow',
    });
    const rows = await resultSet.json<Record<string, unknown>>();
    return rows.map(mapClickHouseRowToSpanRecord);
  }

  async queryTraces(params: TraceQueryParams): Promise<TraceQueryResult> {
    const start = Date.now();
    const client = this.getClient();
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    const conditions: string[] = [];
    const queryParams: Record<string, unknown> = {};

    conditions.push(`start_time >= {p_from:DateTime64(3)}`);
    queryParams.p_from = Math.floor(params.from.getTime() / 1000);
    conditions.push(`start_time <= {p_to:DateTime64(3)}`);
    queryParams.p_to = Math.floor(params.to.getTime() / 1000);

    if (params.projectId) {
      const pids = Array.isArray(params.projectId) ? params.projectId : [params.projectId];
      conditions.push(`project_id IN {p_pids:Array(String)}`);
      queryParams.p_pids = pids;
    }
    if (params.serviceName) {
      const svc = Array.isArray(params.serviceName) ? params.serviceName : [params.serviceName];
      conditions.push(`service_name IN {p_svc:Array(String)}`);
      queryParams.p_svc = svc;
    }
    if (params.error !== undefined) {
      conditions.push(`error = {p_error:UInt8}`);
      queryParams.p_error = params.error ? 1 : 0;
    }
    if (params.minDurationMs !== undefined) {
      conditions.push(`duration_ms >= {p_minDur:UInt32}`);
      queryParams.p_minDur = params.minDurationMs;
    }
    if (params.maxDurationMs !== undefined) {
      conditions.push(`duration_ms <= {p_maxDur:UInt32}`);
      queryParams.p_maxDur = params.maxDurationMs;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Use FINAL to get deduplicated rows from ReplacingMergeTree
    const countResult = await client.query({
      query: `SELECT count() AS count FROM traces FINAL ${where}`,
      query_params: queryParams,
      format: 'JSONEachRow',
    });
    const total = Number((await countResult.json<{ count: string }>())[0]?.count ?? 0);

    const resultSet = await client.query({
      query: `SELECT * FROM traces FINAL ${where} ORDER BY start_time DESC LIMIT ${limit} OFFSET ${offset}`,
      query_params: queryParams,
      format: 'JSONEachRow',
    });
    const rows = await resultSet.json<Record<string, unknown>>();

    return {
      traces: rows.map(mapClickHouseRowToTraceRecord),
      total,
      hasMore: offset + rows.length < total,
      limit,
      offset,
      executionTimeMs: Date.now() - start,
    };
  }

  async getTraceById(traceId: string, projectId: string): Promise<TraceRecord | null> {
    const client = this.getClient();
    const resultSet = await client.query({
      query: `SELECT * FROM traces FINAL WHERE trace_id = {traceId:String} AND project_id = {projectId:String}`,
      query_params: { traceId, projectId },
      format: 'JSONEachRow',
    });
    const rows = await resultSet.json<Record<string, unknown>>();
    return rows.length > 0 ? mapClickHouseRowToTraceRecord(rows[0]) : null;
  }

  async getServiceDependencies(
    projectId: string,
    from?: Date,
    to?: Date,
  ): Promise<ServiceDependencyResult> {
    const client = this.getClient();
    const queryParams: Record<string, unknown> = { projectId };
    let timeFilter = '';

    if (from) {
      timeFilter += ` AND child.start_time >= {p_from:DateTime64(3)}`;
      queryParams.p_from = Math.floor(from.getTime() / 1000);
    }
    if (to) {
      timeFilter += ` AND child.start_time <= {p_to:DateTime64(3)}`;
      queryParams.p_to = Math.floor(to.getTime() / 1000);
    }

    const resultSet = await client.query({
      query: `
        SELECT
          parent.service_name AS source_service,
          child.service_name AS target_service,
          count() AS call_count
        FROM spans AS child
        INNER JOIN spans AS parent
          ON child.parent_span_id = parent.span_id
          AND child.trace_id = parent.trace_id
        WHERE child.project_id = {projectId:String}
          AND child.service_name != parent.service_name
          ${timeFilter}
        GROUP BY parent.service_name, child.service_name
      `,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const rows = await resultSet.json<{ source_service: string; target_service: string; call_count: string }>();

    const serviceCallCounts = new Map<string, number>();
    const edges: ServiceDependency[] = [];

    for (const row of rows) {
      const source = row.source_service;
      const target = row.target_service;
      const count = Number(row.call_count);

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
    const client = this.getClient();
    const pids = Array.isArray(params.projectId) ? params.projectId : [params.projectId];

    const conditions = [
      `project_id IN {p_pids:Array(String)}`,
      `time >= {p_from:DateTime64(3)}`,
      `time <= {p_to:DateTime64(3)}`,
    ];
    const queryParams: Record<string, unknown> = {
      p_pids: pids,
      p_from: Math.floor(params.from.getTime() / 1000),
      p_to: Math.floor(params.to.getTime() / 1000),
    };

    if (params.serviceName) {
      const svc = Array.isArray(params.serviceName) ? params.serviceName : [params.serviceName];
      conditions.push(`service_name IN {p_svc:Array(String)}`);
      queryParams.p_svc = svc;
    }

    // ClickHouse mutations are async
    await client.command({
      query: `ALTER TABLE spans DELETE WHERE ${conditions.join(' AND ')}`,
      query_params: queryParams,
    });

    return { deleted: 0, executionTimeMs: Date.now() - start };
  }
}

function parseClickHouseTime(value: unknown): Date {
  if (value instanceof Date) return value;
  const str = String(value);
  // ClickHouse DateTime64(3) can return as epoch seconds (number) or ISO string
  const num = Number(str);
  if (!isNaN(num)) {
    // If it looks like epoch seconds (< year 10000), convert
    return num < 1e12 ? new Date(num * 1000) : new Date(num);
  }
  return new Date(str);
}

function mapClickHouseRowToStoredLogRecord(row: Record<string, unknown>): StoredLogRecord {
  let metadata: Record<string, unknown> | undefined;
  if (row.metadata && typeof row.metadata === 'string' && row.metadata !== '{}') {
    try {
      metadata = JSON.parse(row.metadata as string);
    } catch {
      metadata = undefined;
    }
  } else if (row.metadata && typeof row.metadata === 'object') {
    metadata = row.metadata as Record<string, unknown>;
  }

  return {
    id: String(row.id),
    time: parseClickHouseTime(row.time),
    projectId: String(row.project_id),
    service: String(row.service),
    level: String(row.level) as LogLevel,
    message: String(row.message),
    metadata,
    traceId: row.trace_id ? String(row.trace_id) : undefined,
    spanId: row.span_id ? String(row.span_id) : undefined,
  };
}

function parseJsonField(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string') {
    if (value === '{}' || value === '[]' || value === '') return undefined;
    try { return JSON.parse(value); } catch { return undefined; }
  }
  return undefined;
}

function parseJsonArrayField(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (typeof value === 'string') {
    if (value === '[]' || value === '') return undefined;
    try { return JSON.parse(value); } catch { return undefined; }
  }
  return undefined;
}

function mapClickHouseRowToSpanRecord(row: Record<string, unknown>): SpanRecord {
  return {
    time: parseClickHouseTime(row.time),
    spanId: String(row.span_id),
    traceId: String(row.trace_id),
    parentSpanId: row.parent_span_id ? String(row.parent_span_id) : undefined,
    organizationId: row.organization_id ? String(row.organization_id) : undefined,
    projectId: String(row.project_id),
    serviceName: String(row.service_name),
    operationName: String(row.operation_name),
    startTime: parseClickHouseTime(row.start_time),
    endTime: parseClickHouseTime(row.end_time),
    durationMs: Number(row.duration_ms),
    kind: row.kind ? String(row.kind) as SpanKind : undefined,
    statusCode: row.status_code ? String(row.status_code) as SpanStatusCode : undefined,
    statusMessage: row.status_message ? String(row.status_message) : undefined,
    attributes: parseJsonField(row.attributes),
    events: parseJsonArrayField(row.events),
    links: parseJsonArrayField(row.links),
    resourceAttributes: parseJsonField(row.resource_attributes),
  };
}

function mapClickHouseRowToTraceRecord(row: Record<string, unknown>): TraceRecord {
  return {
    traceId: String(row.trace_id),
    organizationId: row.organization_id ? String(row.organization_id) : undefined,
    projectId: String(row.project_id),
    serviceName: String(row.service_name),
    rootServiceName: row.root_service_name ? String(row.root_service_name) : undefined,
    rootOperationName: row.root_operation_name ? String(row.root_operation_name) : undefined,
    startTime: parseClickHouseTime(row.start_time),
    endTime: parseClickHouseTime(row.end_time),
    durationMs: Number(row.duration_ms),
    spanCount: Number(row.span_count),
    error: !!Number(row.error),
  };
}
