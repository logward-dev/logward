import { describe, it, expect } from 'vitest';
import { reservoir } from '../../database/reservoir.js';

describe('reservoir instance', () => {
  it('should be defined', () => {
    expect(reservoir).toBeDefined();
  });

  it('should have the correct engine type for test environment', () => {
    const engineType = reservoir.getEngineType();
    expect(engineType).toBe('timescale');
  });

  it('should expose core log operation methods', () => {
    expect(typeof reservoir.ingest).toBe('function');
    expect(typeof reservoir.ingestReturning).toBe('function');
    expect(typeof reservoir.query).toBe('function');
    expect(typeof reservoir.aggregate).toBe('function');
    expect(typeof reservoir.count).toBe('function');
    expect(typeof reservoir.distinct).toBe('function');
    expect(typeof reservoir.topValues).toBe('function');
    expect(typeof reservoir.getById).toBe('function');
    expect(typeof reservoir.getByIds).toBe('function');
    expect(typeof reservoir.deleteByTimeRange).toBe('function');
  });

  it('should expose span and trace operation methods', () => {
    expect(typeof reservoir.ingestSpans).toBe('function');
    expect(typeof reservoir.upsertTrace).toBe('function');
    expect(typeof reservoir.querySpans).toBe('function');
    expect(typeof reservoir.getSpansByTraceId).toBe('function');
    expect(typeof reservoir.queryTraces).toBe('function');
    expect(typeof reservoir.getTraceById).toBe('function');
    expect(typeof reservoir.getServiceDependencies).toBe('function');
    expect(typeof reservoir.deleteSpansByTimeRange).toBe('function');
  });

  it('should report engine capabilities', () => {
    const capabilities = reservoir.getCapabilities();
    expect(capabilities).toBeDefined();
    expect(capabilities.engine).toBe('timescale');
  });
});
