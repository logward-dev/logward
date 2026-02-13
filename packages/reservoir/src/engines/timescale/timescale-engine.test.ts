import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StorageConfig, LogRecord } from '../../core/types.js';

const mockQuery = vi.fn();
const mockEnd = vi.fn();

vi.mock('pg', () => {
  return {
    default: {
      Pool: vi.fn(() => ({
        query: mockQuery,
        end: mockEnd,
      })),
    },
  };
});

import { TimescaleEngine } from './timescale-engine.js';
import { TimescaleQueryTranslator } from './query-translator.js';

const config: StorageConfig = {
  host: 'localhost',
  port: 5432,
  database: 'logtide',
  username: 'logtide',
  password: 'secret',
  schema: 'public',
};

function makeLog(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    time: new Date('2024-01-01T00:00:00Z'),
    projectId: 'proj-1',
    service: 'api',
    level: 'info',
    message: 'hello world',
    metadata: { hostname: 'host-1' },
    ...overrides,
  };
}

describe('TimescaleEngine', () => {
  let engine: TimescaleEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new TimescaleEngine(config);
  });

  describe('connect / disconnect', () => {
    it('connects and creates a pool', async () => {
      await engine.connect();
      const pg = await import('pg');
      expect(pg.default.Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 5432,
          database: 'logtide',
          user: 'logtide',
          password: 'secret',
        }),
      );
    });

    it('disconnect calls pool.end', async () => {
      await engine.connect();
      await engine.disconnect();
      expect(mockEnd).toHaveBeenCalled();
    });

    it('disconnect without connect is safe', async () => {
      await engine.disconnect();
      expect(mockEnd).not.toHaveBeenCalled();
    });

    it('does not create pool when injected', async () => {
      const mockPool = { query: mockQuery, end: mockEnd } as unknown as import('pg').Pool;
      const injectedEngine = new TimescaleEngine(config, { pool: mockPool });
      await injectedEngine.connect(); // should be a no-op
      const pg = await import('pg');
      // Pool constructor should only have been called by the non-injected engine setup
      const callsBeforeConnect = pg.default.Pool.mock.calls.length;
      await injectedEngine.connect();
      expect(pg.default.Pool.mock.calls.length).toBe(callsBeforeConnect);
    });

    it('does not end pool when not owned', async () => {
      const mockPool = { query: mockQuery, end: mockEnd } as unknown as import('pg').Pool;
      const injectedEngine = new TimescaleEngine(config, { pool: mockPool });
      await injectedEngine.disconnect();
      expect(mockEnd).not.toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('returns healthy when query is fast', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      await engine.connect();
      const result = await engine.healthCheck();
      expect(result.status).toBe('healthy');
      expect(result.connected).toBe(true);
      expect(result.engine).toBe('timescale');
      expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('returns unhealthy on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection refused'));
      await engine.connect();
      const result = await engine.healthCheck();
      expect(result.status).toBe('unhealthy');
      expect(result.connected).toBe(false);
      expect(result.error).toBe('connection refused');
    });

    it('returns unhealthy when not connected', async () => {
      const result = await engine.healthCheck();
      expect(result.status).toBe('unhealthy');
      expect(result.connected).toBe(false);
      expect(result.error).toBe('Not connected. Call connect() first.');
    });
  });

  describe('initialize', () => {
    it('creates schema, table, and indices', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await engine.connect();
      await engine.initialize();

      const calls = mockQuery.mock.calls.map((c) => (c[0] as string).trim());
      expect(calls.some((q) => q.includes('CREATE SCHEMA IF NOT EXISTS public'))).toBe(true);
      expect(calls.some((q) => q.includes('CREATE TABLE IF NOT EXISTS public.logs'))).toBe(true);
      expect(calls.some((q) => q.includes('idx_logs_fulltext'))).toBe(true);
      expect(calls.some((q) => q.includes('idx_logs_composite'))).toBe(true);
      expect(calls.some((q) => q.includes('idx_logs_span_id'))).toBe(true);
    });

    it('skips initialization when skipInitialize is set', async () => {
      const skipEngine = new TimescaleEngine(config, { skipInitialize: true });
      await skipEngine.connect();
      await skipEngine.initialize();
      // Only the pool creation call, no schema/table calls
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('ingest', () => {
    it('inserts a batch of logs', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 2 });
      await engine.connect();

      const logs = [makeLog(), makeLog({ service: 'worker' })];
      const result = await engine.ingest(logs);

      expect(result.ingested).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      const insertCall = mockQuery.mock.calls[0];
      expect((insertCall[0] as string)).toContain('INSERT INTO public.logs');
      expect((insertCall[0] as string)).toContain('UNNEST');
      expect((insertCall[1] as unknown[]).length).toBe(8); // 8 column arrays
    });

    it('returns empty result for empty batch', async () => {
      await engine.connect();
      const result = await engine.ingest([]);
      expect(result.ingested).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.durationMs).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('sanitizes null bytes in strings', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await engine.connect();

      const log = makeLog({ message: 'hello\0world', service: 'api\0test' });
      await engine.ingest([log]);

      const params = mockQuery.mock.calls[0][1] as unknown[];
      // UNNEST arrays: [times, projectIds, services, levels, messages, ...]
      expect((params[4] as string[])[0]).toBe('helloworld');
      expect((params[2] as string[])[0]).toBe('apitest');
    });

    it('handles insert errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('unique violation'));
      await engine.connect();

      const result = await engine.ingest([makeLog()]);
      expect(result.ingested).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].error).toBe('unique violation');
    });
  });

  describe('ingestReturning', () => {
    it('inserts and returns rows with RETURNING *', async () => {
      const returnedRow = {
        id: 'uuid-1',
        time: new Date('2024-01-01T00:00:00Z'),
        project_id: 'proj-1',
        service: 'api',
        level: 'info',
        message: 'hello world',
        metadata: { hostname: 'host-1' },
        trace_id: null,
        span_id: null,
      };
      mockQuery.mockResolvedValueOnce({ rows: [returnedRow] });
      await engine.connect();

      const result = await engine.ingestReturning([makeLog()]);
      expect(result.ingested).toBe(1);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe('uuid-1');
      expect(result.rows[0].projectId).toBe('proj-1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('RETURNING *');
    });

    it('returns empty result for empty batch', async () => {
      await engine.connect();
      const result = await engine.ingestReturning([]);
      expect(result.ingested).toBe(0);
      expect(result.rows).toHaveLength(0);
    });

    it('handles errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('disk full'));
      await engine.connect();

      const result = await engine.ingestReturning([makeLog()]);
      expect(result.ingested).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.rows).toHaveLength(0);
      expect(result.errors![0].error).toBe('disk full');
    });
  });

  describe('query', () => {
    it('queries with basic filters', async () => {
      const row = {
        time: new Date('2024-01-01T00:00:00Z'),
        id: 'uuid-1',
        project_id: 'proj-1',
        service: 'api',
        level: 'info',
        message: 'hello',
        metadata: {},
        trace_id: null,
        span_id: null,
      };
      mockQuery.mockResolvedValueOnce({ rows: [row] });
      await engine.connect();

      const result = await engine.query({
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        limit: 10,
      });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].projectId).toBe('proj-1');
      expect(result.hasMore).toBe(false);
      expect(result.limit).toBe(10);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('handles limit+1 pattern for hasMore', async () => {
      const rows = Array.from({ length: 11 }, (_, i) => ({
        time: new Date('2024-01-01T00:00:00Z'),
        id: `uuid-${i}`,
        project_id: 'proj-1',
        service: 'api',
        level: 'info',
        message: `msg-${i}`,
        metadata: {},
        trace_id: null,
        span_id: null,
      }));
      mockQuery.mockResolvedValueOnce({ rows });
      await engine.connect();

      const result = await engine.query({
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        limit: 10,
      });

      expect(result.logs).toHaveLength(10);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeDefined();

      // decode cursor
      const decoded = Buffer.from(result.nextCursor!, 'base64').toString('utf-8');
      expect(decoded).toContain('uuid-9');
    });

    it('handles array filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await engine.connect();

      await engine.query({
        projectId: ['proj-1', 'proj-2'],
        level: ['info', 'error'],
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('project_id = ANY($1)');
      expect(sql).toContain('level = ANY($2)');
    });

    it('handles fulltext search', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await engine.connect();

      await engine.query({
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        search: 'error message',
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("to_tsvector('english', message) @@ plainto_tsquery('english'");
    });

    it('handles substring search', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await engine.connect();

      await engine.query({
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        search: 'test%value',
        searchMode: 'substring',
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('message ILIKE');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      // escaped % in search term
      expect(params).toContainEqual('%test\\%value%');
    });

    it('handles cursor pagination', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await engine.connect();

      const cursor = Buffer.from('2024-01-01T00:00:00.000Z,uuid-5').toString('base64');
      await engine.query({
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        cursor,
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('(time, id) <');
    });
  });

  describe('aggregate', () => {
    it('groups results by time bucket and level', async () => {
      const bucket1 = new Date('2024-01-01T00:00:00Z');
      const bucket2 = new Date('2024-01-01T01:00:00Z');
      mockQuery.mockResolvedValueOnce({
        rows: [
          { bucket: bucket1, level: 'info', total: '10' },
          { bucket: bucket1, level: 'error', total: '3' },
          { bucket: bucket2, level: 'info', total: '5' },
        ],
      });
      await engine.connect();

      const result = await engine.aggregate({
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        interval: '1h',
      });

      expect(result.timeseries).toHaveLength(2);
      expect(result.timeseries[0].total).toBe(13);
      expect(result.timeseries[0].byLevel!.info).toBe(10);
      expect(result.timeseries[0].byLevel!.error).toBe(3);
      expect(result.timeseries[1].total).toBe(5);
      expect(result.total).toBe(18);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('passes correct interval to SQL', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await engine.connect();

      await engine.aggregate({
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        interval: '5m',
      });

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('5 minutes');
    });
  });

  describe('topValues', () => {
    it('queries top values with GROUP BY', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { value: 'api', count: '150' },
          { value: 'worker', count: '50' },
        ],
      });
      await engine.connect();

      const result = await engine.topValues({
        field: 'service',
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        limit: 10,
      });

      expect(result.values).toHaveLength(2);
      expect(result.values[0].value).toBe('api');
      expect(result.values[0].count).toBe(150);
      expect(result.values[1].value).toBe('worker');
      expect(result.values[1].count).toBe(50);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('service AS value');
      expect(sql).toContain('COUNT(*)');
      expect(sql).toContain('GROUP BY value');
      expect(sql).toContain('ORDER BY count DESC');
    });

    it('includes level filter when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await engine.connect();

      await engine.topValues({
        field: 'message',
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        level: ['error', 'critical'],
      });

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('level = ANY');
    });

    it('returns empty for no results', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await engine.connect();

      const result = await engine.topValues({
        field: 'service',
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
      });

      expect(result.values).toHaveLength(0);
    });
  });

  describe('getCapabilities', () => {
    it('returns correct capabilities', () => {
      const caps = engine.getCapabilities();
      expect(caps.engine).toBe('timescale');
      expect(caps.supportsFullTextSearch).toBe(true);
      expect(caps.supportsAggregations).toBe(true);
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsTransactions).toBe(true);
      expect(caps.maxBatchSize).toBe(10000);
      expect(caps.nativeCompression).toBe(true);
      expect(caps.nativeTiering).toBe(false);
      expect(caps.supportedOperators).toContain('=');
      expect(caps.supportedOperators).toContain('like');
      expect(caps.supportedIntervals).toContain('1h');
      expect(caps.supportedIntervals).toContain('1d');
    });
  });

  describe('getSegments', () => {
    it('returns empty array', async () => {
      await engine.connect();
      const result = await engine.getSegments(new Date(), new Date());
      expect(result).toEqual([]);
    });
  });

  describe('migrate', () => {
    it('is a no-op placeholder', async () => {
      await engine.connect();
      await expect(engine.migrate('1')).resolves.toBeUndefined();
    });
  });
});

