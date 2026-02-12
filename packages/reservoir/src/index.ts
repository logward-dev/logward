// Core types
export type {
  LogLevel,
  EngineType,
  StorageTier,
  SearchMode,
  FilterOperator,
  AggregationInterval,
  LogRecord,
  StoredLogRecord,
  Filter,
  QueryParams,
  QueryResult,
  AggregateParams,
  AggregateResult,
  TimeBucket,
  IngestResult,
  IngestReturningResult,
  HealthStatus,
  EngineCapabilities,
  StorageSegment,
  StorageConfig,
} from './core/types.js';

// Core abstractions
export { StorageEngine } from './core/storage-engine.js';
export { QueryTranslator } from './core/query-translator.js';
export type { NativeQuery } from './core/query-translator.js';

// Factory and client
export { StorageEngineFactory } from './factory.js';
export { Reservoir } from './client.js';

// Engines
export { TimescaleEngine, TimescaleQueryTranslator } from './engines/timescale/index.js';
export type { TimescaleEngineOptions } from './engines/timescale/index.js';
