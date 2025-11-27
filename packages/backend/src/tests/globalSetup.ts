import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { migrateToLatest } from '../database/migrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Global setup for Vitest
 * Runs ONCE before all test files
 */
export default async function globalSetup() {
    console.log('🔧 [Global Setup] Starting test environment setup...');

    // Load test environment variables
    dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

    console.log('📊 [Global Setup] Database:', process.env.DATABASE_URL?.split('@')[1]);

    try {
        // Run database migrations
        console.log('🗄️  [Global Setup] Running database migrations...');
        await migrateToLatest();
        console.log('✅ [Global Setup] Migrations completed');
    } catch (error) {
        console.error('❌ [Global Setup] Failed to run migrations:', error);
        throw error;
    }

    console.log('✅ [Global Setup] Test environment ready!');

    // Return a teardown function (optional)
    return async () => {
        console.log('🧹 [Global Teardown] Cleaning up...');
        // No need to close DB connection here - it's done in afterAll hook
    };
}
