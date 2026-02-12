import { Reservoir } from '@logtide/reservoir';
import { pool } from './connection.js';

/**
 * Shared reservoir instance that reuses the existing pg pool.
 * Used for log ingestion and querying via raw parametrized SQL
 * instead of Kysely query builder for hot-path operations.
 */
export const reservoir = new Reservoir(
  'timescale',
  // Config not used when pool is injected, but required by the type
  { host: '', port: 0, database: '', username: '', password: '' },
  {
    pool,
    tableName: 'logs',
    skipInitialize: true,
  },
);

// Initialize immediately (no-op since skipInitialize=true, but marks as ready)
reservoir.initialize().catch((err: unknown) => {
  console.error('[Reservoir] Failed to initialize:', err);
});
