import { QueryTranslator, type NativeQuery } from '../../core/query-translator.js';
import type {
  AggregateParams,
  AggregationInterval,
  CountParams,
  DeleteByTimeRangeParams,
  DistinctParams,
  QueryParams,
  TopValuesParams,
} from '../../core/types.js';

const INTERVAL_MAP: Record<AggregationInterval, string> = {
  '1m': '1 MINUTE',
  '5m': '5 MINUTE',
  '15m': '15 MINUTE',
  '1h': '1 HOUR',
  '6h': '6 HOUR',
  '1d': '1 DAY',
  '1w': '1 WEEK',
};

/**
 * ClickHouse query translator.
 *
 * Uses ClickHouse named parameters ({name:Type}) for safe query binding.
 */
export class ClickHouseQueryTranslator extends QueryTranslator {
  private tableName: string;

  constructor(tableName = 'logs') {
    super();
    this.tableName = tableName;
  }

  translateQuery(params: QueryParams): NativeQuery {
    const conditions: string[] = [];
    const queryParams: Record<string, unknown> = {};

    if (params.organizationId !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'organization_id', params.organizationId);
    }
    if (params.projectId !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'project_id', params.projectId);
    }
    if (params.service !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'service', params.service);
    }
    if (params.level !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'level', params.level);
    }

    if (params.hostname !== undefined) {
      if (Array.isArray(params.hostname)) {
        conditions.push(`JSONExtractString(metadata, 'hostname') IN {p_hostname:Array(String)}`);
        queryParams.p_hostname = params.hostname;
      } else {
        conditions.push(`JSONExtractString(metadata, 'hostname') = {p_hostname:String}`);
        queryParams.p_hostname = params.hostname;
      }
    }

    if (params.traceId !== undefined) {
      conditions.push(`trace_id = {p_trace_id:String}`);
      queryParams.p_trace_id = params.traceId;
    }

    conditions.push(`time ${params.fromExclusive ? '>' : '>='} {p_from:DateTime64(3)}`);
    queryParams.p_from = params.from.getTime() / 1000;
    conditions.push(`time ${params.toExclusive ? '<' : '<='} {p_to:DateTime64(3)}`);
    queryParams.p_to = params.to.getTime() / 1000;

    if (params.search) {
      if (params.searchMode === 'substring') {
        conditions.push(`positionCaseInsensitive(message, {p_search:String}) > 0`);
        queryParams.p_search = params.search;
      } else {
        conditions.push(`hasToken(lower(message), {p_search:String})`);
        queryParams.p_search = params.search.toLowerCase();
      }
    }

    if (params.cursor) {
      try {
        const decoded = Buffer.from(params.cursor, 'base64').toString('utf-8');
        const commaIdx = decoded.indexOf(',');
        if (commaIdx > 0) {
          const cursorTime = decoded.slice(0, commaIdx);
          const cursorId = decoded.slice(commaIdx + 1);
          const parsedTime = new Date(cursorTime);
          if (cursorId && !isNaN(parsedTime.getTime())) {
            conditions.push(`(time, id) < ({p_cursor_time:DateTime64(3)}, {p_cursor_id:UUID})`);
            queryParams.p_cursor_time = parsedTime.getTime() / 1000;
            queryParams.p_cursor_id = cursorId;
          }
        }
      } catch {
        // invalid cursor - skip
      }
    }

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;
    const sortOrder = params.sortOrder === 'asc' ? 'ASC' : 'DESC';

    let query = `SELECT * FROM ${this.tableName}${where} ORDER BY time ${sortOrder}, id ${sortOrder} LIMIT {p_limit:UInt32}`;
    queryParams.p_limit = limit + 1;

    if (offset > 0) {
      query += ` OFFSET {p_offset:UInt32}`;
      queryParams.p_offset = offset;
    }

    return { query, parameters: [queryParams], metadata: { limit } };
  }

  translateAggregate(params: AggregateParams): NativeQuery {
    const conditions: string[] = [];
    const queryParams: Record<string, unknown> = {};

    const interval = INTERVAL_MAP[params.interval];

    if (params.organizationId !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'organization_id', params.organizationId);
    }
    if (params.projectId !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'project_id', params.projectId);
    }
    if (params.service !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'service', params.service);
    }

    conditions.push(`time >= {p_from:DateTime64(3)}`);
    queryParams.p_from = params.from.getTime() / 1000;
    conditions.push(`time <= {p_to:DateTime64(3)}`);
    queryParams.p_to = params.to.getTime() / 1000;

    const where = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';

    const query = `SELECT toStartOfInterval(time, INTERVAL ${interval}) AS bucket, level, count() AS total FROM ${this.tableName}${where} GROUP BY bucket, level ORDER BY bucket ASC`;

    return { query, parameters: [queryParams] };
  }

  translateCount(params: CountParams): NativeQuery {
    const conditions: string[] = [];
    const queryParams: Record<string, unknown> = {};

    if (params.organizationId !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'organization_id', params.organizationId);
    }
    if (params.projectId !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'project_id', params.projectId);
    }
    if (params.service !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'service', params.service);
    }
    if (params.level !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'level', params.level);
    }
    if (params.hostname !== undefined) {
      if (Array.isArray(params.hostname)) {
        conditions.push(`JSONExtractString(metadata, 'hostname') IN {p_hostname:Array(String)}`);
        queryParams.p_hostname = params.hostname;
      } else {
        conditions.push(`JSONExtractString(metadata, 'hostname') = {p_hostname:String}`);
        queryParams.p_hostname = params.hostname;
      }
    }
    if (params.traceId !== undefined) {
      conditions.push(`trace_id = {p_trace_id:String}`);
      queryParams.p_trace_id = params.traceId;
    }

    conditions.push(`time >= {p_from:DateTime64(3)}`);
    queryParams.p_from = params.from.getTime() / 1000;
    conditions.push(`time <= {p_to:DateTime64(3)}`);
    queryParams.p_to = params.to.getTime() / 1000;

    if (params.search) {
      if (params.searchMode === 'substring') {
        conditions.push(`positionCaseInsensitive(message, {p_search:String}) > 0`);
        queryParams.p_search = params.search;
      } else {
        conditions.push(`hasToken(lower(message), {p_search:String})`);
        queryParams.p_search = params.search.toLowerCase();
      }
    }

    const where = ` WHERE ${conditions.join(' AND ')}`;
    const query = `SELECT count() AS count FROM ${this.tableName}${where}`;
    return { query, parameters: [queryParams] };
  }

  translateDistinct(params: DistinctParams): NativeQuery {
    this.validateFieldName(params.field);

    const conditions: string[] = [];
    const queryParams: Record<string, unknown> = {};

    if (params.organizationId !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'organization_id', params.organizationId);
    }
    if (params.projectId !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'project_id', params.projectId);
    }
    if (params.service !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'service', params.service);
    }
    if (params.level !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'level', params.level);
    }
    if (params.hostname !== undefined) {
      if (Array.isArray(params.hostname)) {
        conditions.push(`JSONExtractString(metadata, 'hostname') IN {p_hostname:Array(String)}`);
        queryParams.p_hostname = params.hostname;
      } else {
        conditions.push(`JSONExtractString(metadata, 'hostname') = {p_hostname:String}`);
        queryParams.p_hostname = params.hostname;
      }
    }

    conditions.push(`time >= {p_from:DateTime64(3)}`);
    queryParams.p_from = params.from.getTime() / 1000;
    conditions.push(`time <= {p_to:DateTime64(3)}`);
    queryParams.p_to = params.to.getTime() / 1000;

    let selectExpr: string;
    if (params.field.startsWith('metadata.')) {
      const jsonKey = params.field.slice('metadata.'.length);
      selectExpr = `JSONExtractString(metadata, '${jsonKey}')`;
    } else {
      selectExpr = params.field;
    }

    conditions.push(`${selectExpr} != ''`);

    const where = ` WHERE ${conditions.join(' AND ')}`;
    let query = `SELECT DISTINCT ${selectExpr} AS value FROM ${this.tableName}${where} ORDER BY value ASC`;

    if (params.limit) {
      query += ` LIMIT {p_limit:UInt32}`;
      queryParams.p_limit = params.limit;
    }

    return { query, parameters: [queryParams] };
  }

  translateTopValues(params: TopValuesParams): NativeQuery {
    this.validateFieldName(params.field);

    const conditions: string[] = [];
    const queryParams: Record<string, unknown> = {};

    if (params.organizationId !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'organization_id', params.organizationId);
    }
    if (params.projectId !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'project_id', params.projectId);
    }
    if (params.service !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'service', params.service);
    }
    if (params.level !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'level', params.level);
    }
    if (params.hostname !== undefined) {
      if (Array.isArray(params.hostname)) {
        conditions.push(`JSONExtractString(metadata, 'hostname') IN {p_hostname:Array(String)}`);
        queryParams.p_hostname = params.hostname;
      } else {
        conditions.push(`JSONExtractString(metadata, 'hostname') = {p_hostname:String}`);
        queryParams.p_hostname = params.hostname;
      }
    }

    conditions.push(`time >= {p_from:DateTime64(3)}`);
    queryParams.p_from = params.from.getTime() / 1000;
    conditions.push(`time <= {p_to:DateTime64(3)}`);
    queryParams.p_to = params.to.getTime() / 1000;

    let selectExpr: string;
    if (params.field.startsWith('metadata.')) {
      const jsonKey = params.field.slice('metadata.'.length);
      selectExpr = `JSONExtractString(metadata, '${jsonKey}')`;
    } else {
      selectExpr = params.field;
    }

    conditions.push(`${selectExpr} != ''`);

    const where = ` WHERE ${conditions.join(' AND ')}`;
    let query = `SELECT ${selectExpr} AS value, count() AS count FROM ${this.tableName}${where} GROUP BY value ORDER BY count DESC`;

    if (params.limit) {
      query += ` LIMIT {p_limit:UInt32}`;
      queryParams.p_limit = params.limit;
    }

    return { query, parameters: [queryParams] };
  }

  translateDelete(params: DeleteByTimeRangeParams): NativeQuery {
    const conditions: string[] = [];
    const queryParams: Record<string, unknown> = {};

    if (Array.isArray(params.projectId)) {
      conditions.push(`project_id IN {p_project_id:Array(String)}`);
      queryParams.p_project_id = params.projectId;
    } else {
      conditions.push(`project_id = {p_project_id:String}`);
      queryParams.p_project_id = params.projectId;
    }

    conditions.push(`time >= {p_from:DateTime64(3)}`);
    queryParams.p_from = params.from.getTime() / 1000;
    conditions.push(`time < {p_to:DateTime64(3)}`);
    queryParams.p_to = params.to.getTime() / 1000;

    if (params.service !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'service', params.service);
    }
    if (params.level !== undefined) {
      this.pushClickHouseFilter(conditions, queryParams, 'level', params.level);
    }

    const where = ` WHERE ${conditions.join(' AND ')}`;
    // ClickHouse uses ALTER TABLE ... DELETE for mutations
    const query = `ALTER TABLE ${this.tableName} DELETE${where}`;
    return { query, parameters: [queryParams] };
  }

  private pushClickHouseFilter(
    conditions: string[],
    queryParams: Record<string, unknown>,
    column: string,
    value: string | string[],
  ): void {
    const paramName = `p_${column}`;
    if (Array.isArray(value)) {
      conditions.push(`${column} IN {${paramName}:Array(String)}`);
      queryParams[paramName] = value;
    } else {
      conditions.push(`${column} = {${paramName}:String}`);
      queryParams[paramName] = value;
    }
  }
}
