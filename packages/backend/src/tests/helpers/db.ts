import { db } from '../../database/index.js';

/**
 * Truncate all tables in the database
 * Useful for cleaning up between tests
 */
export async function truncateAllTables() {
    const tables = [
        'logs',
        'alert_history',
        'sigma_rules',
        'alert_rules',
        'api_keys',
        'notifications',
        'organization_members',
        'projects',
        'organizations',
        'sessions',
        'users',
    ];

    for (const table of tables) {
        await db.deleteFrom(table as any).execute();
    }
}

/**
 * Get row count for a table
 */
export async function getTableCount(tableName: string): Promise<number> {
    const result = await db
        .selectFrom(tableName as any)
        .select((eb) => eb.fn.countAll().as('count'))
        .executeTakeFirst();

    return Number(result?.count || 0);
}

/**
 * Check if a record exists by ID
 */
export async function recordExists(
    tableName: string,
    id: string
): Promise<boolean> {
    const result = await db
        .selectFrom(tableName as any)
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();

    return !!result;
}
