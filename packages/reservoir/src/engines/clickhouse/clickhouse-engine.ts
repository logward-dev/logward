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
  DeleteByTimeRangeParams,
  DeleteResult,
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
      max_open_connections: this.config.poolSize ?? 10,
      request_timeout: this.config.connectionTimeoutMs ?? 30_000,
      compression: { request: true, response: true },
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
          project_id LowCardinality(String) NOT NULL,
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
        ORDER BY (project_id, time, id)
        SETTINGS index_granularity = 8192
      `,
    });

    // Full-text bloom filter index on message
    try {
      await client.command({
        query: `ALTER TABLE ${t} ADD INDEX IF NOT EXISTS idx_message_fulltext message TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 1`,
      });
    } catch {
      // index may already exist
    }

    // Index on trace_id for correlation queries
    try {
      await client.command({
        query: `ALTER TABLE ${t} ADD INDEX IF NOT EXISTS idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 1`,
      });
    } catch {
      // index may already exist
    }
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
