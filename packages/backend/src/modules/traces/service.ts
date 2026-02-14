import { db } from '../../database/index.js';
import { reservoir } from '../../database/reservoir.js';
import type { TransformedSpan, AggregatedTrace } from '../otlp/trace-transformer.js';
import type {
  SpanRecord as ReservoirSpanRecord,
  TraceRecord as ReservoirTraceRecord,
} from '@logtide/reservoir';

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
  kind: string | null;
  status_code: string | null;
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
    if (spans.length === 0) return 0;

    const reservoirSpans: ReservoirSpanRecord[] = spans.map((span) => ({
      time: new Date(span.start_time),
      spanId: span.span_id,
      traceId: span.trace_id,
      parentSpanId: span.parent_span_id || undefined,
      organizationId,
      projectId,
      serviceName: span.service_name,
      operationName: span.operation_name,
      startTime: new Date(span.start_time),
      endTime: new Date(span.end_time),
      durationMs: span.duration_ms,
      kind: span.kind || undefined,
      statusCode: span.status_code || undefined,
      statusMessage: span.status_message || undefined,
      attributes: span.attributes || undefined,
      events: span.events as Array<Record<string, unknown>> | undefined,
      links: span.links as Array<Record<string, unknown>> | undefined,
      resourceAttributes: span.resource_attributes || undefined,
    }));

    const result = await reservoir.ingestSpans(reservoirSpans);

    for (const [, trace] of traces) {
      await reservoir.upsertTrace({
        traceId: trace.trace_id,
        organizationId,
        projectId,
        serviceName: trace.service_name,
        rootServiceName: trace.root_service_name || undefined,
        rootOperationName: trace.root_operation_name || undefined,
        startTime: new Date(trace.start_time),
        endTime: new Date(trace.end_time),
        durationMs: trace.duration_ms,
        spanCount: trace.span_count,
        error: trace.error,
      });
    }

    return result.ingested;
  }

  async listTraces(query: TraceListQuery): Promise<TraceListResult> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const result = await reservoir.queryTraces({
      projectId: query.projectId,
      serviceName: query.service || undefined,
      error: query.error,
      from: query.from || thirtyDaysAgo,
      to: query.to || now,
      limit: query.limit || 50,
      offset: query.offset || 0,
    });

    return {
      traces: result.traces.map(toTraceRecord),
      total: result.total,
    };
  }

  async getTrace(traceId: string, projectId: string): Promise<TraceRecord | null> {
    const trace = await reservoir.getTraceById(traceId, projectId);
    return trace ? toTraceRecord(trace) : null;
  }

  async getTraceSpans(traceId: string, projectId: string): Promise<SpanRecord[]> {
    const spans = await reservoir.getSpansByTraceId(traceId, projectId);
    return spans.map(toSpanRecord);
  }

  async getServices(projectId: string, from?: Date): Promise<string[]> {
    const effectiveFrom = from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Query traces for distinct services - stays in Kysely for timescale,
    // uses reservoir queryTraces for clickhouse
    if (reservoir.getEngineType() === 'timescale') {
      const result = await db
        .selectFrom('traces')
        .select('service_name')
        .where('project_id', '=', projectId)
        .where('start_time', '>=', effectiveFrom)
        .groupBy('service_name')
        .orderBy('service_name', 'asc')
        .execute();
      return result.map((r) => r.service_name);
    }

    // ClickHouse: query via reservoir
    const result = await reservoir.queryTraces({
      projectId,
      from: effectiveFrom,
      to: new Date(),
      limit: 10000,
    });
    const serviceSet = new Set(result.traces.map((t: { serviceName: string }) => t.serviceName));
    return Array.from(serviceSet).sort() as string[];
  }

  async getServiceDependencies(projectId: string, from?: Date, to?: Date) {
    return reservoir.getServiceDependencies(projectId, from, to);
  }

  async getStats(projectId: string, from?: Date, to?: Date) {
    // Stats require aggregation (count, sum, avg, max) - use Kysely for timescale
    if (reservoir.getEngineType() === 'timescale') {
      let query = db
        .selectFrom('traces')
        .where('project_id', '=', projectId);

      if (from) query = query.where('start_time', '>=', from);
      if (to) query = query.where('start_time', '<=', to);

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

    // ClickHouse: query all traces and compute stats in app layer
    const result = await reservoir.queryTraces({
      projectId,
      from: from || new Date(0),
      to: to || new Date(),
      limit: 100000,
    });

    const traces = result.traces;
    const totalTraces = result.total;
    const totalSpans = traces.reduce((sum: number, t: { spanCount: number }) => sum + t.spanCount, 0);
    const avgDuration = traces.length > 0
      ? traces.reduce((sum: number, t: { durationMs: number }) => sum + t.durationMs, 0) / traces.length
      : 0;
    const maxDuration = traces.length > 0
      ? Math.max(...traces.map((t: { durationMs: number }) => t.durationMs))
      : 0;
    const errorCount = traces.filter((t: { error: boolean }) => t.error).length;

    return {
      total_traces: totalTraces,
      total_spans: totalSpans,
      avg_duration_ms: Math.round(avgDuration),
      max_duration_ms: maxDuration,
      error_count: errorCount,
      error_rate: totalTraces > 0 ? errorCount / totalTraces : 0,
    };
  }
}

function toTraceRecord(t: ReservoirTraceRecord): TraceRecord {
  return {
    trace_id: t.traceId,
    service_name: t.serviceName,
    root_service_name: t.rootServiceName ?? null,
    root_operation_name: t.rootOperationName ?? null,
    start_time: t.startTime,
    end_time: t.endTime,
    duration_ms: t.durationMs,
    span_count: t.spanCount,
    error: t.error,
  };
}

function toSpanRecord(s: ReservoirSpanRecord): SpanRecord {
  return {
    span_id: s.spanId,
    trace_id: s.traceId,
    parent_span_id: s.parentSpanId ?? null,
    service_name: s.serviceName,
    operation_name: s.operationName,
    start_time: s.startTime,
    end_time: s.endTime,
    duration_ms: s.durationMs,
    kind: s.kind ?? null,
    status_code: s.statusCode ?? null,
    status_message: s.statusMessage ?? null,
    attributes: s.attributes ?? null,
    events: s.events ?? null,
    links: s.links ?? null,
    resource_attributes: s.resourceAttributes ?? null,
  };
}

export const tracesService = new TracesService();
