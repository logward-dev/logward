import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getClickHouseConfig, validateStorageConfig, STORAGE_ENGINE } from '../../database/storage-config.js';

describe('storage-config', () => {
  describe('STORAGE_ENGINE', () => {
    it('should default to timescale when STORAGE_ENGINE env is not set', () => {
      // In test env STORAGE_ENGINE is typically not set
      expect(STORAGE_ENGINE).toBe('timescale');
    });

    it('should be a valid EngineType string', () => {
      expect(['timescale', 'clickhouse']).toContain(STORAGE_ENGINE);
    });
  });

  describe('getClickHouseConfig()', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should return default values when no env vars are set', () => {
      const config = getClickHouseConfig();

      expect(config).toEqual({
        host: 'localhost',
        port: 8123,
        database: 'logtide',
        username: 'default',
        password: '',
      });
    });

    it('should use CLICKHOUSE_HOST from env', () => {
      vi.stubEnv('CLICKHOUSE_HOST', 'ch-server.internal');

      const config = getClickHouseConfig();
      expect(config.host).toBe('ch-server.internal');
    });

    it('should use CLICKHOUSE_PORT from env and parse as integer', () => {
      vi.stubEnv('CLICKHOUSE_PORT', '9000');

      const config = getClickHouseConfig();
      expect(config.port).toBe(9000);
    });

    it('should use CLICKHOUSE_DATABASE from env', () => {
      vi.stubEnv('CLICKHOUSE_DATABASE', 'custom_db');

      const config = getClickHouseConfig();
      expect(config.database).toBe('custom_db');
    });

    it('should use CLICKHOUSE_USERNAME and CLICKHOUSE_PASSWORD from env', () => {
      vi.stubEnv('CLICKHOUSE_USERNAME', 'admin');
      vi.stubEnv('CLICKHOUSE_PASSWORD', 's3cret!');

      const config = getClickHouseConfig();
      expect(config.username).toBe('admin');
      expect(config.password).toBe('s3cret!');
    });

    it('should return all env values when fully configured', () => {
      vi.stubEnv('CLICKHOUSE_HOST', '10.0.0.5');
      vi.stubEnv('CLICKHOUSE_PORT', '18123');
      vi.stubEnv('CLICKHOUSE_DATABASE', 'prod_logs');
      vi.stubEnv('CLICKHOUSE_USERNAME', 'logtide');
      vi.stubEnv('CLICKHOUSE_PASSWORD', 'p@ssword');

      const config = getClickHouseConfig();
      expect(config).toEqual({
        host: '10.0.0.5',
        port: 18123,
        database: 'prod_logs',
        username: 'logtide',
        password: 'p@ssword',
      });
    });

    it('should default port to 8123 when CLICKHOUSE_PORT is empty', () => {
      vi.stubEnv('CLICKHOUSE_PORT', '');

      const config = getClickHouseConfig();
      // parseInt('', 10) returns NaN; the fallback || '8123' handles empty string
      expect(config.port).toBe(8123);
    });
  });

  describe('validateStorageConfig()', () => {
    it('should not throw when STORAGE_ENGINE is timescale (default)', () => {
      // STORAGE_ENGINE is 'timescale' in test env by default
      expect(() => validateStorageConfig()).not.toThrow();
    });
  });
});
