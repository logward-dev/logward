import type { EngineType, StorageConfig } from './core/types.js';
import type { StorageEngine } from './core/storage-engine.js';
import { TimescaleEngine, type TimescaleEngineOptions } from './engines/timescale/timescale-engine.js';
import { ClickHouseEngine, type ClickHouseEngineOptions } from './engines/clickhouse/clickhouse-engine.js';

export type EngineOptions = TimescaleEngineOptions | ClickHouseEngineOptions;

export class StorageEngineFactory {
  static create(type: EngineType, config: StorageConfig, options?: EngineOptions): StorageEngine {
    // Skip validation when using an injected pool/client
    const skipValidation =
      (type === 'timescale' && (options as TimescaleEngineOptions)?.pool) ||
      (type === 'clickhouse' && (options as ClickHouseEngineOptions)?.client);

    if (!skipValidation) {
      this.validateConfig(config);
    }

    switch (type) {
      case 'timescale':
        return new TimescaleEngine(config, options as TimescaleEngineOptions);

      case 'clickhouse':
        return new ClickHouseEngine(config, options as ClickHouseEngineOptions);

      case 'clickhouse-fdw':
        throw new Error('ClickHouse FDW engine not yet implemented');

      default: {
        const _exhaustive: never = type;
        throw new Error(`Unsupported engine type: ${_exhaustive}`);
      }
    }
  }

  private static validateConfig(config: StorageConfig): void {
    if (!config.host) throw new Error('Storage config: host is required');
    if (!config.port) throw new Error('Storage config: port is required');
    if (!config.database) throw new Error('Storage config: database is required');
    if (!config.username) throw new Error('Storage config: username is required');
    if (!config.password) throw new Error('Storage config: password is required');
  }
}
