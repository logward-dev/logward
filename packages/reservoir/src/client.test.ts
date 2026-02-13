import { describe, it, expect } from 'vitest';
import { Reservoir } from './client.js';
import type { StorageConfig, QueryParams, AggregateParams } from './core/types.js';

const config: StorageConfig = {
  host: 'localhost',
  port: 5432,
  database: 'logtide',
  username: 'logtide',
  password: 'secret',
};

describe('Reservoir', () => {
  it('creates a reservoir instance', () => {
    const reservoir = new Reservoir('timescale', config);
    expect(reservoir).toBeDefined();
  });

  it('throws if used before initialization', async () => {
    const reservoir = new Reservoir('timescale', config);

    const queryParams: QueryParams = {
      from: new Date(),
      to: new Date(),
    };

    await expect(reservoir.query(queryParams))
      .rejects.toThrow('Reservoir not initialized');
  });

  it('throws if ingest called before initialization', async () => {
    const reservoir = new Reservoir('timescale', config);

    await expect(reservoir.ingest([]))
      .rejects.toThrow('Reservoir not initialized');
  });

  it('throws if ingestReturning called before initialization', async () => {
    const reservoir = new Reservoir('timescale', config);

    await expect(reservoir.ingestReturning([]))
      .rejects.toThrow('Reservoir not initialized');
  });

  it('throws if aggregate called before initialization', async () => {
    const reservoir = new Reservoir('timescale', config);

    const params: AggregateParams = {
      from: new Date(),
      to: new Date(),
      interval: '1h',
    };

    await expect(reservoir.aggregate(params))
      .rejects.toThrow('Reservoir not initialized');
  });

  it('returns capabilities without initialization', () => {
    const reservoir = new Reservoir('timescale', config);
    const caps = reservoir.getCapabilities();

    expect(caps.engine).toBe('timescale');
    expect(caps.supportsFullTextSearch).toBe(true);
    expect(caps.supportsTransactions).toBe(true);
    expect(caps.maxBatchSize).toBe(10000);
  });

  it('close is safe to call when not initialized', async () => {
    const reservoir = new Reservoir('timescale', config);
    await expect(reservoir.close()).resolves.toBeUndefined();
  });
});
