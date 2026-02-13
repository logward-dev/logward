import type { QueryParams, AggregateParams } from './types.js';

/** A native query in engine-specific format */
export interface NativeQuery {
  query: string | object;
  parameters?: unknown[];
  metadata?: Record<string, unknown>;
}

/** Allowed top-level column names for DISTINCT queries */
const ALLOWED_COLUMNS = new Set(['service', 'level', 'message', 'trace_id', 'span_id', 'project_id']);

/**
 * Strict pattern for metadata key names.
 * Only alphanumeric, underscore, and dot (for nested paths).
 * No quotes, semicolons, spaces, or other special chars allowed.
 */
const VALID_METADATA_KEY = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

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
   * Validate a field name for use in DISTINCT/topValues queries.
   * Prevents SQL injection by only allowing known column names
   * or safe metadata.key patterns.
   */
  protected validateFieldName(field: string): void {
    if (field.startsWith('metadata.')) {
      const jsonKey = field.slice('metadata.'.length);
      if (!jsonKey || jsonKey.length > 64 || !VALID_METADATA_KEY.test(jsonKey)) {
        throw new Error(`Invalid metadata field name: ${field}`);
      }
    } else if (!ALLOWED_COLUMNS.has(field)) {
      throw new Error(`Invalid field name for distinct query: ${field}`);
    }
  }

  /**
   * Validate limit/offset are non-negative.
   */
  protected validatePagination(limit?: number, offset?: number): void {
    if (limit !== undefined && limit < 0) {
      throw new Error('Limit must be non-negative');
    }
    if (offset !== undefined && offset < 0) {
      throw new Error('Offset must be non-negative');
    }
  }

  /**
   * Validate that an array filter is not empty.
   * Empty arrays silently produce zero results which is confusing.
   */
  protected validateArrayFilter(column: string, value: string | string[]): void {
    if (Array.isArray(value) && value.length === 0) {
      throw new Error(`Empty array filter not allowed for ${column}. Omit the filter to match all values.`);
    }
  }
}