describe('TimescaleQueryTranslator', () => {
  const translator = new TimescaleQueryTranslator('public', 'logs');

  describe('translateQuery', () => {
    it('generates basic query with time range', () => {
      const result = translator.translateQuery({
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
      });

      expect(result.query).toContain('SELECT * FROM public.logs');
      expect(result.query).toContain('project_id = $1');
      expect(result.query).toContain('time >= $2');
      expect(result.query).toContain('time <= $3');
      expect(result.query).toContain('ORDER BY time DESC, id DESC');
      expect(result.query).toContain('LIMIT $4');
      expect(result.parameters).toHaveLength(4);
      // limit+1 pattern
      expect(result.parameters![3]).toBe(51);
    });

    it('generates query with all filters', () => {
      const result = translator.translateQuery({
        projectId: 'proj-1',
        service: 'api',
        level: 'error',
        hostname: 'host-1',
        traceId: 'trace-123',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        limit: 20,
      });

      expect(result.query).toContain('project_id = $1');
      expect(result.query).toContain('service = $2');
      expect(result.query).toContain('level = $3');
      expect(result.query).toContain("metadata->>'hostname' = $4");
      expect(result.query).toContain('trace_id = $5');
      expect(result.parameters![result.parameters!.length - 1]).toBe(21); // limit+1
    });

    it('includes organizationId when provided', () => {
      const result = translator.translateQuery({
        organizationId: 'org-1',
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
      });

      expect(result.query).toContain('organization_id = $1');
      expect(result.query).toContain('project_id = $2');
    });

    it('omits organizationId when not provided', () => {
      const result = translator.translateQuery({
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
      });

      expect(result.query).not.toContain('organization_id');
    });

    it('uses ANY for array values', () => {
      const result = translator.translateQuery({
        projectId: ['proj-1', 'proj-2'],
        service: ['api', 'worker'],
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
      });

      expect(result.query).toContain('project_id = ANY($1)');
      expect(result.query).toContain('service = ANY($2)');
    });

    it('handles offset', () => {
      const result = translator.translateQuery({
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        offset: 100,
      });

      expect(result.query).toContain('OFFSET');
      expect(result.parameters).toContain(100);
    });
  });

  describe('translateQuery exclusive bounds', () => {
    it('uses > for fromExclusive', () => {
      const result = translator.translateQuery({
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        fromExclusive: true,
      });

      expect(result.query).toContain('time > $');
      expect(result.query).not.toMatch(/time >= \$/);
    });

    it('uses < for toExclusive', () => {
      const result = translator.translateQuery({
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        toExclusive: true,
      });

      expect(result.query).toContain('time < $');
      // Should not have time <= for the to bound
      expect(result.query).not.toMatch(/time <= \$/);
    });

    it('supports sortOrder asc', () => {
      const result = translator.translateQuery({
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        sortOrder: 'asc',
      });

      expect(result.query).toContain('ORDER BY time ASC, id ASC');
    });
  });

  describe('translateTopValues', () => {
    it('generates GROUP BY query for service field', () => {
      const result = translator.translateTopValues({
        field: 'service',
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        limit: 5,
      });

      expect(result.query).toContain('service AS value');
      expect(result.query).toContain('COUNT(*) AS count');
      expect(result.query).toContain('GROUP BY value');
      expect(result.query).toContain('ORDER BY count DESC');
      expect(result.query).toContain('LIMIT');
    });

    it('includes level filter', () => {
      const result = translator.translateTopValues({
        field: 'message',
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        level: ['error', 'critical'],
      });

      expect(result.query).toContain('level = ANY');
    });

    it('rejects unsafe field names', () => {
      expect(() =>
        translator.translateTopValues({
          field: 'service; DROP TABLE logs',
          projectId: 'proj-1',
          from: new Date('2024-01-01'),
          to: new Date('2024-01-02'),
        })
      ).toThrow();
    });
  });

  describe('translateAggregate', () => {
    it('generates aggregate query', () => {
      const result = translator.translateAggregate({
        projectId: 'proj-1',
        from: new Date('2024-01-01'),
        to: new Date('2024-01-02'),
        interval: '1h',
      });

      expect(result.query).toContain('time_bucket($1, time) AS bucket');
      expect(result.query).toContain('level');
      expect(result.query).toContain('COUNT(*)');
      expect(result.query).toContain('GROUP BY bucket, level');
      expect(result.query).toContain('ORDER BY bucket ASC');
      expect(result.parameters![0]).toBe('1 hour');
    });

    it('maps all interval values correctly', () => {
      const intervals = [
        ['1m', '1 minute'],
        ['5m', '5 minutes'],
        ['15m', '15 minutes'],
        ['1h', '1 hour'],
        ['6h', '6 hours'],
        ['1d', '1 day'],
        ['1w', '1 week'],
      ] as const;

      for (const [input, expected] of intervals) {
        const result = translator.translateAggregate({
          projectId: 'proj-1',
          from: new Date('2024-01-01'),
          to: new Date('2024-01-02'),
          interval: input,
        });
        expect(result.parameters![0]).toBe(expected);
      }
    });
  });
});
