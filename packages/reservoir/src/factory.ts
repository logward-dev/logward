import type { EngineType, StorageConfig } from './core/types.js';
import type { StorageEngine } from './core/storage-engine.js';
import { TimescaleEngine, type TimescaleEngineOptions } from './engines/timescale/timescale-engine.js';

export class StorageEngineFactory {
  static create(type: EngineType, config: StorageConfig, options?: TimescaleEngineOptions): StorageEngine {
    // Skip validation when using an injected pool
    if (!options?.pool) {
      this.validateConfig(config);
    }

    switch (type) {
      case 'timescale':
        return new TimescaleEngine(config, options);

      case 'clickhouse':
        throw new Error('ClickHouse engine not yet implemented');

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
