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
  DeleteByTimeRangeParams,
  DeleteResult,
} from '../../core/types.js';
import { TimescaleQueryTranslator } from './query-translator.js';

const { Pool } = pg;

function sanitizeNull(value: string): string {
  return value.replace(/\0/g, '');
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
    if (this.pool) return; // already connected (injected pool)
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

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${t}_project_time ON ${s}.${t} (project_id, time DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${t}_service_time ON ${s}.${t} (service, time DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${t}_level_time ON ${s}.${t} (level, time DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${t}_trace_id ON ${s}.${t} (trace_id) WHERE trace_id IS NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${t}_fulltext ON ${s}.${t} USING GIN (to_tsvector('english', message))`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_${t}_composite ON ${s}.${t} (project_id, time DESC, id DESC)`);

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
    const columns = ['time', 'project_id', 'service', 'level', 'message', 'metadata', 'trace_id', 'span_id'];
    const values: unknown[] = [];
    const rows: string[] = [];

    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const base = i * columns.length;
      const placeholders = columns.map((_, j) => `$${base + j + 1}`);
      rows.push(`(${placeholders.join(', ')})`);
      values.push(
        log.time,
        sanitizeNull(log.projectId),
        sanitizeNull(log.service),
        log.level,
        sanitizeNull(log.message),
        log.metadata ? JSON.stringify(log.metadata) : null,
        log.traceId ?? null,
        log.spanId ?? null,
      );
    }

    let query = `INSERT INTO ${this.schema}.${this.tableName} (${columns.join(', ')}) VALUES ${rows.join(', ')}`;
    if (returning) {
      query += ' RETURNING *';
    }

    return { query, values };
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
