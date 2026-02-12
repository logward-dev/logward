import type {
  StorageConfig,
  LogRecord,
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
} from './types.js';

/**
 * Abstract base class for storage engines.
 *
 * All storage engine implementations (TimescaleDB, ClickHouse, etc.)
 * must extend this class and implement all abstract methods.
 */
export abstract class StorageEngine {
  protected config: StorageConfig;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  /** Connect to the storage backend */
  abstract connect(): Promise<void>;

  /** Disconnect and clean up resources */
  abstract disconnect(): Promise<void>;

  /** Check storage health and connectivity */
  abstract healthCheck(): Promise<HealthStatus>;

  /** Initialize schema (idempotent - safe to call multiple times) */
  abstract initialize(): Promise<void>;

  /** Migrate schema to a target version */
  abstract migrate(version: string): Promise<void>;

  /** Ingest a batch of log records */
  abstract ingest(logs: LogRecord[]): Promise<IngestResult>;

  /** Ingest a batch and return inserted records with IDs */
  abstract ingestReturning(logs: LogRecord[]): Promise<IngestReturningResult>;

  /** Query logs with filters and pagination */
  abstract query(params: QueryParams): Promise<QueryResult<StoredLogRecord>>;

  /** Time-series aggregation */
  abstract aggregate(params: AggregateParams): Promise<AggregateResult>;

  /** Get engine capabilities */
  abstract getCapabilities(): EngineCapabilities;

  /** Get storage segments in a time range (for tiering) */
  abstract getSegments(startTime: Date, endTime: Date): Promise<StorageSegment[]>;
}
