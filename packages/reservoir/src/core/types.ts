/**
 * Core type definitions for @logtide/reservoir
 *
 * These types define the storage abstraction layer for log management.
 * They align with @logtide/shared types but are designed to be storage-agnostic.
 */

import type { LogLevel } from '@logtide/shared';
export type { LogLevel };

export type EngineType = 'timescale' | 'clickhouse' | 'clickhouse-fdw';

export type StorageTier = 'hot' | 'warm' | 'cold' | 'archive';

export type SearchMode = 'fulltext' | 'substring';

export type FilterOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'in'
  | 'not in'
  | 'like'
  | 'not like';

export type AggregationInterval = '1m' | '5m' | '15m' | '1h' | '6h' | '1d' | '1w';

/** A log record for storage */
export interface LogRecord {
  time: Date;
  organizationId?: string;
  projectId: string;
  service: string;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  hostname?: string;
}

/** A log record returned from the database (includes id) */
export interface StoredLogRecord extends LogRecord {
  id: string;
}

/** A filter condition for querying logs */
export interface Filter {
  field: string;
  operator: FilterOperator;
  value: string | number | boolean | Date | (string | number | boolean)[];
}

/** Parameters for querying logs */
export interface QueryParams {
  organizationId?: string | string[];
  projectId?: string | string[];
  service?: string | string[];
  level?: LogLevel | LogLevel[];
  hostname?: string | string[];
  traceId?: string;
  from: Date;
  to: Date;
  search?: string;
  searchMode?: SearchMode;
  filters?: Filter[];
  limit?: number;
  offset?: number;
  cursor?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Result of a log query */
export interface QueryResult<T = LogRecord> {
  logs: T[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
  nextCursor?: string;
  executionTimeMs?: number;
  tiers?: StorageTier[];
}

/** Parameters for aggregation queries */
export interface AggregateParams {
  organizationId?: string | string[];
  projectId?: string | string[];
  service?: string | string[];
  from: Date;
  to: Date;
  interval: AggregationInterval;
  groupBy?: string[];
  filters?: Filter[];
}

/** Time bucket in an aggregation result */
export interface TimeBucket {
  bucket: Date;
  total: number;
  byLevel?: Record<LogLevel, number>;
  byField?: Record<string, number>;
}

/** Result of an aggregation query */
export interface AggregateResult {
  timeseries: TimeBucket[];
  total: number;
  executionTimeMs?: number;
}

/** Result of a batch ingestion */
export interface IngestResult {
  ingested: number;
  failed: number;
  durationMs: number;
  errors?: Array<{
    index: number;
    error: string;
  }>;
}

/** Result of a batch ingestion with returned records */
export interface IngestReturningResult extends IngestResult {
  rows: StoredLogRecord[];
}

/** Health check status */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  engine: EngineType;
  connected: boolean;
  responseTimeMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

/** Capabilities of a storage engine */
export interface EngineCapabilities {
  engine: EngineType;
  supportsFullTextSearch: boolean;
  supportsAggregations: boolean;
  supportsStreaming: boolean;
  supportsTransactions: boolean;
  maxBatchSize: number;
  nativeCompression: boolean;
  nativeTiering: boolean;
  supportedOperators: FilterOperator[];
  supportedIntervals: AggregationInterval[];
}

/** Metadata about a storage segment (for tiering) */
export interface StorageSegment {
  id: string;
  organizationId: string;
  startTime: Date;
  endTime: Date;
  tier: StorageTier;
  engine: EngineType;
  recordCount: number;
  compressedSizeBytes: number;
  uncompressedSizeBytes: number;
  s3Path?: string;
  createdAt: Date;
  lastAccessedAt?: Date;
  metadata?: Record<string, unknown>;
}

/** Configuration for a storage engine */
export interface StorageConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  schema?: string;
  poolSize?: number;
  connectionTimeoutMs?: number;
  ssl?: boolean;
  options?: Record<string, unknown>;
}
