import { db } from '../../database/index.js';
import { sql } from 'kysely';
import type { TransformedSpan, AggregatedTrace } from '../otlp/trace-transformer.js';
import type { SpanKind, SpanStatusCode } from '../../database/types.js';

export interface TraceListQuery {
  projectId: string;
  service?: string;
  error?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface TraceListResult {
  traces: TraceRecord[];
  total: number;
}

export interface TraceRecord {
  trace_id: string;
  service_name: string;
  root_service_name: string | null;
  root_operation_name: string | null;
  start_time: Date;
  end_time: Date;
  duration_ms: number;
  span_count: number;
  error: boolean;
}

export interface SpanRecord {
  span_id: string;
  trace_id: string;
  parent_span_id: string | null;
  service_name: string;
  operation_name: string;
  start_time: Date;
  end_time: Date;
  duration_ms: number;
  kind: SpanKind | null;
  status_code: SpanStatusCode | null;
  status_message: string | null;
  attributes: Record<string, unknown> | null;
  events: Array<Record<string, unknown>> | null;
  links: Array<Record<string, unknown>> | null;
  resource_attributes: Record<string, unknown> | null;
}

export class TracesService {
  async ingestSpans(
    spans: TransformedSpan[],
    traces: Map<string, AggregatedTrace>,
    projectId: string,
    organizationId: string
  ): Promise<number> {
    if (spans.length === 0) {
      return 0;
    }

    const times: Date[] = [];
    const spanIds: string[] = [];
    const traceIds: string[] = [];
    const parentSpanIds: (string | null)[] = [];
    const serviceNames: string[] = [];
    const operationNames: string[] = [];
    const startTimes: Date[] = [];
    const endTimes: Date[] = [];
    const durationMsValues: number[] = [];
    const kinds: (string | null)[] = [];
    const statusCodes: (string | null)[] = [];
    const statusMessages: (string | null)[] = [];
    const attributesJsons: (string | null)[] = [];
    const eventsJsons: (string | null)[] = [];
    const linksJsons: (string | null)[] = [];
    const resourceAttributesJsons: (string | null)[] = [];

    for (const span of spans) {
      times.push(new Date(span.start_time));
      spanIds.push(span.span_id);
      traceIds.push(span.trace_id);
      parentSpanIds.push(span.parent_span_id || null);
      serviceNames.push(span.service_name);
      operationNames.push(span.operation_name);
      startTimes.push(new Date(span.start_time));
      endTimes.push(new Date(span.end_time));
      durationMsValues.push(span.duration_ms);
      kinds.push(span.kind || null);
      statusCodes.push(span.status_code || null);
      statusMessages.push(span.status_message || null);
      attributesJsons.push(span.attributes ? JSON.stringify(span.attributes) : null);
      eventsJsons.push(span.events ? JSON.stringify(span.events) : null);
      linksJsons.push(span.links ? JSON.stringify(span.links) : null);
      resourceAttributesJsons.push(span.resource_attributes ? JSON.stringify(span.resource_attributes) : null);
    }

    // Batch insert using UNNEST - single query for all spans
    await sql`
      INSERT INTO spans (
        time, span_id, trace_id, parent_span_id, organization_id, project_id,
        service_name, operation_name, start_time, end_time, duration_ms,
        kind, status_code, status_message, attributes, events, links, resource_attributes
      )
      SELECT
        unnest(${times}::timestamptz[]),
        unnest(${spanIds}::text[]),
        unnest(${traceIds}::text[]),
        unnest(${parentSpanIds}::text[]),
        ${organizationId},
        ${projectId},
        unnest(${serviceNames}::text[]),
        unnest(${operationNames}::text[]),
        unnest(${startTimes}::timestamptz[]),
        unnest(${endTimes}::timestamptz[]),
        unnest(${durationMsValues}::integer[]),
        unnest(${kinds}::text[]),
        unnest(${statusCodes}::text[]),
        unnest(${statusMessages}::text[]),
        unnest(${attributesJsons}::jsonb[]),
        unnest(${eventsJsons}::jsonb[]),
        unnest(${linksJsons}::jsonb[]),
        unnest(${resourceAttributesJsons}::jsonb[])
    `.execute(db);

    // Batch upsert traces
    for (const [, trace] of traces) {
      await this.upsertTrace(trace, projectId, organizationId);
    }

    return spans.length;
  }

