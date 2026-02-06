// Simple Node.js script to run migrations without ESM issues on Windows
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../../.env');

console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });
console.log('DATABASE_URL loaded');

// Now dynamically import the migrator
const { migrateToLatest } = await import('./dist/database/migrator.js');

console.log('Database Migration Tool');
console.log('==========================\n');
console.log('Running migrations...\n');

try {
  await migrateToLatest();
  process.exit(0);
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
}
