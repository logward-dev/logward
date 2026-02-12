import type { QueryParams, AggregateParams } from './types.js';

/** A native query in engine-specific format */
export interface NativeQuery {
  query: string | object;
  parameters?: unknown[];
  metadata?: Record<string, unknown>;
}

/** Allowed top-level column names for DISTINCT queries */
const ALLOWED_COLUMNS = new Set(['service', 'level', 'message', 'trace_id', 'span_id', 'project_id']);

/** Pattern for valid metadata key names (alphanumeric + underscore/hyphen/dot) */
const VALID_METADATA_KEY = /^[a-zA-Z_][a-zA-Z0-9_.\-]*$/;

/**
 * Abstract query translator.
 *
 * Converts abstract QueryParams/AggregateParams into engine-specific
 * native queries (SQL for TimescaleDB, ClickHouse SQL, etc.)
 */
export abstract class QueryTranslator {
  abstract translateQuery(params: QueryParams): NativeQuery;
  abstract translateAggregate(params: AggregateParams): NativeQuery;

  /**
   * Validate a field name for use in DISTINCT queries.
   * Prevents SQL injection by only allowing known column names
   * or safe metadata.key patterns.
   */
  protected validateFieldName(field: string): void {
    if (field.startsWith('metadata.')) {
      const jsonKey = field.slice('metadata.'.length);
      if (!jsonKey || !VALID_METADATA_KEY.test(jsonKey)) {
        throw new Error(`Invalid metadata field name: ${field}`);
      }
    } else if (!ALLOWED_COLUMNS.has(field)) {
      throw new Error(`Invalid field name for distinct query: ${field}`);
    }
  }
}