  private async upsertTrace(
    trace: AggregatedTrace,
    projectId: string,
    organizationId: string
  ): Promise<void> {
    const existing = await db
      .selectFrom('traces')
      .select(['trace_id', 'start_time', 'end_time', 'span_count', 'error'])
      .where('trace_id', '=', trace.trace_id)
      .where('project_id', '=', projectId)
      .executeTakeFirst();

    if (!existing) {
      await db
        .insertInto('traces')
        .values({
          trace_id: trace.trace_id,
          organization_id: organizationId,
          project_id: projectId,
          service_name: trace.service_name,
          root_service_name: trace.root_service_name || null,
          root_operation_name: trace.root_operation_name || null,
          start_time: new Date(trace.start_time),
          end_time: new Date(trace.end_time),
          duration_ms: trace.duration_ms,
          span_count: trace.span_count,
          error: trace.error,
        })
        .execute();
    } else {
      const newStart = new Date(trace.start_time);
      const newEnd = new Date(trace.end_time);
      const existingStart = new Date(existing.start_time);
      const existingEnd = new Date(existing.end_time);

      const startTime = newStart < existingStart ? newStart : existingStart;
      const endTime = newEnd > existingEnd ? newEnd : existingEnd;
      const durationMs = endTime.getTime() - startTime.getTime();

      await db
        .updateTable('traces')
        .set({
          start_time: startTime,
          end_time: endTime,
          duration_ms: durationMs,
          span_count: existing.span_count + trace.span_count,
          error: existing.error || trace.error,
          root_service_name: trace.root_service_name || undefined,
          root_operation_name: trace.root_operation_name || undefined,
        })
        .where('trace_id', '=', trace.trace_id)
        .where('project_id', '=', projectId)
        .execute();
    }
  }

  async listTraces(query: TraceListQuery): Promise<TraceListResult> {
    let baseQuery = db
      .selectFrom('traces')
      .where('project_id', '=', query.projectId);

    if (query.service) {
      baseQuery = baseQuery.where('service_name', '=', query.service);
    }

    if (query.error !== undefined) {
      baseQuery = baseQuery.where('error', '=', query.error);
    }

    if (query.from) {
      baseQuery = baseQuery.where('start_time', '>=', query.from);
    }

    if (query.to) {
      baseQuery = baseQuery.where('start_time', '<=', query.to);
    }

    const countResult = await baseQuery
      .select(db.fn.count<number>('trace_id').as('count'))
      .executeTakeFirst();

    const total = Number(countResult?.count || 0);

    const traces = await baseQuery
      .select([
        'trace_id',
        'service_name',
        'root_service_name',
        'root_operation_name',
        'start_time',
        'end_time',
        'duration_ms',
        'span_count',
        'error',
      ])
      .orderBy('start_time', 'desc')
      .limit(query.limit || 50)
      .offset(query.offset || 0)
      .execute();

    return {
      traces: traces as TraceRecord[],
      total,
    };
  }

  async getTrace(traceId: string, projectId: string): Promise<TraceRecord | null> {
    const trace = await db
      .selectFrom('traces')
      .select([
        'trace_id',
        'service_name',
        'root_service_name',
        'root_operation_name',
        'start_time',
        'end_time',
        'duration_ms',
        'span_count',
        'error',
      ])
      .where('trace_id', '=', traceId)
      .where('project_id', '=', projectId)
      .executeTakeFirst();

    return trace as TraceRecord | null;
  }

