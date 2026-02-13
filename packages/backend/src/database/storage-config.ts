import type { EngineType, StorageConfig } from '@logtide/reservoir';

export const STORAGE_ENGINE: EngineType =
  (process.env.STORAGE_ENGINE as EngineType) || 'timescale';

export function getClickHouseConfig(): StorageConfig {
  return {
    host: process.env.CLICKHOUSE_HOST || 'localhost',
    port: parseInt(process.env.CLICKHOUSE_PORT || '8123', 10),
    database: process.env.CLICKHOUSE_DATABASE || 'logtide',
    username: process.env.CLICKHOUSE_USERNAME || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  };
}

export function validateStorageConfig(): void {
  if (!['timescale', 'clickhouse'].includes(STORAGE_ENGINE)) {
    throw new Error(`Invalid STORAGE_ENGINE: "${STORAGE_ENGINE}". Must be "timescale" or "clickhouse".`);
  }
  if (STORAGE_ENGINE === 'clickhouse') {
    if (!process.env.CLICKHOUSE_HOST) {
      throw new Error('Missing CLICKHOUSE_HOST (required when STORAGE_ENGINE=clickhouse)');
    }
    if (!process.env.CLICKHOUSE_DATABASE) {
      throw new Error('Missing CLICKHOUSE_DATABASE (required when STORAGE_ENGINE=clickhouse)');
    }
  }
}
