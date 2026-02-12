import type {
  EngineType,
  StorageConfig,
  LogRecord,
  StoredLogRecord,
  QueryParams,
  QueryResult,
  AggregateParams,
  AggregateResult,
  IngestResult,
  IngestReturningResult,
  HealthStatus,
  EngineCapabilities,
} from './core/types.js';
import type { StorageEngine } from './core/storage-engine.js';
import { StorageEngineFactory } from './factory.js';
import type { TimescaleEngineOptions } from './engines/timescale/timescale-engine.js';

/**
 * Reservoir - unified storage client for log management.
 *
 * @example
 * ```typescript
 * // Standalone mode (creates its own pool)
 * const reservoir = new Reservoir('timescale', {
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'logtide',
 *   username: 'logtide',
 *   password: 'secret',
 * });
 * await reservoir.initialize();
 *
 * // Shared pool mode (reuse existing pg.Pool)
 * const reservoir = new Reservoir('timescale', config, {
 *   pool: existingPool,
 *   skipInitialize: true,
 *   tableName: 'logs',
 * });
 * await reservoir.initialize(); // no-op when skipInitialize is true
 * ```
 */
export class Reservoir {
  private engine: StorageEngine;
  private initialized = false;
  private initPromise?: Promise<void>;

  constructor(type: EngineType, config: StorageConfig, options?: TimescaleEngineOptions) {
    this.engine = StorageEngineFactory.create(type, config, options);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      await this.engine.connect();
      await this.engine.initialize();
      this.initialized = true;
    })();

    try {
      await this.initPromise;
    } catch (err) {
      this.initPromise = undefined;
      throw err;
    }
  }

  async ingest(logs: LogRecord[]): Promise<IngestResult> {
    this.ensureInitialized();
    return this.engine.ingest(logs);
  }

  async ingestReturning(logs: LogRecord[]): Promise<IngestReturningResult> {
    this.ensureInitialized();
    return this.engine.ingestReturning(logs);
  }

  async query(params: QueryParams): Promise<QueryResult<StoredLogRecord>> {
    this.ensureInitialized();
    return this.engine.query(params);
  }

  async aggregate(params: AggregateParams): Promise<AggregateResult> {
    this.ensureInitialized();
    return this.engine.aggregate(params);
  }

  async healthCheck(): Promise<HealthStatus> {
    return this.engine.healthCheck();
  }

  getCapabilities(): EngineCapabilities {
    return this.engine.getCapabilities();
  }

  async close(): Promise<void> {
    if (!this.initialized) return;
    try {
      await this.engine.disconnect();
    } finally {
      this.initialized = false;
      this.initPromise = undefined;
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Reservoir not initialized. Call initialize() first.');
    }
  }
}
