import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createClient, type ClickHouseClient } from '@clickhouse/client';
import { ClickHouseEngine } from './clickhouse-engine.js';
import type { LogRecord, StorageConfig, LogLevel } from '../../core/types.js';

const TEST_CONFIG: StorageConfig = {
  host: 'localhost',
  port: 18123,
  database: 'logtide_test',
  username: 'default',
  password: '',
};

const TABLE_NAME = 'test_logs';

function makeLog(overrides: Partial<LogRecord> = {}): LogRecord {
  return {
    time: new Date('2025-01-15T12:00:00Z'),
    projectId: 'proj-1',
    service: 'api',
    level: 'info',
    message: 'test log message',
    metadata: { hostname: 'server-1', env: 'test' },
    traceId: 'trace-abc',
    spanId: 'span-123',
    ...overrides,
  };
}

describe('ClickHouseEngine (integration)', () => {
  let engine: ClickHouseEngine;
  let client: ClickHouseClient;

  beforeAll(async () => {
    // Create a direct client for setup/cleanup
    client = createClient({
      url: `http://${TEST_CONFIG.host}:${TEST_CONFIG.port}`,
      username: TEST_CONFIG.username,
      password: TEST_CONFIG.password,
      database: TEST_CONFIG.database,
    });

    // Wait for ClickHouse to be ready
    for (let i = 0; i < 20; i++) {
      try {
        await client.query({ query: 'SELECT 1', format: 'JSONEachRow' });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    engine = new ClickHouseEngine(TEST_CONFIG, { tableName: TABLE_NAME });
    await engine.connect();
    await engine.initialize();
  }, 30_000);

  afterAll(async () => {
    try {
      await client.command({ query: `DROP TABLE IF EXISTS ${TABLE_NAME}` });
    } catch { /* ignore */ }
    await engine.disconnect();
    await client.close();
  });

  beforeEach(async () => {
    // Truncate table before each test
    await client.command({ query: `TRUNCATE TABLE IF EXISTS ${TABLE_NAME}` });
  });

  describe('healthCheck', () => {
    it('returns healthy status', async () => {
      const health = await engine.healthCheck();
      expect(health.status).toBe('healthy');
      expect(health.engine).toBe('clickhouse');
      expect(health.connected).toBe(true);
    });
  });

  describe('ingest', () => {
    it('ingests a batch of logs', async () => {
      const logs = [makeLog(), makeLog({ service: 'worker', level: 'error' })];
      const result = await engine.ingest(logs);

      expect(result.ingested).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns empty result for empty batch', async () => {
      const result = await engine.ingest([]);
      expect(result.ingested).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('ingestReturning', () => {
    it('ingests and returns records with client-generated IDs', async () => {
      const logs = [makeLog(), makeLog({ message: 'second log' })];
      const result = await engine.ingestReturning(logs);

      expect(result.ingested).toBe(2);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].id).toBeTruthy();
      expect(result.rows[1].id).toBeTruthy();
      expect(result.rows[0].id).not.toBe(result.rows[1].id);
      expect(result.rows[0].service).toBe('api');
      expect(result.rows[1].message).toBe('second log');
    });

    it('returns empty rows for empty batch', async () => {
      const result = await engine.ingestReturning([]);
      expect(result.rows).toHaveLength(0);
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      const logs = [
        makeLog({ time: new Date('2025-01-15T10:00:00Z'), service: 'api', level: 'info', message: 'request started' }),
        makeLog({ time: new Date('2025-01-15T11:00:00Z'), service: 'api', level: 'error', message: 'request failed with timeout' }),
        makeLog({ time: new Date('2025-01-15T12:00:00Z'), service: 'worker', level: 'warn', message: 'queue backlog growing' }),
        makeLog({ time: new Date('2025-01-15T13:00:00Z'), service: 'api', level: 'info', message: 'request completed' }),
        makeLog({ time: new Date('2025-01-15T14:00:00Z'), service: 'worker', level: 'error', message: 'worker crashed unexpectedly', projectId: 'proj-2' }),
      ];
      await engine.ingest(logs);
      // ClickHouse may need a moment to make data available
      await new Promise((r) => setTimeout(r, 500));
    });

    it('queries all logs within time range', async () => {
      const result = await engine.query({
        projectId: 'proj-1',
        from: new Date('2025-01-15T00:00:00Z'),
        to: new Date('2025-01-16T00:00:00Z'),
      });

      expect(result.logs).toHaveLength(4);
      expect(result.hasMore).toBe(false);
    });

    it('filters by service', async () => {
      const result = await engine.query({
        projectId: 'proj-1',
        service: 'worker',
        from: new Date('2025-01-15T00:00:00Z'),
        to: new Date('2025-01-16T00:00:00Z'),
      });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].service).toBe('worker');
    });

    it('filters by level', async () => {
      const result = await engine.query({
        projectId: 'proj-1',
        level: 'error',
        from: new Date('2025-01-15T00:00:00Z'),
        to: new Date('2025-01-16T00:00:00Z'),
      });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].level).toBe('error');
    });

    it('filters by project', async () => {
      const result = await engine.query({
        projectId: 'proj-2',
        from: new Date('2025-01-15T00:00:00Z'),
        to: new Date('2025-01-16T00:00:00Z'),
      });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].projectId).toBe('proj-2');
    });

    it('orders by time DESC by default', async () => {
      const result = await engine.query({
        projectId: 'proj-1',
        from: new Date('2025-01-15T00:00:00Z'),
        to: new Date('2025-01-16T00:00:00Z'),
      });

      const times = result.logs.map((l) => l.time.getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
      }
    });

    it('supports limit and hasMore', async () => {
      const result = await engine.query({
        projectId: 'proj-1',
        from: new Date('2025-01-15T00:00:00Z'),
        to: new Date('2025-01-16T00:00:00Z'),
        limit: 2,
      });

      expect(result.logs).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBeTruthy();
    });

    it('supports substring search', async () => {
      const result = await engine.query({
        projectId: 'proj-1',
        from: new Date('2025-01-15T00:00:00Z'),
        to: new Date('2025-01-16T00:00:00Z'),
        search: 'timeout',
        searchMode: 'substring',
      });

      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].message).toContain('timeout');
    });
  });

  describe('aggregate', () => {
    beforeEach(async () => {
      const logs = [
        makeLog({ time: new Date('2025-01-15T10:00:00Z'), level: 'info' }),
        makeLog({ time: new Date('2025-01-15T10:30:00Z'), level: 'error' }),
        makeLog({ time: new Date('2025-01-15T11:00:00Z'), level: 'info' }),
        makeLog({ time: new Date('2025-01-15T11:30:00Z'), level: 'warn' }),
      ];
      await engine.ingest(logs);
      await new Promise((r) => setTimeout(r, 500));
    });

    it('aggregates by hour with byLevel', async () => {
      const result = await engine.aggregate({
        projectId: 'proj-1',
        from: new Date('2025-01-15T00:00:00Z'),
        to: new Date('2025-01-16T00:00:00Z'),
        interval: '1h',
      });

      expect(result.timeseries.length).toBeGreaterThan(0);
      expect(result.total).toBe(4);
      // Each bucket should have byLevel
      for (const bucket of result.timeseries) {
        expect(bucket.byLevel).toBeDefined();
      }
    });
  });

  describe('getById', () => {
    it('returns log by ID', async () => {
      const ingestResult = await engine.ingestReturning([makeLog()]);
      await new Promise((r) => setTimeout(r, 500));

      const log = await engine.getById({
        id: ingestResult.rows[0].id,
        projectId: 'proj-1',
      });

      expect(log).not.toBeNull();
      expect(log!.id).toBe(ingestResult.rows[0].id);
      expect(log!.service).toBe('api');
    });

    it('returns null for non-existent ID', async () => {
      const log = await engine.getById({
        id: '00000000-0000-0000-0000-000000000000',
        projectId: 'proj-1',
      });

      expect(log).toBeNull();
    });

    it('returns null for wrong project', async () => {
      const ingestResult = await engine.ingestReturning([makeLog()]);
      await new Promise((r) => setTimeout(r, 500));

      const log = await engine.getById({
        id: ingestResult.rows[0].id,
        projectId: 'wrong-project',
      });

      expect(log).toBeNull();
    });
  });

  describe('getByIds', () => {
    it('returns multiple logs by IDs', async () => {
      const ingestResult = await engine.ingestReturning([
        makeLog({ message: 'first' }),
        makeLog({ message: 'second' }),
        makeLog({ message: 'third' }),
      ]);
      await new Promise((r) => setTimeout(r, 500));

      const ids = ingestResult.rows.map((r) => r.id);
      const logs = await engine.getByIds({ ids: ids.slice(0, 2), projectId: 'proj-1' });

      expect(logs).toHaveLength(2);
    });

    it('returns empty array for empty ids', async () => {
      const logs = await engine.getByIds({ ids: [], projectId: 'proj-1' });
      expect(logs).toHaveLength(0);
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      const logs = [
        makeLog({ level: 'info', service: 'api' }),
        makeLog({ level: 'error', service: 'api' }),
        makeLog({ level: 'error', service: 'worker' }),
        makeLog({ level: 'info', service: 'worker', projectId: 'proj-2' }),
      ];
      await engine.ingest(logs);
      await new Promise((r) => setTimeout(r, 500));
    });

    it('counts all logs for a project', async () => {
      const result = await engine.count({
        projectId: 'proj-1',
        from: new Date('2025-01-15T00:00:00Z'),
        to: new Date('2025-01-16T00:00:00Z'),
      });

      expect(result.count).toBe(3);
    });

    it('counts with level filter', async () => {
      const result = await engine.count({
        projectId: 'proj-1',
        level: 'error',
        from: new Date('2025-01-15T00:00:00Z'),
        to: new Date('2025-01-16T00:00:00Z'),
      });

      expect(result.count).toBe(2);
    });

    it('counts with service filter', async () => {
      const result = await engine.count({
        projectId: 'proj-1',
        service: 'api',
        from: new Date('2025-01-15T00:00:00Z'),
        to: new Date('2025-01-16T00:00:00Z'),
      });

      expect(result.count).toBe(2);
    });
  });

  describe('distinct', () => {
    beforeEach(async () => {
      const logs = [
        makeLog({ service: 'api', metadata: { hostname: 'server-1' } }),
        makeLog({ service: 'worker', metadata: { hostname: 'server-2' } }),
        makeLog({ service: 'api', metadata: { hostname: 'server-1' } }),
        makeLog({ service: 'scheduler', metadata: { hostname: 'server-3' } }),
      ];
      await engine.ingest(logs);
      await new Promise((r) => setTimeout(r, 500));
    });

    it('gets distinct services', async () => {
      const result = await engine.distinct({
        field: 'service',
        projectId: 'proj-1',
        from: new Date('2025-01-15T00:00:00Z'),
        to: new Date('2025-01-16T00:00:00Z'),
      });

      expect(result.values).toHaveLength(3);
      expect(result.values.sort()).toEqual(['api', 'scheduler', 'worker']);
    });

    it('gets distinct hostnames from metadata', async () => {
      const result = await engine.distinct({
        field: 'metadata.hostname',
        projectId: 'proj-1',
        from: new Date('2025-01-15T00:00:00Z'),
        to: new Date('2025-01-16T00:00:00Z'),
      });

      expect(result.values).toHaveLength(3);
      expect(result.values.sort()).toEqual(['server-1', 'server-2', 'server-3']);
    });

    it('respects limit', async () => {
      const result = await engine.distinct({
        field: 'service',
        projectId: 'proj-1',
        from: new Date('2025-01-15T00:00:00Z'),
        to: new Date('2025-01-16T00:00:00Z'),
        limit: 2,
      });

      expect(result.values).toHaveLength(2);
    });
  });

  describe('deleteByTimeRange', () => {
    it('issues delete mutation', async () => {
      await engine.ingest([
        makeLog({ time: new Date('2025-01-10T12:00:00Z') }),
        makeLog({ time: new Date('2025-01-15T12:00:00Z') }),
      ]);
      await new Promise((r) => setTimeout(r, 500));

      // ClickHouse DELETE is async - it returns immediately
      const result = await engine.deleteByTimeRange({
        projectId: 'proj-1',
        from: new Date('2025-01-01T00:00:00Z'),
        to: new Date('2025-01-12T00:00:00Z'),
      });

      // ClickHouse mutations are async, deleted count may be 0
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);

      // Wait for mutation to complete
      await new Promise((r) => setTimeout(r, 2000));

      // Verify the old log was deleted
      const remaining = await engine.count({
        projectId: 'proj-1',
        from: new Date('2025-01-01T00:00:00Z'),
        to: new Date('2025-01-20T00:00:00Z'),
      });

      expect(remaining.count).toBe(1);
    });
  });

  describe('getCapabilities', () => {
    it('returns clickhouse capabilities', () => {
      const caps = engine.getCapabilities();
      expect(caps.engine).toBe('clickhouse');
      expect(caps.supportsFullTextSearch).toBe(true);
      expect(caps.supportsTransactions).toBe(false);
      expect(caps.maxBatchSize).toBe(100_000);
    });
  });
});
