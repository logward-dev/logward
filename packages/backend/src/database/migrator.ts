import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Migrator, Migration, MigrationProvider, sql } from 'kysely';
import { db } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EsmFileMigrationProvider implements MigrationProvider {
  constructor(private migrationFolder: string) { }

  async getMigrations(): Promise<Record<string, Migration>> {
    const files = await fs.readdir(this.migrationFolder);
    const migrations: Record<string, Migration> = {};

    for (const file of files) {
      const filePath = path.join(this.migrationFolder, file);
      const migrationKey = file.substring(0, file.lastIndexOf('.'));

      if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.mjs')) {
        // Skip definition files
        if (file.endsWith('.d.ts')) continue;

        // On Windows, we need to use file:// URL for dynamic imports
        const url = pathToFileURL(filePath).href;

        const migration = await import(url);
        migrations[migrationKey] = migration;
      } else if (file.endsWith('.sql')) {
        const content = await fs.readFile(filePath, 'utf-8');
        migrations[migrationKey] = {
          up: async (db) => {
            await sql.raw(content).execute(db);
          },
          down: async (_db) => {
            // SQL migrations usually don't have a down step unless specified separately
            // For now we assume no down or it's handled manually
          }
        };
      }
    }
    return migrations;
  }
}

export async function migrateToLatest() {
  const migrationFolder = path.resolve(__dirname, '../../migrations');
  console.log('Migration folder:', migrationFolder);

  const migrator = new Migrator({
    db,
    provider: new EsmFileMigrationProvider(migrationFolder),
  });

  const { error, results } = await migrator.migrateToLatest();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`Migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === 'Error') {
      console.error(`Failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error('Migration failed');
    console.error(error);
    process.exit(1);
  }

  console.log('All migrations completed');
}

export async function migrateDown() {
  const migrationFolder = path.resolve(__dirname, '../../migrations');

  const migrator = new Migrator({
    db,
    provider: new EsmFileMigrationProvider(migrationFolder),
  });

  const { error, results } = await migrator.migrateDown();

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`Migration "${it.migrationName}" was reverted successfully`);
    } else if (it.status === 'Error') {
      console.error(`Failed to revert migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error('Migration rollback failed');
    console.error(error);
    process.exit(1);
  }
}
