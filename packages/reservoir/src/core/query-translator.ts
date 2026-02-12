import type { QueryParams, AggregateParams } from './types.js';

/** A native query in engine-specific format */
export interface NativeQuery {
  query: string | object;
  parameters?: unknown[];
  metadata?: Record<string, unknown>;
}

/**
 * Abstract query translator.
 *
 * Converts abstract QueryParams/AggregateParams into engine-specific
 * native queries (SQL for TimescaleDB, ClickHouse SQL, etc.)
 */
export abstract class QueryTranslator {
  abstract translateQuery(params: QueryParams): NativeQuery;
  abstract translateAggregate(params: AggregateParams): NativeQuery;
}
