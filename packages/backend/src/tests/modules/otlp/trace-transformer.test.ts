import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { gzipSync } from 'zlib';
import {
  transformOtlpToSpans,
  transformSpan,
  extractServiceName,
  nanosToIso,
  calculateDurationMs,
  mapSpanKind,
  mapStatusCode,
  transformEvents,
  transformLinks,
  parseOtlpTracesJson,
  parseOtlpTracesProtobuf,
  OTLP_SPAN_KIND,
  OTLP_STATUS_CODE,
  type OtlpSpan,
} from '../../../modules/otlp/trace-transformer.js';

describe('OTLP Trace Transformer', () => {
  // ==========================================================================
  // transformOtlpToSpans
  // ==========================================================================
  describe('transformOtlpToSpans', () => {
    it('should return empty spans for empty request', () => {
      const result = transformOtlpToSpans({});

      expect(result.spans).toEqual([]);
      expect(result.traces.size).toBe(0);
    });

    it('should return empty spans for null resourceSpans', () => {
      const result = transformOtlpToSpans({ resourceSpans: undefined });

      expect(result.spans).toEqual([]);
    });

    it('should transform a basic span', () => {
      const now = BigInt(Date.now() * 1000000);
      const end = now + 100000000n;

      const result = transformOtlpToSpans({
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'test-svc' } }],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'abc123',
                    spanId: 'span1',
                    name: 'test-op',
                    startTimeUnixNano: now.toString(),
                    endTimeUnixNano: end.toString(),
                  },
                ],
              },
            ],
          },
        ],
      });

      expect(result.spans).toHaveLength(1);
      expect(result.spans[0].trace_id).toBe('abc123');
      expect(result.spans[0].span_id).toBe('span1');
      expect(result.spans[0].service_name).toBe('test-svc');
      expect(result.spans[0].operation_name).toBe('test-op');
    });

    it('should handle empty scopeSpans', () => {
      const result = transformOtlpToSpans({
        resourceSpans: [
          {
            resource: {},
            scopeSpans: [],
          },
        ],
      });

      expect(result.spans).toEqual([]);
    });

    it('should handle null scopeSpans', () => {
      const result = transformOtlpToSpans({
        resourceSpans: [
          {
            resource: {},
            scopeSpans: undefined,
          },
        ],
      });

      expect(result.spans).toEqual([]);
    });

    it('should handle empty spans array', () => {
      const result = transformOtlpToSpans({
        resourceSpans: [
          {
            resource: {},
            scopeSpans: [{ spans: [] }],
          },
        ],
      });

      expect(result.spans).toEqual([]);
    });

    it('should aggregate trace information', () => {
      const now = BigInt(Date.now() * 1000000);

      const result = transformOtlpToSpans({
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'svc' } }],
            },
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'trace1',
                    spanId: 'root',
                    name: 'root-op',
                    startTimeUnixNano: now.toString(),
                    endTimeUnixNano: (now + 100000000n).toString(),
                  },
                  {
                    traceId: 'trace1',
                    spanId: 'child',
                    parentSpanId: 'root',
                    name: 'child-op',
                    startTimeUnixNano: (now + 10000000n).toString(),
                    endTimeUnixNano: (now + 50000000n).toString(),
                    status: { code: OTLP_STATUS_CODE.ERROR },
                  },
                ],
              },
            ],
          },
        ],
      });

      expect(result.spans).toHaveLength(2);
      expect(result.traces.size).toBe(1);

      const trace = result.traces.get('trace1');
      expect(trace).toBeDefined();
      expect(trace?.span_count).toBe(2);
      expect(trace?.root_operation_name).toBe('root-op');
      expect(trace?.error).toBe(true);
    });

    it('should skip invalid spans (missing traceId)', () => {
      const result = transformOtlpToSpans({
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    spanId: 'span1',
                    name: 'test',
                  } as OtlpSpan,
                ],
              },
            ],
          },
        ],
      });

      expect(result.spans).toEqual([]);
    });

    it('should skip spans with all-zero trace IDs', () => {
      const result = transformOtlpToSpans({
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: '00000000000000000000000000000000',
                    spanId: 'span1',
                    name: 'test',
                  },
                ],
              },
            ],
          },
        ],
      });

      expect(result.spans).toEqual([]);
    });
  });

  // ==========================================================================
  // transformSpan
  // ==========================================================================
  describe('transformSpan', () => {
    it('should return null for span without traceId', () => {
      const result = transformSpan({ spanId: 'span1' } as OtlpSpan, 'svc', {});

      expect(result).toBeNull();
    });

    it('should return null for span without spanId', () => {
      const result = transformSpan({ traceId: 'trace1' } as OtlpSpan, 'svc', {});

      expect(result).toBeNull();
    });

    it('should return null for all-zero traceId', () => {
      const result = transformSpan(
        { traceId: '0000000000000000', spanId: 'span1' },
        'svc',
        {}
      );

      expect(result).toBeNull();
    });

    it('should transform a complete span', () => {
      const now = BigInt(Date.now() * 1000000);
      const end = now + 100000000n;

      const span: OtlpSpan = {
        traceId: 'trace123',
        spanId: 'span456',
        parentSpanId: 'parent789',
        name: 'my-operation',
        kind: OTLP_SPAN_KIND.SERVER,
        startTimeUnixNano: now.toString(),
        endTimeUnixNano: end.toString(),
        status: { code: OTLP_STATUS_CODE.OK, message: 'success' },
        attributes: [{ key: 'http.method', value: { stringValue: 'GET' } }],
        events: [{ name: 'event1', timeUnixNano: now.toString() }],
        links: [{ traceId: 'linked', spanId: 'linkedSpan' }],
      };

      const result = transformSpan(span, 'my-service', { host: 'server1' });

      expect(result).not.toBeNull();
      expect(result?.trace_id).toBe('trace123');
      expect(result?.span_id).toBe('span456');
      expect(result?.parent_span_id).toBe('parent789');
      expect(result?.service_name).toBe('my-service');
      expect(result?.operation_name).toBe('my-operation');
      expect(result?.kind).toBe('SERVER');
      expect(result?.status_code).toBe('OK');
      expect(result?.status_message).toBe('success');
      expect(result?.attributes).toEqual({ 'http.method': 'GET' });
      expect(result?.resource_attributes).toEqual({ host: 'server1' });
    });

    it('should use "unknown" for missing operation name', () => {
      const result = transformSpan(
        { traceId: 'trace1', spanId: 'span1' },
        'svc',
        {}
      );

      expect(result?.operation_name).toBe('unknown');
    });

    it('should handle empty parentSpanId', () => {
      const result = transformSpan(
        { traceId: 'trace1', spanId: 'span1', parentSpanId: '' },
        'svc',
        {}
      );

      expect(result?.parent_span_id).toBeUndefined();
    });

    it('should handle missing status', () => {
      const result = transformSpan(
        { traceId: 'trace1', spanId: 'span1' },
        'svc',
        {}
      );

      expect(result?.status_code).toBeUndefined();
      expect(result?.status_message).toBeUndefined();
    });
  });

  // ==========================================================================
  // extractServiceName
  // ==========================================================================
  describe('extractServiceName', () => {
    it('should return "unknown" for undefined attributes', () => {
      expect(extractServiceName(undefined)).toBe('unknown');
    });

    it('should return "unknown" for empty attributes', () => {
      expect(extractServiceName([])).toBe('unknown');
    });

    it('should extract service.name from attributes', () => {
      const attrs = [
        { key: 'other.attr', value: { stringValue: 'foo' } },
        { key: 'service.name', value: { stringValue: 'my-service' } },
      ];

      expect(extractServiceName(attrs)).toBe('my-service');
    });

    it('should return "unknown" if service.name value is not stringValue', () => {
      const attrs = [{ key: 'service.name', value: { intValue: 123 } }];

      expect(extractServiceName(attrs)).toBe('unknown');
    });

    it('should return "unknown" if service.name has no value', () => {
      const attrs = [{ key: 'service.name' }] as any;

      expect(extractServiceName(attrs)).toBe('unknown');
    });
  });

  // ==========================================================================
  // nanosToIso
  // ==========================================================================
  describe('nanosToIso', () => {
    it('should return current time for undefined input', () => {
      const before = new Date().toISOString();
      const result = nanosToIso(undefined);
      const after = new Date().toISOString();

      // Result should be between before and after
      expect(result >= before).toBe(true);
      expect(result <= after).toBe(true);
    });

    it('should convert string nanoseconds to ISO', () => {
      // 1609459200000 ms = 2021-01-01T00:00:00.000Z
      const nanos = '1609459200000000000';
      const result = nanosToIso(nanos);

      expect(result).toBe('2021-01-01T00:00:00.000Z');
    });

    it('should convert bigint nanoseconds to ISO', () => {
      const nanos = 1609459200000000000n;
      const result = nanosToIso(nanos);

      expect(result).toBe('2021-01-01T00:00:00.000Z');
    });

    it('should handle invalid string gracefully', () => {
      const before = new Date().toISOString();
      const result = nanosToIso('not-a-number');
      const after = new Date().toISOString();

      expect(result >= before).toBe(true);
      expect(result <= after).toBe(true);
    });
  });

  // ==========================================================================
  // calculateDurationMs
  // ==========================================================================
  describe('calculateDurationMs', () => {
    it('should return 0 for undefined start', () => {
      expect(calculateDurationMs(undefined, '1000000000')).toBe(0);
    });

    it('should return 0 for undefined end', () => {
      expect(calculateDurationMs('1000000000', undefined)).toBe(0);
    });

    it('should calculate duration from string nanoseconds', () => {
      const start = '1000000000'; // 1 second = 1000 ms
      const end = '101000000000'; // 101 seconds = 101000 ms
      expect(calculateDurationMs(start, end)).toBe(100000); // 100 seconds = 100000 ms
    });

    it('should calculate duration from bigint nanoseconds', () => {
      const start = 1000000000n; // 1 second
      const end = 201000000000n; // 201 seconds
      expect(calculateDurationMs(start, end)).toBe(200000); // 200 seconds = 200000 ms
    });

    it('should handle mixed string and bigint', () => {
      // 51000000000n - 1000000000 = 50000000000 ns = 50000 ms
      expect(calculateDurationMs('1000000000', 51000000000n)).toBe(50000);
    });

    it('should handle invalid values gracefully', () => {
      expect(calculateDurationMs('invalid', '1000')).toBe(0);
    });
  });

  // ==========================================================================
  // mapSpanKind
  // ==========================================================================
  describe('mapSpanKind', () => {
    it('should return undefined for undefined kind', () => {
      expect(mapSpanKind(undefined)).toBeUndefined();
    });

    it('should return undefined for UNSPECIFIED (0)', () => {
      expect(mapSpanKind(OTLP_SPAN_KIND.UNSPECIFIED)).toBeUndefined();
    });

    it('should map INTERNAL', () => {
      expect(mapSpanKind(OTLP_SPAN_KIND.INTERNAL)).toBe('INTERNAL');
    });

    it('should map SERVER', () => {
      expect(mapSpanKind(OTLP_SPAN_KIND.SERVER)).toBe('SERVER');
    });

    it('should map CLIENT', () => {
      expect(mapSpanKind(OTLP_SPAN_KIND.CLIENT)).toBe('CLIENT');
    });

    it('should map PRODUCER', () => {
      expect(mapSpanKind(OTLP_SPAN_KIND.PRODUCER)).toBe('PRODUCER');
    });

    it('should map CONSUMER', () => {
      expect(mapSpanKind(OTLP_SPAN_KIND.CONSUMER)).toBe('CONSUMER');
    });

    it('should return undefined for unknown kind', () => {
      expect(mapSpanKind(99)).toBeUndefined();
    });
  });

  // ==========================================================================
  // mapStatusCode
  // ==========================================================================
  describe('mapStatusCode', () => {
    it('should return undefined for undefined code', () => {
      expect(mapStatusCode(undefined)).toBeUndefined();
    });

    it('should map UNSET', () => {
      expect(mapStatusCode(OTLP_STATUS_CODE.UNSET)).toBe('UNSET');
    });

    it('should map OK', () => {
      expect(mapStatusCode(OTLP_STATUS_CODE.OK)).toBe('OK');
    });

    it('should map ERROR', () => {
      expect(mapStatusCode(OTLP_STATUS_CODE.ERROR)).toBe('ERROR');
    });

    it('should return undefined for unknown code', () => {
      expect(mapStatusCode(99)).toBeUndefined();
    });
  });

  // ==========================================================================
  // transformEvents
  // ==========================================================================
  describe('transformEvents', () => {
    it('should return undefined for undefined events', () => {
      expect(transformEvents(undefined)).toBeUndefined();
    });

    it('should return undefined for empty events', () => {
      expect(transformEvents([])).toBeUndefined();
    });

    it('should transform events', () => {
      const now = BigInt(Date.now() * 1000000);
      const events = [
        {
          name: 'event1',
          timeUnixNano: now.toString(),
          attributes: [{ key: 'foo', value: { stringValue: 'bar' } }],
        },
        { name: 'event2' },
      ];

      const result = transformEvents(events);

      expect(result).toHaveLength(2);
      expect(result?.[0].name).toBe('event1');
      expect(result?.[0].attributes).toEqual({ foo: 'bar' });
      expect(result?.[1].name).toBe('event2');
    });

    it('should use "event" as default name', () => {
      const result = transformEvents([{}]);

      expect(result?.[0].name).toBe('event');
    });

    it('should handle events without attributes', () => {
      const result = transformEvents([{ name: 'test' }]);

      expect(result?.[0].attributes).toBeUndefined();
    });
  });

  // ==========================================================================
  // transformLinks
  // ==========================================================================
  describe('transformLinks', () => {
    it('should return undefined for undefined links', () => {
      expect(transformLinks(undefined)).toBeUndefined();
    });

    it('should return undefined for empty links', () => {
      expect(transformLinks([])).toBeUndefined();
    });

    it('should transform links', () => {
      const links = [
        {
          traceId: 'trace1',
          spanId: 'span1',
          attributes: [{ key: 'rel', value: { stringValue: 'cause' } }],
        },
        { traceId: 'trace2', spanId: 'span2' },
      ];

      const result = transformLinks(links);

      expect(result).toHaveLength(2);
      expect(result?.[0].trace_id).toBe('trace1');
      expect(result?.[0].span_id).toBe('span1');
      expect(result?.[0].attributes).toEqual({ rel: 'cause' });
      expect(result?.[1].trace_id).toBe('trace2');
      expect(result?.[1].span_id).toBe('span2');
    });

    it('should filter out links without traceId', () => {
      const links = [{ spanId: 'span1' }] as any;

      const result = transformLinks(links);

      expect(result).toEqual([]);
    });

    it('should filter out links without spanId', () => {
      const links = [{ traceId: 'trace1' }] as any;

      const result = transformLinks(links);

      expect(result).toEqual([]);
    });

    it('should handle links without attributes', () => {
      const result = transformLinks([{ traceId: 't', spanId: 's' }]);

      expect(result?.[0].attributes).toBeUndefined();
    });
  });

  // ==========================================================================
  // parseOtlpTracesJson
  // ==========================================================================
  describe('parseOtlpTracesJson', () => {
    it('should return empty resourceSpans for null body', () => {
      const result = parseOtlpTracesJson(null);

      expect(result.resourceSpans).toEqual([]);
    });

    it('should return empty resourceSpans for undefined body', () => {
      const result = parseOtlpTracesJson(undefined);

      expect(result.resourceSpans).toEqual([]);
    });

    it('should parse object body directly', () => {
      const body = {
        resourceSpans: [
          {
            resource: {},
            scopeSpans: [{ spans: [] }],
          },
        ],
      };

      const result = parseOtlpTracesJson(body);

      expect(result.resourceSpans).toHaveLength(1);
    });

    it('should parse JSON string body', () => {
      const body = JSON.stringify({
        resourceSpans: [{ scopeSpans: [{ spans: [] }] }],
      });

      const result = parseOtlpTracesJson(body);

      expect(result.resourceSpans).toHaveLength(1);
    });

    it('should throw error for invalid JSON string', () => {
      expect(() => parseOtlpTracesJson('not valid json')).toThrow('Invalid OTLP Traces JSON');
    });

    it('should throw error for invalid body type', () => {
      expect(() => parseOtlpTracesJson(12345 as any)).toThrow(
        'Invalid OTLP traces request body type'
      );
    });

    it('should normalize snake_case to camelCase', () => {
      const body = {
        resource_spans: [
          {
            resource: {},
            scope_spans: [
              {
                spans: [
                  {
                    trace_id: 'trace1',
                    span_id: 'span1',
                    parent_span_id: 'parent1',
                    trace_state: 'state',
                    start_time_unix_nano: '1000',
                    end_time_unix_nano: '2000',
                  },
                ],
                schema_url: 'https://example.com',
              },
            ],
            schema_url: 'https://example.com/resource',
          },
        ],
      };

      const result = parseOtlpTracesJson(body);

      expect(result.resourceSpans).toHaveLength(1);
      expect(result.resourceSpans?.[0]?.scopeSpans).toBeDefined();

      const span = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0];
      expect(span?.traceId).toBe('trace1');
      expect(span?.spanId).toBe('span1');
      expect(span?.parentSpanId).toBe('parent1');
      expect(span?.traceState).toBe('state');
      expect(span?.startTimeUnixNano).toBe('1000');
      expect(span?.endTimeUnixNano).toBe('2000');
    });

    it('should handle missing resourceSpans', () => {
      const result = parseOtlpTracesJson({});

      expect(result.resourceSpans).toEqual([]);
    });

    it('should handle invalid resourceSpans item', () => {
      const body = {
        resourceSpans: [null, undefined, 'invalid'],
      };

      const result = parseOtlpTracesJson(body);

      expect(result.resourceSpans).toHaveLength(3);
    });

    it('should handle null scopeSpans', () => {
      const body = {
        resourceSpans: [{ scopeSpans: null }],
      };

      const result = parseOtlpTracesJson(body);

      expect(result.resourceSpans?.[0]?.scopeSpans).toBeUndefined();
    });

    it('should handle invalid scope spans item', () => {
      const body = {
        resourceSpans: [{ scopeSpans: [null, 'invalid'] }],
      };

      const result = parseOtlpTracesJson(body);

      expect(result.resourceSpans?.[0]?.scopeSpans).toHaveLength(2);
    });

    it('should handle null spans', () => {
      const body = {
        resourceSpans: [{ scopeSpans: [{ spans: null }] }],
      };

      const result = parseOtlpTracesJson(body);

      expect(result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans).toBeUndefined();
    });

    it('should handle invalid span item', () => {
      const body = {
        resourceSpans: [{ scopeSpans: [{ spans: [null, 'invalid'] }] }],
      };

      const result = parseOtlpTracesJson(body);

      const spans = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans;
      expect(spans).toHaveLength(2);
    });
  });

  // ==========================================================================
  // parseOtlpTracesProtobuf
  // ==========================================================================
  describe('parseOtlpTracesProtobuf', () => {
    it('should parse JSON disguised as protobuf', async () => {
      const jsonData = {
        resourceSpans: [{
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'test-svc' } }] },
          scopeSpans: [{
            spans: [{
              traceId: 'abc123',
              spanId: 'span1',
              name: 'test-op',
              startTimeUnixNano: '1234567890000000000',
              endTimeUnixNano: '1234567891000000000',
            }],
          }],
        }],
      };
      const buffer = Buffer.from(JSON.stringify(jsonData));

      const result = await parseOtlpTracesProtobuf(buffer);

      expect(result.resourceSpans).toHaveLength(1);
    });

    it('should auto-detect and decompress gzip compressed JSON', async () => {
      const jsonData = {
        resourceSpans: [{
          resource: {},
          scopeSpans: [{
            spans: [{ traceId: 'trace1', spanId: 'span1', name: 'op1' }],
          }],
        }],
      };
      const compressed = gzipSync(Buffer.from(JSON.stringify(jsonData)));

      const result = await parseOtlpTracesProtobuf(compressed);

      expect(result.resourceSpans).toHaveLength(1);
    });

    it('should handle empty buffer', async () => {
      const buffer = Buffer.from([]);

      const result = await parseOtlpTracesProtobuf(buffer);

      expect(result.resourceSpans).toEqual([]);
    });

    it('should throw error for invalid gzip data', async () => {
      const invalidGzip = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff]);

      await expect(parseOtlpTracesProtobuf(invalidGzip)).rejects.toThrow('Failed to decompress gzip data');
    });

    it('should throw error for invalid protobuf data', async () => {
      const buffer = Buffer.from([0x0a, 0x0b, 0x0c, 0x0d]);

      await expect(parseOtlpTracesProtobuf(buffer)).rejects.toThrow('Failed to decode OTLP traces protobuf');
    });

    it('should handle gzip compressed traces with multiple spans', async () => {
      const jsonData = {
        resourceSpans: [{
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'my-service' } }] },
          scopeSpans: [{
            scope: { name: 'test-scope' },
            spans: [
              { traceId: 'trace1', spanId: 'span1', name: 'op1', startTimeUnixNano: '1000', endTimeUnixNano: '2000' },
              { traceId: 'trace1', spanId: 'span2', name: 'op2', startTimeUnixNano: '1100', endTimeUnixNano: '1900', parentSpanId: 'span1' },
            ],
          }],
        }],
      };
      const compressed = gzipSync(Buffer.from(JSON.stringify(jsonData)));

      const result = await parseOtlpTracesProtobuf(compressed);

      expect(result.resourceSpans).toHaveLength(1);
      expect(result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans).toHaveLength(2);
    });

    it('should handle array JSON format', async () => {
      const jsonData = [{ test: 'data' }];
      const buffer = Buffer.from(JSON.stringify(jsonData));

      const result = await parseOtlpTracesProtobuf(buffer);

      expect(result.resourceSpans).toEqual([]);
    });

    it('should handle gzip with snake_case fields', async () => {
      const jsonData = {
        resource_spans: [{
          resource: {},
          scope_spans: [{
            spans: [{
              trace_id: 'abc123',
              span_id: 'span1',
              parent_span_id: 'parent1',
              name: 'test-op',
              start_time_unix_nano: '1000000000',
              end_time_unix_nano: '2000000000',
            }],
          }],
        }],
      };
      const compressed = gzipSync(Buffer.from(JSON.stringify(jsonData)));

      const result = await parseOtlpTracesProtobuf(compressed);

      expect(result.resourceSpans).toHaveLength(1);
      const span = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0];
      expect(span?.traceId).toBe('abc123');
      expect(span?.spanId).toBe('span1');
      expect(span?.parentSpanId).toBe('parent1');
    });

    it('should handle multiple resource spans', async () => {
      const jsonData = {
        resourceSpans: [
          {
            resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc1' } }] },
            scopeSpans: [{ spans: [{ traceId: 'trace1', spanId: 'span1', name: 'op1' }] }],
          },
          {
            resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc2' } }] },
            scopeSpans: [{ spans: [{ traceId: 'trace2', spanId: 'span2', name: 'op2' }] }],
          },
        ],
      };
      const buffer = Buffer.from(JSON.stringify(jsonData));

      const result = await parseOtlpTracesProtobuf(buffer);

      expect(result.resourceSpans).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Additional Edge Cases for transformSpan
  // ==========================================================================
  describe('transformSpan - Additional Edge Cases', () => {
    it('should handle span with all optional fields populated', () => {
      const now = BigInt(Date.now() * 1000000);
      const end = now + 100000000n;

      const span: OtlpSpan = {
        traceId: 'trace123',
        spanId: 'span456',
        traceState: 'vendor1=value1',
        parentSpanId: 'parent789',
        name: 'complex-operation',
        kind: OTLP_SPAN_KIND.CLIENT,
        startTimeUnixNano: now,
        endTimeUnixNano: end,
        status: { code: OTLP_STATUS_CODE.ERROR, message: 'Connection failed' },
        attributes: [
          { key: 'http.method', value: { stringValue: 'POST' } },
          { key: 'http.status_code', value: { intValue: 500 } },
        ],
        events: [
          { name: 'retry', timeUnixNano: now.toString(), attributes: [{ key: 'attempt', value: { intValue: 1 } }] },
          { name: 'failed', timeUnixNano: end.toString() },
        ],
        links: [
          { traceId: 'linked-trace', spanId: 'linked-span', attributes: [{ key: 'reason', value: { stringValue: 'cause' } }] },
        ],
      };

      const result = transformSpan(span, 'test-service', { env: 'prod' });

      expect(result).not.toBeNull();
      expect(result?.trace_id).toBe('trace123');
      expect(result?.span_id).toBe('span456');
      expect(result?.parent_span_id).toBe('parent789');
      expect(result?.kind).toBe('CLIENT');
      expect(result?.status_code).toBe('ERROR');
      expect(result?.status_message).toBe('Connection failed');
      expect(result?.events).toHaveLength(2);
      expect(result?.links).toHaveLength(1);
      expect(result?.resource_attributes).toEqual({ env: 'prod' });
    });

    it('should handle span with bigint timestamps directly', () => {
      const now = BigInt(Date.now() * 1000000);
      const end = now + 50000000n;

      const span: OtlpSpan = {
        traceId: 'trace1',
        spanId: 'span1',
        name: 'bigint-test',
        startTimeUnixNano: now,
        endTimeUnixNano: end,
      };

      const result = transformSpan(span, 'svc', {});

      expect(result).not.toBeNull();
      expect(result?.duration_ms).toBe(50);
    });

    it('should handle span with PRODUCER kind', () => {
      const result = transformSpan(
        { traceId: 't1', spanId: 's1', kind: OTLP_SPAN_KIND.PRODUCER },
        'svc',
        {}
      );

      expect(result?.kind).toBe('PRODUCER');
    });

    it('should handle span with CONSUMER kind', () => {
      const result = transformSpan(
        { traceId: 't1', spanId: 's1', kind: OTLP_SPAN_KIND.CONSUMER },
        'svc',
        {}
      );

      expect(result?.kind).toBe('CONSUMER');
    });

    it('should handle span with INTERNAL kind', () => {
      const result = transformSpan(
        { traceId: 't1', spanId: 's1', kind: OTLP_SPAN_KIND.INTERNAL },
        'svc',
        {}
      );

      expect(result?.kind).toBe('INTERNAL');
    });

    it('should handle span with empty events array', () => {
      const result = transformSpan(
        { traceId: 't1', spanId: 's1', events: [] },
        'svc',
        {}
      );

      expect(result?.events).toBeUndefined();
    });

    it('should handle span with empty links array', () => {
      const result = transformSpan(
        { traceId: 't1', spanId: 's1', links: [] },
        'svc',
        {}
      );

      expect(result?.links).toBeUndefined();
    });

    it('should handle span with empty attributes array', () => {
      const result = transformSpan(
        { traceId: 't1', spanId: 's1', attributes: [] },
        'svc',
        {}
      );

      expect(result?.attributes).toEqual({});
    });
  });

  // ==========================================================================
  // Trace Aggregation Edge Cases
  // ==========================================================================
  describe('transformOtlpToSpans - Trace Aggregation', () => {
    it('should track multiple traces separately', () => {
      const now = BigInt(Date.now() * 1000000);

      const result = transformOtlpToSpans({
        resourceSpans: [{
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc' } }] },
          scopeSpans: [{
            spans: [
              { traceId: 'trace1', spanId: 'span1', name: 'op1', startTimeUnixNano: now.toString(), endTimeUnixNano: (now + 100000000n).toString() },
              { traceId: 'trace2', spanId: 'span2', name: 'op2', startTimeUnixNano: now.toString(), endTimeUnixNano: (now + 200000000n).toString() },
            ],
          }],
        }],
      });

      expect(result.traces.size).toBe(2);
      expect(result.traces.get('trace1')).toBeDefined();
      expect(result.traces.get('trace2')).toBeDefined();
    });

    it('should update trace bounds when child span extends beyond root', () => {
      const now = BigInt(Date.now() * 1000000);

      const result = transformOtlpToSpans({
        resourceSpans: [{
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc' } }] },
          scopeSpans: [{
            spans: [
              // Root span ends at +100ms
              { traceId: 'trace1', spanId: 'root', name: 'root-op', startTimeUnixNano: now.toString(), endTimeUnixNano: (now + 100000000n).toString() },
              // Child span ends at +200ms (extends beyond root)
              { traceId: 'trace1', spanId: 'child', parentSpanId: 'root', name: 'child-op', startTimeUnixNano: (now + 10000000n).toString(), endTimeUnixNano: (now + 200000000n).toString() },
            ],
          }],
        }],
      });

      const trace = result.traces.get('trace1');
      expect(trace?.span_count).toBe(2);
      expect(trace?.duration_ms).toBe(200); // Total duration should be 200ms
    });

    it('should update trace bounds when child span starts before root', () => {
      const now = BigInt(Date.now() * 1000000);

      const result = transformOtlpToSpans({
        resourceSpans: [{
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc' } }] },
          scopeSpans: [{
            spans: [
              // Root span starts at +50ms
              { traceId: 'trace1', spanId: 'root', name: 'root-op', startTimeUnixNano: (now + 50000000n).toString(), endTimeUnixNano: (now + 100000000n).toString() },
              // Child span starts earlier at +10ms
              { traceId: 'trace1', spanId: 'child', parentSpanId: 'root', name: 'child-op', startTimeUnixNano: (now + 10000000n).toString(), endTimeUnixNano: (now + 60000000n).toString() },
            ],
          }],
        }],
      });

      const trace = result.traces.get('trace1');
      expect(trace?.duration_ms).toBe(90); // From 10ms to 100ms = 90ms
    });

    it('should identify root span and track its info', () => {
      const now = BigInt(Date.now() * 1000000);

      const result = transformOtlpToSpans({
        resourceSpans: [{
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'gateway' } }] },
          scopeSpans: [{
            spans: [
              // Child span comes first in array but has parentSpanId
              { traceId: 'trace1', spanId: 'child', parentSpanId: 'root', name: 'child-op', startTimeUnixNano: now.toString(), endTimeUnixNano: (now + 50000000n).toString() },
              // Root span (no parent)
              { traceId: 'trace1', spanId: 'root', name: 'root-op', startTimeUnixNano: now.toString(), endTimeUnixNano: (now + 100000000n).toString() },
            ],
          }],
        }],
      });

      const trace = result.traces.get('trace1');
      expect(trace?.root_service_name).toBe('gateway');
      expect(trace?.root_operation_name).toBe('root-op');
    });

    it('should mark trace as error if any span has ERROR status', () => {
      const now = BigInt(Date.now() * 1000000);

      const result = transformOtlpToSpans({
        resourceSpans: [{
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc' } }] },
          scopeSpans: [{
            spans: [
              { traceId: 'trace1', spanId: 'span1', name: 'op1', status: { code: OTLP_STATUS_CODE.OK } },
              { traceId: 'trace1', spanId: 'span2', name: 'op2', status: { code: OTLP_STATUS_CODE.ERROR } },
              { traceId: 'trace1', spanId: 'span3', name: 'op3', status: { code: OTLP_STATUS_CODE.OK } },
            ],
          }],
        }],
      });

      const trace = result.traces.get('trace1');
      expect(trace?.error).toBe(true);
    });

    it('should not mark trace as error if all spans are OK', () => {
      const now = BigInt(Date.now() * 1000000);

      const result = transformOtlpToSpans({
        resourceSpans: [{
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'svc' } }] },
          scopeSpans: [{
            spans: [
              { traceId: 'trace1', spanId: 'span1', name: 'op1', status: { code: OTLP_STATUS_CODE.OK } },
              { traceId: 'trace1', spanId: 'span2', name: 'op2', status: { code: OTLP_STATUS_CODE.UNSET } },
            ],
          }],
        }],
      });

      const trace = result.traces.get('trace1');
      expect(trace?.error).toBe(false);
    });
  });

  // ==========================================================================
  // parseOtlpTracesJson - Additional Edge Cases
  // ==========================================================================
  describe('parseOtlpTracesJson - Additional Edge Cases', () => {
    it('should handle spans with status but no code', () => {
      const body = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [{ traceId: 't1', spanId: 's1', status: { message: 'partial' } }],
          }],
        }],
      };

      const result = parseOtlpTracesJson(body);
      const span = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0];

      expect(span?.status?.message).toBe('partial');
    });

    it('should handle spans with scope information', () => {
      const body = {
        resourceSpans: [{
          scopeSpans: [{
            scope: { name: 'my-tracer', version: '1.0.0', attributes: [{ key: 'lib', value: { stringValue: 'opentelemetry' } }] },
            spans: [{ traceId: 't1', spanId: 's1', name: 'op' }],
          }],
        }],
      };

      const result = parseOtlpTracesJson(body);
      const scope = result.resourceSpans?.[0]?.scopeSpans?.[0]?.scope;

      expect(scope?.name).toBe('my-tracer');
      expect(scope?.version).toBe('1.0.0');
    });

    it('should handle mixed camelCase and snake_case in same request', () => {
      const body = {
        resourceSpans: [{
          resource: {},
          scopeSpans: [{
            spans: [{
              traceId: 'camel',
              span_id: 'snake',
              name: 'mixed',
            }],
          }],
        }],
      };

      const result = parseOtlpTracesJson(body);
      const span = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0];

      expect(span?.traceId).toBe('camel');
      expect(span?.spanId).toBe('snake');
    });

    it('should handle deeply nested attributes in spans', () => {
      const body = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [{
              traceId: 't1',
              spanId: 's1',
              attributes: [
                { key: 'nested.key.value', value: { stringValue: 'deep' } },
                { key: 'array_attr', value: { arrayValue: { values: [{ intValue: 1 }, { intValue: 2 }] } } },
              ],
            }],
          }],
        }],
      };

      const result = parseOtlpTracesJson(body);
      const span = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0];

      expect(span?.attributes).toHaveLength(2);
    });

    it('should handle spans with events containing dropped attributes count', () => {
      const body = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [{
              traceId: 't1',
              spanId: 's1',
              events: [{ name: 'event1', droppedAttributesCount: 5 }],
            }],
          }],
        }],
      };

      const result = parseOtlpTracesJson(body);
      const events = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0]?.events;

      expect(events?.[0]?.droppedAttributesCount).toBe(5);
    });

    it('should handle spans with links containing trace state', () => {
      const body = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [{
              traceId: 't1',
              spanId: 's1',
              links: [{ traceId: 'linked', spanId: 'span2', traceState: 'vendor=value' }],
            }],
          }],
        }],
      };

      const result = parseOtlpTracesJson(body);
      const links = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0]?.links;

      expect(links?.[0]?.traceState).toBe('vendor=value');
    });

    it('should preserve schemaUrl at resource and scope level', () => {
      const body = {
        resourceSpans: [{
          resource: {},
          schemaUrl: 'https://example.com/resource-schema',
          scopeSpans: [{
            schemaUrl: 'https://example.com/scope-schema',
            spans: [{ traceId: 't1', spanId: 's1' }],
          }],
        }],
      };

      const result = parseOtlpTracesJson(body);

      expect(result.resourceSpans?.[0]?.schemaUrl).toBe('https://example.com/resource-schema');
      expect(result.resourceSpans?.[0]?.scopeSpans?.[0]?.schemaUrl).toBe('https://example.com/scope-schema');
    });

    it('should handle snake_case schema_url', () => {
      const body = {
        resource_spans: [{
          schema_url: 'https://example.com/schema',
          scope_spans: [{
            schema_url: 'https://example.com/scope',
            spans: [{ trace_id: 't1', span_id: 's1' }],
          }],
        }],
      };

      const result = parseOtlpTracesJson(body);

      expect(result.resourceSpans?.[0]?.schemaUrl).toBe('https://example.com/schema');
      expect(result.resourceSpans?.[0]?.scopeSpans?.[0]?.schemaUrl).toBe('https://example.com/scope');
    });
  });

  // ==========================================================================
  // calculateDurationMs - Edge Cases
  // ==========================================================================
  describe('calculateDurationMs - Edge Cases', () => {
    it('should handle very large duration values', () => {
      const start = '1000000000';
      const end = '86401000000000'; // ~24 hours in nanoseconds
      const result = calculateDurationMs(start, end);

      expect(result).toBe(86400000); // 24 hours in ms
    });

    it('should handle negative duration (end before start)', () => {
      const start = '2000000000';
      const end = '1000000000';
      const result = calculateDurationMs(start, end);

      expect(result).toBe(-1000); // Negative duration
    });

    it('should handle zero duration', () => {
      const time = '1000000000';
      const result = calculateDurationMs(time, time);

      expect(result).toBe(0);
    });
  });

  // ==========================================================================
  // extractServiceName - Edge Cases
  // ==========================================================================
  describe('extractServiceName - Edge Cases', () => {
    it('should return first service.name if multiple exist', () => {
      const attrs = [
        { key: 'service.name', value: { stringValue: 'first-service' } },
        { key: 'service.name', value: { stringValue: 'second-service' } },
      ];

      expect(extractServiceName(attrs)).toBe('first-service');
    });

    it('should handle service.name with empty string', () => {
      const attrs = [{ key: 'service.name', value: { stringValue: '' } }];

      // Empty string is falsy so extractServiceName returns 'unknown'
      expect(extractServiceName(attrs)).toBe('unknown');
    });

    it('should handle service.name with special characters', () => {
      const attrs = [{ key: 'service.name', value: { stringValue: 'my-service_v2.0' } }];

      expect(extractServiceName(attrs)).toBe('my-service_v2.0');
    });
  });

  // ==========================================================================
  // Real Protobuf Encoding Tests (using @opentelemetry/otlp-transformer)
  // ==========================================================================
  describe('parseOtlpTracesProtobuf - Real Protobuf Encoding', () => {
    let ExportTraceServiceRequest: any;
    let $root: any;

    beforeAll(async () => {
      try {
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        $root = require('@opentelemetry/otlp-transformer/build/esm/generated/root.js');
        ExportTraceServiceRequest = $root.opentelemetry?.proto?.collector?.trace?.v1?.ExportTraceServiceRequest;
      } catch (error) {
        console.warn('Protobuf definitions not available, skipping real protobuf tests');
      }
    });

    it('should decode real protobuf binary message with spans', async () => {
      if (!ExportTraceServiceRequest) {
        console.warn('Skipping: protobuf encoder not available');
        return;
      }

      const traceIdBytes = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
      const spanIdBytes = Buffer.from('fedcba9876543210', 'hex');

      const message = {
        resourceSpans: [{
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'protobuf-trace-service' } },
            ],
          },
          scopeSpans: [{
            scope: { name: 'test-scope', version: '1.0.0' },
            spans: [{
              traceId: traceIdBytes,
              spanId: spanIdBytes,
              name: 'test-operation',
              kind: OTLP_SPAN_KIND.SERVER,
              startTimeUnixNano: '1704067200000000000',
              endTimeUnixNano: '1704067201000000000',
              status: { code: OTLP_STATUS_CODE.OK },
              attributes: [
                { key: 'http.method', value: { stringValue: 'GET' } },
              ],
            }],
          }],
        }],
      };

      const encoded = ExportTraceServiceRequest.encode(message).finish();
      const buffer = Buffer.from(encoded);

      const result = await parseOtlpTracesProtobuf(buffer);

      expect(result.resourceSpans).toHaveLength(1);
      const span = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0];
      expect(span).toBeDefined();
      expect(span?.name).toBe('test-operation');
    });

    it('should decode protobuf with multiple spans in a trace', async () => {
      if (!ExportTraceServiceRequest) {
        console.warn('Skipping: protobuf encoder not available');
        return;
      }

      const traceIdBytes = Buffer.from('abcdef0123456789abcdef0123456789', 'hex');

      const message = {
        resourceSpans: [{
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'multi-span-service' } }],
          },
          scopeSpans: [{
            spans: [
              { traceId: traceIdBytes, spanId: Buffer.from('1111111111111111', 'hex'), name: 'root-span', kind: OTLP_SPAN_KIND.SERVER },
              { traceId: traceIdBytes, spanId: Buffer.from('2222222222222222', 'hex'), parentSpanId: Buffer.from('1111111111111111', 'hex'), name: 'child-span-1', kind: OTLP_SPAN_KIND.INTERNAL },
              { traceId: traceIdBytes, spanId: Buffer.from('3333333333333333', 'hex'), parentSpanId: Buffer.from('1111111111111111', 'hex'), name: 'child-span-2', kind: OTLP_SPAN_KIND.CLIENT },
            ],
          }],
        }],
      };

      const encoded = ExportTraceServiceRequest.encode(message).finish();
      const buffer = Buffer.from(encoded);

      const result = await parseOtlpTracesProtobuf(buffer);

      const spans = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans;
      expect(spans).toHaveLength(3);
    });

    it('should decode gzip-compressed protobuf traces', async () => {
      if (!ExportTraceServiceRequest) {
        console.warn('Skipping: protobuf encoder not available');
        return;
      }

      const message = {
        resourceSpans: [{
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'gzip-trace-service' } }],
          },
          scopeSpans: [{
            spans: [{
              traceId: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
              spanId: Buffer.from('fedcba9876543210', 'hex'),
              name: 'compressed-operation',
              status: { code: OTLP_STATUS_CODE.OK },
            }],
          }],
        }],
      };

      const encoded = ExportTraceServiceRequest.encode(message).finish();
      const compressed = gzipSync(Buffer.from(encoded));

      const result = await parseOtlpTracesProtobuf(compressed);

      expect(result.resourceSpans).toHaveLength(1);
      const span = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0];
      expect(span?.name).toBe('compressed-operation');
    });

    it('should decode protobuf with span events', async () => {
      if (!ExportTraceServiceRequest) {
        console.warn('Skipping: protobuf encoder not available');
        return;
      }

      const message = {
        resourceSpans: [{
          resource: {},
          scopeSpans: [{
            spans: [{
              traceId: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
              spanId: Buffer.from('fedcba9876543210', 'hex'),
              name: 'span-with-events',
              events: [
                { name: 'exception', timeUnixNano: '1704067200500000000', attributes: [{ key: 'exception.message', value: { stringValue: 'Test error' } }] },
                { name: 'retry', timeUnixNano: '1704067200600000000' },
              ],
            }],
          }],
        }],
      };

      const encoded = ExportTraceServiceRequest.encode(message).finish();
      const buffer = Buffer.from(encoded);

      const result = await parseOtlpTracesProtobuf(buffer);

      const span = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0];
      expect(span?.events).toHaveLength(2);
    });

    it('should decode protobuf with span links', async () => {
      if (!ExportTraceServiceRequest) {
        console.warn('Skipping: protobuf encoder not available');
        return;
      }

      const message = {
        resourceSpans: [{
          resource: {},
          scopeSpans: [{
            spans: [{
              traceId: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'),
              spanId: Buffer.from('fedcba9876543210', 'hex'),
              name: 'span-with-links',
              links: [
                { traceId: Buffer.from('abcdef0123456789abcdef0123456789', 'hex'), spanId: Buffer.from('9876543210fedcba', 'hex'), attributes: [{ key: 'link.type', value: { stringValue: 'cause' } }] },
              ],
            }],
          }],
        }],
      };

      const encoded = ExportTraceServiceRequest.encode(message).finish();
      const buffer = Buffer.from(encoded);

      const result = await parseOtlpTracesProtobuf(buffer);

      const span = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0];
      expect(span?.links).toBeDefined();
      expect(span?.links).toHaveLength(1);
    });

    it('should decode protobuf with all span kinds', async () => {
      if (!ExportTraceServiceRequest) {
        console.warn('Skipping: protobuf encoder not available');
        return;
      }

      const message = {
        resourceSpans: [{
          resource: {},
          scopeSpans: [{
            spans: [
              { traceId: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'), spanId: Buffer.from('1111111111111111', 'hex'), name: 'internal', kind: OTLP_SPAN_KIND.INTERNAL },
              { traceId: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'), spanId: Buffer.from('2222222222222222', 'hex'), name: 'server', kind: OTLP_SPAN_KIND.SERVER },
              { traceId: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'), spanId: Buffer.from('3333333333333333', 'hex'), name: 'client', kind: OTLP_SPAN_KIND.CLIENT },
              { traceId: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'), spanId: Buffer.from('4444444444444444', 'hex'), name: 'producer', kind: OTLP_SPAN_KIND.PRODUCER },
              { traceId: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'), spanId: Buffer.from('5555555555555555', 'hex'), name: 'consumer', kind: OTLP_SPAN_KIND.CONSUMER },
            ],
          }],
        }],
      };

      const encoded = ExportTraceServiceRequest.encode(message).finish();
      const buffer = Buffer.from(encoded);

      const result = await parseOtlpTracesProtobuf(buffer);

      const spans = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans;
      expect(spans).toHaveLength(5);
    });

    it('should decode protobuf with all status codes', async () => {
      if (!ExportTraceServiceRequest) {
        console.warn('Skipping: protobuf encoder not available');
        return;
      }

      const message = {
        resourceSpans: [{
          resource: {},
          scopeSpans: [{
            spans: [
              { traceId: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'), spanId: Buffer.from('1111111111111111', 'hex'), name: 'unset', status: { code: OTLP_STATUS_CODE.UNSET } },
              { traceId: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'), spanId: Buffer.from('2222222222222222', 'hex'), name: 'ok', status: { code: OTLP_STATUS_CODE.OK } },
              { traceId: Buffer.from('0123456789abcdef0123456789abcdef', 'hex'), spanId: Buffer.from('3333333333333333', 'hex'), name: 'error', status: { code: OTLP_STATUS_CODE.ERROR, message: 'Failed' } },
            ],
          }],
        }],
      };

      const encoded = ExportTraceServiceRequest.encode(message).finish();
      const buffer = Buffer.from(encoded);

      const result = await parseOtlpTracesProtobuf(buffer);

      const spans = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans;
      expect(spans).toHaveLength(3);
    });
  });

  // ==========================================================================
  // Trace/Span ID Normalization for Traces
  // ==========================================================================
  describe('parseOtlpTracesProtobuf - ID Normalization', () => {
    it('should convert base64 trace IDs to hex', async () => {
      const traceIdHex = '0123456789abcdef0123456789abcdef';
      const traceIdBase64 = Buffer.from(traceIdHex, 'hex').toString('base64');

      const mockData = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [{
              traceId: traceIdBase64,
              spanId: Buffer.from('fedcba9876543210', 'hex').toString('base64'),
              name: 'base64-id-test',
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpTracesProtobuf(buffer);

      const span = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0];
      expect(span?.traceId).toBeDefined();
      expect(span?.spanId).toBeDefined();
    });

    it('should preserve hex string IDs', async () => {
      const mockData = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [{
              traceId: 'abcdef0123456789abcdef0123456789',
              spanId: '1234567890abcdef',
              parentSpanId: 'fedcba0987654321',
              name: 'hex-id-test',
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpTracesProtobuf(buffer);

      const span = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0];
      expect(span?.traceId).toBe('abcdef0123456789abcdef0123456789');
      expect(span?.spanId).toBe('1234567890abcdef');
      expect(span?.parentSpanId).toBe('fedcba0987654321');
    });

    it('should handle missing parent span ID', async () => {
      const mockData = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [{
              traceId: 'abcdef0123456789abcdef0123456789',
              spanId: '1234567890abcdef',
              name: 'root-span-test',
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpTracesProtobuf(buffer);

      const span = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0];
      expect(span?.parentSpanId).toBeUndefined();
    });
  });

  // ==========================================================================
  // Link Normalization
  // ==========================================================================
  describe('parseOtlpTracesProtobuf - Link Normalization', () => {
    it('should normalize links with base64 IDs', async () => {
      const linkedTraceId = Buffer.from('abcdef0123456789abcdef0123456789', 'hex').toString('base64');
      const linkedSpanId = Buffer.from('9876543210fedcba', 'hex').toString('base64');

      const mockData = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [{
              traceId: '0123456789abcdef0123456789abcdef',
              spanId: 'fedcba9876543210',
              name: 'span-with-links',
              links: [
                { traceId: linkedTraceId, spanId: linkedSpanId, traceState: 'vendor=value' },
              ],
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpTracesProtobuf(buffer);

      const links = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0]?.links;
      expect(links).toBeDefined();
      expect(links).toHaveLength(1);
    });

    it('should handle links with attributes', async () => {
      const mockData = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [{
              traceId: '0123456789abcdef0123456789abcdef',
              spanId: 'fedcba9876543210',
              name: 'span-with-link-attrs',
              links: [
                {
                  traceId: 'abcdef0123456789abcdef0123456789',
                  spanId: '1234567890abcdef',
                  attributes: [
                    { key: 'link.reason', value: { stringValue: 'caused-by' } },
                    { key: 'link.index', value: { intValue: 0 } },
                  ],
                },
              ],
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpTracesProtobuf(buffer);

      const links = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0]?.links;
      expect(links?.[0]?.attributes).toHaveLength(2);
    });

    it('should handle empty links array', async () => {
      const mockData = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [{
              traceId: '0123456789abcdef0123456789abcdef',
              spanId: 'fedcba9876543210',
              name: 'span-no-links',
              links: [],
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpTracesProtobuf(buffer);

      const links = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0]?.links;
      expect(links).toEqual([]);
    });

    it('should handle null links', async () => {
      const mockData = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [{
              traceId: '0123456789abcdef0123456789abcdef',
              spanId: 'fedcba9876543210',
              name: 'span-null-links',
              links: null,
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpTracesProtobuf(buffer);

      const span = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0];
      expect(span?.links).toBeNull();
    });
  });

  // ==========================================================================
  // Edge Cases for Protobuf Trace Parsing
  // ==========================================================================
  describe('parseOtlpTracesProtobuf - Edge Cases', () => {
    it('should handle empty resourceSpans', async () => {
      const mockData = { resourceSpans: [] };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpTracesProtobuf(buffer);

      expect(result.resourceSpans).toEqual([]);
    });

    it('should handle missing scopeSpans', async () => {
      const mockData = {
        resourceSpans: [{
          resource: {},
          scopeSpans: undefined,
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpTracesProtobuf(buffer);

      expect(result.resourceSpans?.[0]?.scopeSpans).toBeUndefined();
    });

    it('should handle missing spans', async () => {
      const mockData = {
        resourceSpans: [{
          scopeSpans: [{
            scope: { name: 'test' },
            spans: undefined,
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpTracesProtobuf(buffer);

      expect(result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans).toBeUndefined();
    });

    it('should handle invalid resourceSpans entries', async () => {
      const mockData = {
        resourceSpans: [
          null,
          { scopeSpans: [{ spans: [{ traceId: 'abc', spanId: '123', name: 'valid' }] }] },
          'invalid',
        ],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpTracesProtobuf(buffer);

      expect(result.resourceSpans).toHaveLength(3);
    });

    it('should handle invalid scopeSpans entries', async () => {
      const mockData = {
        resourceSpans: [{
          scopeSpans: [
            null,
            { spans: [{ traceId: 'abc', spanId: '123', name: 'valid' }] },
            123,
          ],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpTracesProtobuf(buffer);

      expect(result.resourceSpans?.[0]?.scopeSpans).toHaveLength(3);
    });

    it('should handle invalid span entries', async () => {
      const mockData = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [
              null,
              { traceId: 'abc', spanId: '123', name: 'valid' },
              'invalid',
            ],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpTracesProtobuf(buffer);

      expect(result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans).toHaveLength(3);
    });

    it('should handle invalid link entries', async () => {
      const mockData = {
        resourceSpans: [{
          scopeSpans: [{
            spans: [{
              traceId: 'abc',
              spanId: '123',
              name: 'span-with-invalid-links',
              links: [
                null,
                { traceId: 'linked', spanId: 'span2' },
                'invalid',
              ],
            }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpTracesProtobuf(buffer);

      const links = result.resourceSpans?.[0]?.scopeSpans?.[0]?.spans?.[0]?.links;
      expect(links).toHaveLength(3);
    });

    it('should preserve schemaUrl at all levels', async () => {
      const mockData = {
        resourceSpans: [{
          resource: {},
          schemaUrl: 'https://example.com/resource-schema',
          scopeSpans: [{
            scope: { name: 'test' },
            schemaUrl: 'https://example.com/scope-schema',
            spans: [{ traceId: 'abc', spanId: '123', name: 'test' }],
          }],
        }],
      };

      const buffer = Buffer.from(JSON.stringify(mockData));
      const result = await parseOtlpTracesProtobuf(buffer);

      expect(result.resourceSpans?.[0]?.schemaUrl).toBe('https://example.com/resource-schema');
      expect(result.resourceSpans?.[0]?.scopeSpans?.[0]?.schemaUrl).toBe('https://example.com/scope-schema');
    });

    it('should throw error for invalid gzip data', async () => {
      const invalidGzip = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff]);

      await expect(parseOtlpTracesProtobuf(invalidGzip)).rejects.toThrow('Failed to decompress gzip data');
    });

    it('should throw error for invalid protobuf data', async () => {
      const buffer = Buffer.from([0x0a, 0x0b, 0x0c, 0x0d]);

      await expect(parseOtlpTracesProtobuf(buffer)).rejects.toThrow('Failed to decode OTLP traces protobuf');
    });
  });
});
