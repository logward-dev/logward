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
  GetByIdParams,
  GetByIdsParams,
  CountParams,
  CountResult,
  DistinctParams,
  DistinctResult,
  TopValuesParams,
  TopValuesResult,
  DeleteByTimeRangeParams,
  DeleteResult,
} from './core/types.js';
import type { StorageEngine } from './core/storage-engine.js';
import { StorageEngineFactory } from './factory.js';
import type { EngineOptions } from './factory.js';

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

  constructor(type: EngineType, config: StorageConfig, options?: EngineOptions) {
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

  async getById(params: GetByIdParams): Promise<StoredLogRecord | null> {
    this.ensureInitialized();
    return this.engine.getById(params);
  }

  async getByIds(params: GetByIdsParams): Promise<StoredLogRecord[]> {
    this.ensureInitialized();
    return this.engine.getByIds(params);
  }

  async count(params: CountParams): Promise<CountResult> {
    this.ensureInitialized();
    return this.engine.count(params);
  }

  async distinct(params: DistinctParams): Promise<DistinctResult> {
    this.ensureInitialized();
    return this.engine.distinct(params);
  }

  async topValues(params: TopValuesParams): Promise<TopValuesResult> {
    this.ensureInitialized();
    return this.engine.topValues(params);
  }

  async deleteByTimeRange(params: DeleteByTimeRangeParams): Promise<DeleteResult> {
    this.ensureInitialized();
    return this.engine.deleteByTimeRange(params);
  }

  getEngineType(): EngineType {
    return this.engine.getCapabilities().engine;
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