  async getTraceSpans(traceId: string, projectId: string): Promise<SpanRecord[]> {
    const spans = await db
      .selectFrom('spans')
      .select([
        'span_id',
        'trace_id',
        'parent_span_id',
        'service_name',
        'operation_name',
        'start_time',
        'end_time',
        'duration_ms',
        'kind',
        'status_code',
        'status_message',
        'attributes',
        'events',
        'links',
        'resource_attributes',
      ])
      .where('trace_id', '=', traceId)
      .where('project_id', '=', projectId)
      .orderBy('start_time', 'asc')
      .execute();

    return spans as SpanRecord[];
  }

  async getServices(projectId: string): Promise<string[]> {
    const result = await db
      .selectFrom('traces')
      .select('service_name')
      .where('project_id', '=', projectId)
      .groupBy('service_name')
      .orderBy('service_name', 'asc')
      .execute();

    return result.map((r) => r.service_name);
  }

  async getServiceDependencies(projectId: string, from?: Date, to?: Date): Promise<{
    nodes: Array<{ id: string; name: string; callCount: number }>;
    edges: Array<{ source: string; target: string; callCount: number }>;
  }> {
    // Use raw SQL for complex self-join with aliased tables
    // Build time filter clause
    const timeFilter = from && to
      ? sql`AND child.start_time >= ${from} AND child.start_time <= ${to}`
      : from
        ? sql`AND child.start_time >= ${from}`
        : to
          ? sql`AND child.start_time <= ${to}`
          : sql``;

    const result = await sql<{ source_service: string; target_service: string; call_count: string }>`
      SELECT
        parent.service_name as source_service,
        child.service_name as target_service,
        COUNT(child.span_id) as call_count
      FROM spans child
      INNER JOIN spans parent
        ON child.parent_span_id = parent.span_id
        AND child.trace_id = parent.trace_id
      WHERE child.project_id = ${projectId}
        AND child.service_name <> parent.service_name
        ${timeFilter}
      GROUP BY parent.service_name, child.service_name
    `.execute(db);

    const dependencies = result.rows;


    const serviceCallCounts = new Map<string, number>();
    const edges: Array<{ source: string; target: string; callCount: number }> = [];

    for (const dep of dependencies) {
      const source = dep.source_service;
      const target = dep.target_service;
      const count = Number(dep.call_count);

      serviceCallCounts.set(source, (serviceCallCounts.get(source) || 0) + count);
      serviceCallCounts.set(target, (serviceCallCounts.get(target) || 0) + count);

      edges.push({
        source,
        target,
        callCount: count,
      });
    }

    const nodes = Array.from(serviceCallCounts.entries()).map(([name, callCount]) => ({
      id: name,
      name,
      callCount,
    }));

    return { nodes, edges };
  }

  async getStats(projectId: string, from?: Date, to?: Date) {
    let query = db
      .selectFrom('traces')
      .where('project_id', '=', projectId);

    if (from) {
      query = query.where('start_time', '>=', from);
    }

    if (to) {
      query = query.where('start_time', '<=', to);
    }

    const stats = await query
      .select([
        db.fn.count<number>('trace_id').as('total_traces'),
        db.fn.sum<number>('span_count').as('total_spans'),
        db.fn.avg<number>('duration_ms').as('avg_duration'),
        db.fn.max<number>('duration_ms').as('max_duration'),
      ])
      .executeTakeFirst();

    const errorCount = await query
      .select(db.fn.count<number>('trace_id').as('count'))
      .where('error', '=', true)
      .executeTakeFirst();

    return {
      total_traces: Number(stats?.total_traces || 0),
      total_spans: Number(stats?.total_spans || 0),
      avg_duration_ms: Math.round(Number(stats?.avg_duration || 0)),
      max_duration_ms: Number(stats?.max_duration || 0),
      error_count: Number(errorCount?.count || 0),
      error_rate: stats?.total_traces
        ? Number(errorCount?.count || 0) / Number(stats.total_traces)
        : 0,
    };
  }
}

export const tracesService = new TracesService();
