import { describe, it, expect } from 'vitest';
import { StorageEngineFactory } from './factory.js';
import { TimescaleEngine } from './engines/timescale/timescale-engine.js';
import { ClickHouseEngine } from './engines/clickhouse/clickhouse-engine.js';
import type { StorageConfig, EngineType } from './core/types.js';

const validConfig: StorageConfig = {
  host: 'localhost',
  port: 5432,
  database: 'logtide',
  username: 'logtide',
  password: 'secret',
};

describe('StorageEngineFactory', () => {
  it('creates a TimescaleEngine for timescale type', () => {
    const engine = StorageEngineFactory.create('timescale', validConfig);
    expect(engine).toBeInstanceOf(TimescaleEngine);
  });

  it('creates a ClickHouseEngine for clickhouse type', () => {
    const engine = StorageEngineFactory.create('clickhouse', validConfig);
    expect(engine).toBeInstanceOf(ClickHouseEngine);
  });

  it('throws for clickhouse-fdw type (not implemented)', () => {
    expect(() => StorageEngineFactory.create('clickhouse-fdw', validConfig))
      .toThrow('ClickHouse FDW engine not yet implemented');
  });

  it('throws for missing host', () => {
    expect(() => StorageEngineFactory.create('timescale', { ...validConfig, host: '' }))
      .toThrow('host is required');
  });

  it('throws for missing port', () => {
    expect(() => StorageEngineFactory.create('timescale', { ...validConfig, port: 0 }))
      .toThrow('port is required');
  });

  it('throws for missing database', () => {
    expect(() => StorageEngineFactory.create('timescale', { ...validConfig, database: '' }))
      .toThrow('database is required');
  });

  it('throws for missing username', () => {
    expect(() => StorageEngineFactory.create('timescale', { ...validConfig, username: '' }))
      .toThrow('username is required');
  });

  it('throws for missing password', () => {
    expect(() => StorageEngineFactory.create('timescale', { ...validConfig, password: '' }))
      .toThrow('password is required');
  });

  it('throws for unsupported engine type', () => {
    expect(() => StorageEngineFactory.create('unknown' as EngineType, validConfig))
      .toThrow('Unsupported engine type');
  });

  it('skips config validation when pool is injected', () => {
    const emptyConfig = { host: '', port: 0, database: '', username: '', password: '' };
    const mockPool = {} as import('pg').Pool;
    // Should NOT throw because pool is provided
    expect(() => StorageEngineFactory.create('timescale', emptyConfig, { pool: mockPool }))
      .not.toThrow();
  });
});
