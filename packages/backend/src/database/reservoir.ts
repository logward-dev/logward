import { Reservoir } from '@logtide/reservoir';
import { pool } from './connection.js';
import { STORAGE_ENGINE, getClickHouseConfig } from './storage-config.js';

/**
 * Shared reservoir instance for log ingestion and querying.
 *
 * - timescale: reuses the existing pg pool, skipInitialize (table managed by migrations)
 * - clickhouse: standalone connection, initialize() creates the logs table
 */
function createReservoir(): Reservoir {
  if (STORAGE_ENGINE === 'clickhouse') {
    return new Reservoir('clickhouse', getClickHouseConfig(), {
      tableName: 'logs',
      skipInitialize: false,
    });
  }

  // Default: timescale - reuse existing pg pool
  return new Reservoir(
    'timescale',
    // Config not used when pool is injected, but required by the type
    { host: '', port: 0, database: '', username: '', password: '' },
    {
      pool,
      tableName: 'logs',
      skipInitialize: true,
      projectIdType: 'uuid',
    },
  );
}

export const reservoir = createReservoir();

// Initialize (no-op for timescale with skipInitialize, creates table for clickhouse)
export const reservoirReady = reservoir.initialize().catch((err: unknown) => {
  console.error('[Reservoir] Failed to initialize:', err);
});
