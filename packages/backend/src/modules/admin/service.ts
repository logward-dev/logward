import { db, getPoolStats } from '../../database/index.js';
import { sql } from 'kysely';
import { reservoir } from '../../database/reservoir.js';
import { connection as redis, isRedisAvailable } from '../../queue/connection.js';
import { CacheManager, type CacheStats, isCacheEnabled } from '../../utils/cache.js';
import { settingsService, type UpdateChannel } from '../settings/service.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf-8'));
const CURRENT_VERSION: string = packageJson.version;

// System-wide statistics
export interface SystemStats {
    users: {
        total: number;
        growth: {
            today: number;
            week: number;
            month: number;
        };
        active: number; // users who logged in last 30 days
    };
    organizations: {
        total: number;
        growth: {
            today: number;
            week: number;
            month: number;
        };
    };
    projects: {
        total: number;
        growth: {
            today: number;
            week: number;
            month: number;
        };
    };
}

// Database statistics
export interface DatabaseStats {
    tables: Array<{
        name: string;
        size: string;
        rows: number;
        indexes_size: string;
    }>;
    totalSize: string;
    totalRows: number;
}

// Log statistics
export interface LogsStats {
    total: number;
    perDay: Array<{
        date: string;
        count: number;
    }>;
    topOrganizations: Array<{
        organizationId: string;
        organizationName: string;
        count: number;
    }>;
    topProjects: Array<{
        projectId: string;
        projectName: string;
        organizationName: string;
        count: number;
    }>;
    growth: {
        logsPerHour: number;
        logsPerDay: number;
    };
}

// Performance metrics
export interface PerformanceStats {
    ingestion: {
        throughput: number; // logs per second (last hour)
        avgLatency: number; // milliseconds
    };
    storage: {
        logsSize: string;
        compressionRatio: number; // percentage saved by TimescaleDB compression
    };
}

// TimescaleDB compression statistics per hypertable
export interface CompressionStats {
    hypertable: string;
    totalChunks: number;
    compressedChunks: number;
    uncompressedSizeBytes: number;
    compressedSizeBytes: number;
    compressionRatio: number; // e.g., 10.5 means 10.5:1 compression
    spaceSavedBytes: number;
    spaceSavedPretty: string;
}

// Continuous aggregate health
export interface AggregateStats {
    viewName: string;
    hypertableName: string;
    lastRefresh: Date | null;
    refreshInterval: string;
    totalRows: number;
}

// Alert system statistics
export interface AlertsStats {
    rules: {
        total: number;
        active: number;
        disabled: number;
    };
    triggered: {
        last24h: number;
        last7days: number;
    };
    perOrganization: Array<{
        organizationId: string;
        organizationName: string;
        rulesCount: number;
    }>;
    notifications: {
        success: number;
        failed: number;
    };
}

// Redis statistics
export interface RedisStats {
    memory: {
        used: string;
        peak: string;
    };
    queues: {
        alertNotifications: {
            waiting: number;
            active: number;
            completed: number;
            failed: number;
        };
        sigmaDetection: {
            waiting: number;
            active: number;
            completed: number;
            failed: number;
        };
    };
    connections: number;
}

// Health check
export interface HealthStats {
    database: {
        status: 'healthy' | 'degraded' | 'down';
        latency: number; // milliseconds
        connections: number;
    };
    redis: {
        status: 'healthy' | 'degraded' | 'down' | 'not_configured';
        latency: number;
    };
    // Connection pool statistics (application-level)
    pool: {
        totalConnections: number;  // Total connections in pool
        idleConnections: number;   // Available connections
        waitingRequests: number;   // Queries waiting for connection
    };
    overall: 'healthy' | 'degraded' | 'down';
}

export class AdminService {
    /**
     * Get system-wide statistics
     *
     * PERFORMANCE: Uses conditional aggregation to get all stats in 3 queries
     * instead of 13 separate queries.
     */
    async getSystemStats(): Promise<SystemStats> {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // PERFORMANCE: Single query for all user stats using conditional aggregation
        const userStats = await db
            .selectFrom('users')
            .select([
                sql<number>`COUNT(*)::int`.as('total'),
                sql<number>`COUNT(*) FILTER (WHERE created_at >= ${today})::int`.as('today'),
                sql<number>`COUNT(*) FILTER (WHERE created_at >= ${weekAgo})::int`.as('week'),
                sql<number>`COUNT(*) FILTER (WHERE created_at >= ${monthAgo})::int`.as('month'),
                sql<number>`COUNT(*) FILTER (WHERE last_login >= ${thirtyDaysAgo})::int`.as('active'),
            ])
            .executeTakeFirstOrThrow();

        // PERFORMANCE: Single query for all organization stats
        const orgStats = await db
            .selectFrom('organizations')
            .select([
                sql<number>`COUNT(*)::int`.as('total'),
                sql<number>`COUNT(*) FILTER (WHERE created_at >= ${today})::int`.as('today'),
                sql<number>`COUNT(*) FILTER (WHERE created_at >= ${weekAgo})::int`.as('week'),
                sql<number>`COUNT(*) FILTER (WHERE created_at >= ${monthAgo})::int`.as('month'),
            ])
            .executeTakeFirstOrThrow();

        // PERFORMANCE: Single query for all project stats
        const projectStats = await db
            .selectFrom('projects')
            .select([
                sql<number>`COUNT(*)::int`.as('total'),
                sql<number>`COUNT(*) FILTER (WHERE created_at >= ${today})::int`.as('today'),
                sql<number>`COUNT(*) FILTER (WHERE created_at >= ${weekAgo})::int`.as('week'),
                sql<number>`COUNT(*) FILTER (WHERE created_at >= ${monthAgo})::int`.as('month'),
            ])
            .executeTakeFirstOrThrow();

        return {
            users: {
                total: userStats.total,
                growth: {
                    today: userStats.today,
                    week: userStats.week,
                    month: userStats.month,
                },
                active: userStats.active,
            },
            organizations: {
                total: orgStats.total,
                growth: {
                    today: orgStats.today,
                    week: orgStats.week,
                    month: orgStats.month,
                },
            },
            projects: {
                total: projectStats.total,
                growth: {
                    today: projectStats.today,
                    week: projectStats.week,
                    month: projectStats.month,
                },
            },
        };
    }

    /**
     * Get database statistics
     */
    /**
     * PERFORMANCE: Uses pg_class reltuples for row estimates (avoids full table scans),
     * approximate_row_count for logs hypertable, and runs queries in parallel.
     */
    async getDatabaseStats(): Promise<DatabaseStats> {
        const [tables, rowEstimates, totalSizeResult] = await Promise.all([
            // Table sizes (no COUNT subquery - uses pg catalog only)
            db.executeQuery<{
                name: string;
                size: string;
                indexes_size: string;
            }>(
                sql`
                    SELECT
                        schemaname || '.' || tablename AS name,
                        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
                        pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS indexes_size
                    FROM pg_tables
                    WHERE schemaname = 'public'
                    AND tablename IN ('users', 'organizations', 'projects', 'logs', 'alert_rules', 'alert_history', 'api_keys', 'sessions', 'notifications', 'sigma_rules')
                    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
                `.compile(db)
            ),

            // Row estimates: approximate_row_count for hypertables, reltuples for regular tables
            db.executeQuery<{ name: string; rows: number }>(
                sql`
                    SELECT 'logs' AS name, approximate_row_count('logs')::int AS rows
                    UNION ALL
                    SELECT relname AS name, GREATEST(reltuples, 0)::int AS rows
                    FROM pg_class
                    WHERE relname IN ('users', 'organizations', 'projects', 'alert_rules', 'alert_history')
                `.compile(db)
            ),

            // Total database size
            db.executeQuery<{ size: string }>(
                sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`.compile(db)
            ),
        ]);

        // Build row count lookup
        const rowsMap = new Map(rowEstimates.rows.map((r) => [r.name, r.rows]));

        const tablesWithCounts = tables.rows.map((table) => {
            const tableName = table.name.replace('public.', '');
            return {
                ...table,
                rows: rowsMap.get(tableName) || 0,
            };
        });

        const totalRows = tablesWithCounts.reduce((sum, t) => sum + t.rows, 0);

        return {
            tables: tablesWithCounts,
            totalSize: totalSizeResult.rows[0]?.size || '0 bytes',
            totalRows,
        };
    }

    /**
     * Get log statistics
     *
     * PERFORMANCE: Uses logs_daily_stats continuous aggregate for per-day, top orgs,
     * and top projects (30ms vs 37s on raw logs). approximate_row_count for total.
     * All queries run in parallel.
     */
    async getLogsStats(): Promise<LogsStats> {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        // Run all queries in parallel - uses continuous aggregates for heavy queries
        const [totalLogs, logsPerDay, topOrgs, topProjects, logsLastHour, logsLastDay] = await Promise.all([
            // Approximate total logs (avoids full table scan on hypertable)
            db.executeQuery<{ count: number }>(
                sql`SELECT approximate_row_count('logs')::int AS count`.compile(db)
            ).then(r => r.rows[0] ?? { count: 0 }),

            // Logs per day from continuous aggregate (43ms vs 5.9s on raw)
            db.executeQuery<{ date: string; count: number }>(
                sql`
                    SELECT
                        bucket::date AS date,
                        SUM(log_count)::int AS count
                    FROM logs_daily_stats
                    WHERE bucket >= ${sql.lit(thirtyDaysAgo)}
                    GROUP BY bucket
                    ORDER BY bucket DESC
                    LIMIT 30
                `.compile(db)
            ),

            // Top organizations from continuous aggregate (31ms vs 37s on raw)
            db.executeQuery<{ organizationId: string; organizationName: string; count: number }>(
                sql`
                    SELECT
                        o.id AS "organizationId",
                        o.name AS "organizationName",
                        SUM(lds.log_count)::int AS count
                    FROM logs_daily_stats lds
                    JOIN projects p ON p.id = lds.project_id
                    JOIN organizations o ON o.id = p.organization_id
                    WHERE lds.bucket >= ${sql.lit(thirtyDaysAgo)}
                    GROUP BY o.id, o.name
                    ORDER BY count DESC
                    LIMIT 10
                `.compile(db)
            ),

            // Top projects from continuous aggregate (37ms vs 16s on raw)
            db.executeQuery<{ projectId: string; projectName: string; organizationName: string; count: number }>(
                sql`
                    SELECT
                        p.id AS "projectId",
                        p.name AS "projectName",
                        o.name AS "organizationName",
                        SUM(lds.log_count)::int AS count
                    FROM logs_daily_stats lds
                    JOIN projects p ON p.id = lds.project_id
                    JOIN organizations o ON o.id = p.organization_id
                    WHERE lds.bucket >= ${sql.lit(thirtyDaysAgo)}
                    GROUP BY p.id, p.name, o.name
                    ORDER BY count DESC
                    LIMIT 10
                `.compile(db)
            ),

            // Logs in last hour (reservoir: works with any engine)
            reservoir.count({ from: oneHourAgo, to: now })
                .then(r => ({ count: r.count })),

            // Logs in last day (reservoir: works with any engine)
            reservoir.count({ from: oneDayAgo, to: now })
                .then(r => ({ count: r.count })),
        ]);

        return {
            total: totalLogs.count,
            perDay: logsPerDay.rows.map((row) => ({
                date: row.date,
                count: row.count,
            })),
            topOrganizations: topOrgs.rows.map((org) => ({
                organizationId: org.organizationId,
                organizationName: org.organizationName,
                count: org.count,
            })),
            topProjects: topProjects.rows.map((proj) => ({
                projectId: proj.projectId,
                projectName: proj.projectName,
                organizationName: proj.organizationName,
                count: proj.count,
            })),
            growth: {
                logsPerHour: logsLastHour.count,
                logsPerDay: logsLastDay.count,
            },
        };
    }

    /**
     * Get performance statistics
     *
     * PERFORMANCE: Uses `time` column (hypertable partition key) for chunk pruning
     * instead of `created_at` which scans all chunks. Runs queries in parallel.
     */
    async getPerformanceStats(): Promise<PerformanceStats> {
        const [logsLastHour, logsSize, avgLatencyResult, compressionRatio] = await Promise.all([
            // Logs in last hour (reservoir: works with any engine)
            reservoir.count({ from: new Date(Date.now() - 60 * 60 * 1000), to: new Date() })
                .then(r => ({ count: r.count })),

            // Logs table size (pg catalog, instant)
            db.executeQuery<{ size: string }>(
                sql`SELECT pg_size_pretty(pg_total_relation_size('logs')) AS size`.compile(db)
            ),

            // Average latency from recent ingestion
            db.executeQuery<{ avg_latency: number }>(
                sql`
                    SELECT AVG(EXTRACT(EPOCH FROM (NOW() - time)) * 1000)::int AS avg_latency
                    FROM logs
                    WHERE time > NOW() - INTERVAL '5 minutes'
                    AND time <= NOW()
                `.compile(db)
            ),

            // Compression ratio
            this.getCompressionRatio(),
        ]);

        const throughput = logsLastHour.count / 3600; // logs per second
        const avgLatency = avgLatencyResult.rows[0]?.avg_latency || 0;

        return {
            ingestion: {
                throughput,
                avgLatency,
            },
            storage: {
                logsSize: logsSize.rows[0]?.size || '0 bytes',
                compressionRatio,
            },
        };
    }

    /**
     * Get TimescaleDB compression ratio for logs table
     * Returns the ratio of compressed size to uncompressed size
     */
    private async getCompressionRatio(): Promise<number> {
        try {
            const compressionStats = await db.executeQuery<{
                uncompressed_bytes: string;
                compressed_bytes: string;
            }>(
                sql`
                    SELECT
                        before_compression_total_bytes::bigint AS uncompressed_bytes,
                        after_compression_total_bytes::bigint AS compressed_bytes
                    FROM hypertable_compression_stats('logs')
                `.compile(db)
            );

            const row = compressionStats.rows[0];
            if (row && row.uncompressed_bytes && row.compressed_bytes) {
                const uncompressed = Number(row.uncompressed_bytes);
                const compressed = Number(row.compressed_bytes);
                if (uncompressed > 0 && compressed > 0) {
                    // Ratio = uncompressed / compressed (e.g., 10x means 10:1 compression)
                    return parseFloat((uncompressed / compressed).toFixed(2));
                }
            }

            return 0; // No compression stats available yet
        } catch (error) {
            console.error('[AdminService] Error fetching compression ratio:', error);
            return 0;
        }
    }

    /**
     * Get detailed compression statistics for all TimescaleDB hypertables
     *
     * Returns per-hypertable compression metrics including:
     * - Number of compressed vs uncompressed chunks
     * - Compression ratio
     * - Space saved
     */
    async getCompressionStats(): Promise<CompressionStats[]> {
        try {
            // Get all hypertables and their compression stats using the function
            const stats = await db.executeQuery<{
                hypertable: string;
                total_chunks: number;
                compressed_chunks: number;
                uncompressed_bytes: string;
                compressed_bytes: string;
                space_saved: string;
            }>(
                sql`
                    WITH hypertables AS (
                        SELECT hypertable_name FROM timescaledb_information.hypertables
                    ),
                    compression_data AS (
                        SELECT
                            h.hypertable_name AS hypertable,
                            COALESCE(c.total_chunks, 0)::int AS total_chunks,
                            COALESCE(c.number_compressed_chunks, 0)::int AS compressed_chunks,
                            COALESCE(c.before_compression_total_bytes, 0)::bigint AS uncompressed_bytes,
                            COALESCE(c.after_compression_total_bytes, 0)::bigint AS compressed_bytes,
                            pg_size_pretty(COALESCE(c.before_compression_total_bytes - c.after_compression_total_bytes, 0)) AS space_saved
                        FROM hypertables h
                        LEFT JOIN LATERAL hypertable_compression_stats(h.hypertable_name::regclass) c ON true
                    )
                    SELECT * FROM compression_data
                    WHERE total_chunks > 0
                    ORDER BY uncompressed_bytes DESC
                `.compile(db)
            );

            return stats.rows.map((row) => {
                const uncompressed = BigInt(row.uncompressed_bytes || '0');
                const compressed = BigInt(row.compressed_bytes || '0');
                const ratio = compressed > 0n ? Number(uncompressed) / Number(compressed) : 0;

                return {
                    hypertable: row.hypertable,
                    totalChunks: row.total_chunks,
                    compressedChunks: row.compressed_chunks,
                    uncompressedSizeBytes: Number(uncompressed),
                    compressedSizeBytes: Number(compressed),
                    compressionRatio: parseFloat(ratio.toFixed(2)),
                    spaceSavedBytes: Number(uncompressed - compressed),
                    spaceSavedPretty: row.space_saved,
                };
            });
        } catch (error) {
            console.error('[AdminService] Error fetching compression stats:', error);
            return [];
        }
    }

    /**
     * Get continuous aggregate health and refresh status
     *
     * Returns information about all continuous aggregates including:
     * - Last refresh time
     * - Refresh policy interval
     * - Row counts
     */
    async getAggregateStats(): Promise<AggregateStats[]> {
        try {
            // Get continuous aggregate info
            const aggregates = await db.executeQuery<{
                view_name: string;
                materialization_hypertable_name: string;
            }>(
                sql`
                    SELECT
                        view_name,
                        materialization_hypertable_name
                    FROM timescaledb_information.continuous_aggregates
                    ORDER BY view_name
                `.compile(db)
            );

            const results: AggregateStats[] = [];

            for (const agg of aggregates.rows) {
                // Get refresh policy for this aggregate
                const policyResult = await db.executeQuery<{
                    schedule_interval: string;
                }>(
                    sql`
                        SELECT
                            schedule_interval::text AS schedule_interval
                        FROM timescaledb_information.jobs
                        WHERE hypertable_name = ${agg.view_name}
                        AND proc_name = 'policy_refresh_continuous_aggregate'
                        LIMIT 1
                    `.compile(db)
                );

                // Get approximate row count from materialization hypertable
                const countResult = await db.executeQuery<{ count: number }>(
                    sql`
                        SELECT reltuples::bigint AS count
                        FROM pg_class
                        WHERE relname = ${agg.materialization_hypertable_name}
                    `.compile(db)
                );

                // Get last refresh time from job stats
                const lastRefreshResult = await db.executeQuery<{
                    last_run_started_at: Date | null;
                }>(
                    sql`
                        SELECT last_run_started_at
                        FROM timescaledb_information.job_stats js
                        JOIN timescaledb_information.jobs j ON j.job_id = js.job_id
                        WHERE j.hypertable_name = ${agg.view_name}
                        AND j.proc_name = 'policy_refresh_continuous_aggregate'
                        LIMIT 1
                    `.compile(db)
                );

                results.push({
                    viewName: agg.view_name,
                    hypertableName: agg.materialization_hypertable_name,
                    lastRefresh: lastRefreshResult.rows[0]?.last_run_started_at || null,
                    refreshInterval: policyResult.rows[0]?.schedule_interval || 'unknown',
                    totalRows: Number(countResult.rows[0]?.count || 0),
                });
            }

            return results;
        } catch (error) {
            console.error('[AdminService] Error fetching aggregate stats:', error);
            return [];
        }
    }

    /**
     * Get alert system statistics
     */
    async getAlertsStats(): Promise<AlertsStats> {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // Total alert rules
        const totalRules = await db
            .selectFrom('alert_rules')
            .select(sql<number>`COUNT(*)::int`.as('count'))
            .executeTakeFirstOrThrow();

        const activeRules = await db
            .selectFrom('alert_rules')
            .select(sql<number>`COUNT(*)::int`.as('count'))
            .where('enabled', '=', true)
            .executeTakeFirstOrThrow();

        const disabledRules = totalRules.count - activeRules.count;

        // Triggered alerts
        const triggeredLast24h = await db
            .selectFrom('alert_history')
            .select(sql<number>`COUNT(*)::int`.as('count'))
            .where('triggered_at', '>=', oneDayAgo)
            .executeTakeFirstOrThrow();

        const triggeredLast7days = await db
            .selectFrom('alert_history')
            .select(sql<number>`COUNT(*)::int`.as('count'))
            .where('triggered_at', '>=', sevenDaysAgo)
            .executeTakeFirstOrThrow();

        // Alert rules per organization
        const perOrg = await db
            .selectFrom('alert_rules')
            .innerJoin('organizations', 'organizations.id', 'alert_rules.organization_id')
            .select([
                'organizations.id as organizationId',
                'organizations.name as organizationName',
                sql<number>`COUNT(*)::int`.as('rulesCount'),
            ])
            .groupBy(['organizations.id', 'organizations.name'])
            .orderBy('rulesCount', 'desc')
            .limit(10)
            .execute();

        // Notification success/failure
        const notifiedSuccess = await db
            .selectFrom('alert_history')
            .select(sql<number>`COUNT(*)::int`.as('count'))
            .where('notified', '=', true)
            .where('error', 'is', null)
            .executeTakeFirstOrThrow();

        const notifiedFailed = await db
            .selectFrom('alert_history')
            .select(sql<number>`COUNT(*)::int`.as('count'))
            .where('notified', '=', true)
            .where('error', 'is not', null)
            .executeTakeFirstOrThrow();

        return {
            rules: {
                total: totalRules.count,
                active: activeRules.count,
                disabled: disabledRules,
            },
            triggered: {
                last24h: triggeredLast24h.count,
                last7days: triggeredLast7days.count,
            },
            perOrganization: perOrg.map((org) => ({
                organizationId: org.organizationId,
                organizationName: org.organizationName,
                rulesCount: org.rulesCount,
            })),
            notifications: {
                success: notifiedSuccess.count,
                failed: notifiedFailed.count,
            },
        };
    }

    /**
     * Get Redis statistics
     */
    async getRedisStats(): Promise<RedisStats> {
        // Return empty stats if Redis is not configured
        if (!isRedisAvailable() || !redis) {
            return {
                memory: {
                    used: 'N/A (Redis not configured)',
                    peak: 'N/A',
                },
                queues: {
                    alertNotifications: { waiting: 0, active: 0, completed: 0, failed: 0 },
                    sigmaDetection: { waiting: 0, active: 0, completed: 0, failed: 0 },
                },
                connections: 0,
            };
        }

        try {
            // Get Redis memory info
            const info = await redis.info('memory');
            const lines = info.split('\r\n');
            const memoryInfo: Record<string, string> = {};
            lines.forEach((line) => {
                const [key, value] = line.split(':');
                if (key && value) {
                    memoryInfo[key] = value;
                }
            });

            const usedMemory = memoryInfo['used_memory_human'] || '0B';
            const peakMemory = memoryInfo['used_memory_peak_human'] || '0B';

            // Get queue stats from BullMQ
            // For now, return placeholder values - would need Queue instances to get real data
            const connections = await redis.call('CLIENT', 'LIST') as string;
            const connectionCount = connections.split('\n').length - 1;

            return {
                memory: {
                    used: usedMemory,
                    peak: peakMemory,
                },
                queues: {
                    alertNotifications: {
                        waiting: 0,
                        active: 0,
                        completed: 0,
                        failed: 0,
                    },
                    sigmaDetection: {
                        waiting: 0,
                        active: 0,
                        completed: 0,
                        failed: 0,
                    },
                },
                connections: connectionCount,
            };
        } catch (error) {
            console.error('Error getting Redis stats:', error);
            return {
                memory: {
                    used: '0B',
                    peak: '0B',
                },
                queues: {
                    alertNotifications: {
                        waiting: 0,
                        active: 0,
                        completed: 0,
                        failed: 0,
                    },
                    sigmaDetection: {
                        waiting: 0,
                        active: 0,
                        completed: 0,
                        failed: 0,
                    },
                },
                connections: 0,
            };
        }
    }

    /**
     * Get health check statistics
     */
    async getHealthStats(): Promise<HealthStats> {
        // Get application-level pool stats
        const poolStats = getPoolStats();

        // Database health
        const dbStart = Date.now();
        try {
            await db.selectFrom('users').select('id').limit(1).execute();
            const dbLatency = Date.now() - dbStart;

            // Get connection count from PostgreSQL
            const connResult = await db.executeQuery<{ count: number }>(
                sql`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname = current_database()`.compile(
                    db
                )
            );
            const dbConnections = connResult.rows[0]?.count || 0;

            // Redis health (only if configured)
            const redisStart = Date.now();
            let redisStatus: 'healthy' | 'degraded' | 'down' | 'not_configured' = 'not_configured';
            let redisLatency = 0;

            if (isRedisAvailable() && redis) {
                try {
                    await redis.ping();
                    redisLatency = Date.now() - redisStart;
                    redisStatus = redisLatency > 100 ? 'degraded' : 'healthy';
                } catch {
                    redisStatus = 'down';
                    redisLatency = -1;
                }
            }

            const dbStatus: 'healthy' | 'degraded' | 'down' =
                dbLatency < 50 ? 'healthy' : dbLatency < 200 ? 'degraded' : 'down';

            // Check pool health: degraded if waiting requests > 0
            const poolHealthy = poolStats.waitingCount === 0;

            // Redis is not required - only affects overall status if configured and down
            const redisHealthy = redisStatus === 'healthy' || redisStatus === 'not_configured';

            const overall: 'healthy' | 'degraded' | 'down' =
                dbStatus === 'healthy' && redisHealthy && poolHealthy
                    ? 'healthy'
                    : dbStatus === 'down' || redisStatus === 'down'
                        ? 'down'
                        : 'degraded';

            return {
                database: {
                    status: dbStatus,
                    latency: dbLatency,
                    connections: dbConnections,
                },
                redis: {
                    status: redisStatus,
                    latency: redisLatency,
                },
                pool: {
                    totalConnections: poolStats.totalCount,
                    idleConnections: poolStats.idleCount,
                    waitingRequests: poolStats.waitingCount,
                },
                overall,
            };
        } catch (error) {
            return {
                database: {
                    status: 'down',
                    latency: -1,
                    connections: 0,
                },
                redis: {
                    status: 'down',
                    latency: -1,
                },
                pool: {
                    totalConnections: poolStats.totalCount,
                    idleConnections: poolStats.idleCount,
                    waitingRequests: poolStats.waitingCount,
                },
                overall: 'down',
            };
        }
    }

    /**
     * Get paginated list of users with optional search
     */
    async getUsers(page: number = 1, limit: number = 50, search?: string) {
        const offset = (page - 1) * limit;

        let query = db
            .selectFrom('users')
            .select([
                'id',
                'email',
                'name',
                'is_admin',
                'disabled',
                'created_at',
                'last_login',
            ])
            .orderBy('created_at', 'desc')
            .limit(limit)
            .offset(offset);

        if (search) {
            query = query.where((eb) =>
                eb.or([
                    eb('email', 'ilike', `%${search}%`),
                    eb('name', 'ilike', `%${search}%`),
                ])
            );
        }

        const users = await query.execute();

        // Get total count
        let countQuery = db
            .selectFrom('users')
            .select(({ fn }) => fn.countAll().as('count'));

        if (search) {
            countQuery = countQuery.where((eb) =>
                eb.or([
                    eb('email', 'ilike', `%${search}%`),
                    eb('name', 'ilike', `%${search}%`),
                ])
            );
        }

        const { count } = await countQuery.executeTakeFirstOrThrow();

        return {
            users,
            total: Number(count),
            page,
            limit,
            totalPages: Math.ceil(Number(count) / limit),
        };
    }

    /**
     * Get detailed user information including organizations
     */
    async getUserDetails(userId: string) {
        const user = await db
            .selectFrom('users')
            .select([
                'id',
                'email',
                'name',
                'is_admin',
                'disabled',
                'created_at',
                'updated_at',
                'last_login',
            ])
            .where('id', '=', userId)
            .executeTakeFirst();

        if (!user) {
            return null;
        }

        // Get user's organizations
        const organizations = await db
            .selectFrom('organization_members')
            .innerJoin('organizations', 'organizations.id', 'organization_members.organization_id')
            .select([
                'organizations.id',
                'organizations.name',
                'organizations.slug',
                'organization_members.role',
                'organization_members.created_at',
            ])
            .where('organization_members.user_id', '=', userId)
            .execute();

        // Get recent sessions count
        const sessionsCount = await db
            .selectFrom('sessions')
            .select(({ fn }) => fn.countAll().as('count'))
            .where('user_id', '=', userId)
            .executeTakeFirstOrThrow();

        return {
            ...user,
            organizations,
            activeSessions: Number(sessionsCount.count),
        };
    }

    /**
     * Enable or disable a user account
     */
    async updateUserStatus(userId: string, disabled: boolean) {
        const user = await db
            .updateTable('users')
            .set({ disabled })
            .where('id', '=', userId)
            .returning(['id', 'email', 'name', 'disabled'])
            .executeTakeFirst();

        if (!user) {
            throw new Error('User not found');
        }

        // If disabling, delete all active sessions
        if (disabled) {
            await db
                .deleteFrom('sessions')
                .where('user_id', '=', userId)
                .execute();
        }

        return user;
    }

    /**
     * Update user admin role
     */
    async updateUserRole(userId: string, isAdmin: boolean) {
        const user = await db
            .updateTable('users')
            .set({ is_admin: isAdmin })
            .where('id', '=', userId)
            .returning(['id', 'email', 'name', 'is_admin', 'disabled'])
            .executeTakeFirst();

        if (!user) {
            throw new Error('User not found');
        }

        return user;
    }

    /**
     * Reset user password (admin action)
     */
    async resetUserPassword(userId: string, newPassword: string) {
        const bcrypt = await import('bcrypt');
        const passwordHash = await bcrypt.hash(newPassword, 10);

        const user = await db
            .updateTable('users')
            .set({ password_hash: passwordHash })
            .where('id', '=', userId)
            .returning(['id', 'email', 'name'])
            .executeTakeFirst();

        if (!user) {
            throw new Error('User not found');
        }

        // Delete all active sessions to force re-login
        await db
            .deleteFrom('sessions')
            .where('user_id', '=', userId)
            .execute();

        return user;
    }

    // Organization Management
    async getOrganizations(page: number = 1, limit: number = 50, search?: string) {
        const offset = (page - 1) * limit;

        let query = db
            .selectFrom('organizations')
            .select([
                'organizations.id',
                'organizations.name',
                'organizations.slug',
                'organizations.created_at',
                'organizations.updated_at',
            ])
            .orderBy('organizations.created_at', 'desc');

        if (search) {
            query = query.where((eb) =>
                eb.or([
                    eb('organizations.name', 'ilike', `%${search}%`),
                    eb('organizations.slug', 'ilike', `%${search}%`),
                ])
            );
        }

        const [organizations, countResult] = await Promise.all([
            query.limit(limit).offset(offset).execute(),
            db
                .selectFrom('organizations')
                .select(({ fn }) => [fn.count<number>('id').as('count')])
                .executeTakeFirst(),
        ]);

        const total = Number(countResult?.count || 0);

        if (organizations.length === 0) {
            return {
                organizations: [],
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };
        }

        // PERFORMANCE: Batch queries instead of N+1 (100+ queries → 2 queries)
        const orgIds = organizations.map((o) => o.id);

        const [memberCounts, projectCounts] = await Promise.all([
            db
                .selectFrom('organization_members')
                .select(['organization_id', sql<number>`COUNT(*)::int`.as('count')])
                .where('organization_id', 'in', orgIds)
                .groupBy('organization_id')
                .execute(),
            db
                .selectFrom('projects')
                .select(['organization_id', sql<number>`COUNT(*)::int`.as('count')])
                .where('organization_id', 'in', orgIds)
                .groupBy('organization_id')
                .execute(),
        ]);

        // Build lookup maps
        const membersMap = new Map(memberCounts.map((r) => [r.organization_id, r.count]));
        const projectsMap = new Map(projectCounts.map((r) => [r.organization_id, r.count]));

        // Merge counts with organizations
        const orgsWithCounts = organizations.map((org) => ({
            ...org,
            memberCount: membersMap.get(org.id) || 0,
            projectCount: projectsMap.get(org.id) || 0,
        }));

        return {
            organizations: orgsWithCounts,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async getOrganizationDetails(orgId: string) {
        const org = await db
            .selectFrom('organizations')
            .select([
                'id',
                'name',
                'slug',
                'retention_days',
                'created_at',
                'updated_at',
            ])
            .where('id', '=', orgId)
            .executeTakeFirst();

        if (!org) {
            throw new Error('Organization not found');
        }

        // Get members
        const members = await db
            .selectFrom('organization_members')
            .innerJoin('users', 'users.id', 'organization_members.user_id')
            .select([
                'users.id',
                'users.email',
                'users.name',
                'organization_members.role',
                'organization_members.created_at',
            ])
            .where('organization_members.organization_id', '=', orgId)
            .execute();

        // Get projects
        const projects = await db
            .selectFrom('projects')
            .select([
                'id',
                'name',
                'created_at',
            ])
            .where('organization_id', '=', orgId)
            .execute();

        return {
            ...org,
            retentionDays: org.retention_days,
            members,
            projects,
        };
    }

    async deleteOrganization(orgId: string) {
        // This will cascade delete members, projects, and related data
        await db
            .deleteFrom('organizations')
            .where('id', '=', orgId)
            .execute();

        return { message: 'Organization deleted successfully' };
    }

    // Project Management
    async getProjects(page: number = 1, limit: number = 50, search?: string) {
        const offset = (page - 1) * limit;

        let query = db
            .selectFrom('projects')
            .innerJoin('organizations', 'organizations.id', 'projects.organization_id')
            .select([
                'projects.id',
                'projects.name',
                'projects.description',
                'projects.organization_id',
                'organizations.name as organization_name',
                'projects.created_at',
                'projects.updated_at',
            ])
            .orderBy('projects.created_at', 'desc');

        if (search) {
            query = query.where((eb) =>
                eb.or([
                    eb('projects.name', 'ilike', `%${search}%`),
                    eb('organizations.name', 'ilike', `%${search}%`),
                ])
            );
        }

        const [projects, countResult] = await Promise.all([
            query.limit(limit).offset(offset).execute(),
            db
                .selectFrom('projects')
                .select(({ fn }) => [fn.count<number>('id').as('count')])
                .executeTakeFirst(),
        ]);

        const total = Number(countResult?.count || 0);

        if (projects.length === 0) {
            return {
                projects: [],
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            };
        }

        // PERFORMANCE: Batch queries instead of N+1
        // Get all project IDs for batch lookup
        const projectIds = projects.map((p) => p.id);

        // PERFORMANCE: Count logs per project (last 30 days only to avoid full scan)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const now = new Date();
        const [logsCounts, apiKeysCounts, alertRulesCounts] = await Promise.all([
            // Reservoir: count per project in parallel (works with any engine)
            Promise.all(
                projectIds.map(async (pid) => {
                    const r = await reservoir.count({ projectId: pid, from: thirtyDaysAgo, to: now });
                    return { project_id: pid, count: r.count };
                })
            ),
            db
                .selectFrom('api_keys')
                .select(['project_id', sql<number>`COUNT(*)::int`.as('count')])
                .where('project_id', 'in', projectIds)
                .where('revoked', '=', false)
                .groupBy('project_id')
                .execute(),
            db
                .selectFrom('alert_rules')
                .select(['project_id', sql<number>`COUNT(*)::int`.as('count')])
                .where('project_id', 'in', projectIds)
                .groupBy('project_id')
                .execute(),
        ]);

        // Build lookup maps
        const logsMap = new Map(logsCounts.map((r) => [r.project_id, r.count]));
        const apiKeysMap = new Map(apiKeysCounts.map((r) => [r.project_id, r.count]));
        const alertRulesMap = new Map(alertRulesCounts.map((r) => [r.project_id, r.count]));

        // Merge counts with projects
        const projectsWithCounts = projects.map((project) => ({
            ...project,
            logsCount: logsMap.get(project.id) || 0,
            apiKeysCount: apiKeysMap.get(project.id) || 0,
            alertRulesCount: alertRulesMap.get(project.id) || 0,
        }));

        return {
            projects: projectsWithCounts,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async getProjectDetails(projectId: string) {
        const project = await db
            .selectFrom('projects')
            .innerJoin('organizations', 'organizations.id', 'projects.organization_id')
            .select([
                'projects.id',
                'projects.name',
                'projects.description',
                'projects.organization_id',
                'organizations.name as organization_name',
                'projects.created_at',
                'projects.updated_at',
            ])
            .where('projects.id', '=', projectId)
            .executeTakeFirst();

        if (!project) {
            throw new Error('Project not found');
        }

        // Get API keys
        const apiKeys = await db
            .selectFrom('api_keys')
            .select([
                'id',
                'name',
                'created_at',
                'last_used',
                'revoked',
            ])
            .where('project_id', '=', projectId)
            .orderBy('created_at', 'desc')
            .execute();

        // Get alert rules
        const alertRules = await db
            .selectFrom('alert_rules')
            .select([
                'id',
                'name',
                'enabled',
                'created_at',
            ])
            .where('project_id', '=', projectId)
            .orderBy('created_at', 'desc')
            .execute();

        // Get sigma rules
        const sigmaRules = await db
            .selectFrom('sigma_rules')
            .select([
                'id',
                'title',
                'level',
                'status',
                'created_at',
            ])
            .where('project_id', '=', projectId)
            .orderBy('created_at', 'desc')
            .execute();

        // Get logs count (reservoir: works with any engine)
        const logsCountResult = await reservoir.count({
            projectId,
            from: new Date(0),
            to: new Date(),
        });

        // Get recent logs timestamp (reservoir: works with any engine)
        const recentLogResult = await reservoir.query({
            projectId,
            from: new Date(0),
            to: new Date(),
            limit: 1,
        });

        return {
            ...project,
            logsCount: logsCountResult.count,
            apiKeys,
            alertRules,
            sigmaRules,
            lastLogTime: recentLogResult.logs.length > 0 ? recentLogResult.logs[0].time : null,
        };
    }

    async deleteProject(projectId: string) {
        // This will cascade delete logs, API keys, alert rules, and sigma rules
        const result = await db
            .deleteFrom('projects')
            .where('id', '=', projectId)
            .executeTakeFirst();

        if (result.numDeletedRows === 0n) {
            throw new Error('Project not found');
        }

        return { message: 'Project deleted successfully' };
    }

    /**
     * Get cache statistics
     */
    async getCacheStats(): Promise<CacheStats & { enabled: boolean }> {
        const stats = await CacheManager.getStats();
        return {
            ...stats,
            enabled: isCacheEnabled(),
        };
    }

    /**
     * Clear all caches (admin action)
     */
    async clearCache(): Promise<{ cleared: number }> {
        const cleared = await CacheManager.clearAll();
        return { cleared };
    }

    /**
     * Invalidate cache for a specific project
     */
    async invalidateProjectCache(projectId: string): Promise<void> {
        await CacheManager.invalidateProjectCache(projectId);
    }

    /**
     * Get platform activity timeline (hourly data for the chart)
     * Uses continuous aggregates for fast queries
     */
    async getPlatformTimeline(hours: number = 24): Promise<PlatformTimeline> {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);

        const [logsTimeline, detectionsTimeline, spansTimeline] = await Promise.all([
            // Logs per hour from continuous aggregate
            db.executeQuery<{ bucket: string; count: number }>(
                sql`
                    SELECT
                        bucket::text AS bucket,
                        SUM(log_count)::int AS count
                    FROM logs_hourly_stats
                    WHERE bucket >= ${sql.lit(since)}
                    GROUP BY bucket
                    ORDER BY bucket ASC
                `.compile(db)
            ).catch(() => ({ rows: [] as Array<{ bucket: string; count: number }> })),

            // Detection events per hour from continuous aggregate
            db.executeQuery<{ bucket: string; count: number }>(
                sql`
                    SELECT
                        bucket::text AS bucket,
                        SUM(detection_count)::int AS count
                    FROM detection_events_hourly_stats
                    WHERE bucket >= ${sql.lit(since)}
                    GROUP BY bucket
                    ORDER BY bucket ASC
                `.compile(db)
            ).catch(() => ({ rows: [] as Array<{ bucket: string; count: number }> })),

            // Spans per hour from continuous aggregate
            db.executeQuery<{ bucket: string; count: number }>(
                sql`
                    SELECT
                        bucket::text AS bucket,
                        SUM(span_count)::int AS count
                    FROM spans_hourly_stats
                    WHERE bucket >= ${sql.lit(since)}
                    GROUP BY bucket
                    ORDER BY bucket ASC
                `.compile(db)
            ).catch(() => ({ rows: [] as Array<{ bucket: string; count: number }> })),
        ]);

        // Merge all timelines into a single array by bucket
        const bucketMap = new Map<string, {
            bucket: string;
            logsCount: number;
            detectionsCount: number;
            spansCount: number;
        }>();

        for (const row of logsTimeline.rows) {
            bucketMap.set(row.bucket, {
                bucket: row.bucket,
                logsCount: row.count,
                detectionsCount: 0,
                spansCount: 0,
            });
        }

        for (const row of detectionsTimeline.rows) {
            const existing = bucketMap.get(row.bucket);
            if (existing) {
                existing.detectionsCount = row.count;
            } else {
                bucketMap.set(row.bucket, {
                    bucket: row.bucket,
                    logsCount: 0,
                    detectionsCount: row.count,
                    spansCount: 0,
                });
            }
        }

        for (const row of spansTimeline.rows) {
            const existing = bucketMap.get(row.bucket);
            if (existing) {
                existing.spansCount = row.count;
            } else {
                bucketMap.set(row.bucket, {
                    bucket: row.bucket,
                    logsCount: 0,
                    detectionsCount: 0,
                    spansCount: row.count,
                });
            }
        }

        const timeline = Array.from(bucketMap.values()).sort(
            (a, b) => new Date(a.bucket).getTime() - new Date(b.bucket).getTime()
        );

        return { timeline };
    }

    /**
     * Get active issues summary across the platform
     */
    async getActiveIssues(): Promise<ActiveIssues> {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const [openIncidents, criticalDetections, failedNotifications, unresolvedErrors] = await Promise.all([
            // Open incidents (not resolved)
            db
                .selectFrom('incidents')
                .select(sql<number>`COUNT(*)::int`.as('count'))
                .where('status', 'in', ['open', 'investigating'])
                .executeTakeFirstOrThrow()
                .catch((e) => { console.error('[AdminService] Failed to query incidents:', e.message); return { count: 0 }; }),

            // Critical/high detections in last 24h
            db.executeQuery<{ count: number }>(
                sql`
                    SELECT COUNT(*)::int AS count
                    FROM detection_events
                    WHERE time >= ${sql.lit(oneDayAgo)}
                    AND severity IN ('critical', 'high')
                `.compile(db)
            ).then(r => r.rows[0] ?? { count: 0 })
             .catch((e) => { console.error('[AdminService] Failed to query detection_events:', e.message); return { count: 0 }; }),

            // Failed alert notifications in last 24h
            db
                .selectFrom('alert_history')
                .select(sql<number>`COUNT(*)::int`.as('count'))
                .where('triggered_at', '>=', oneDayAgo)
                .where('notified', '=', true)
                .where('error', 'is not', null)
                .executeTakeFirstOrThrow()
                .catch((e) => { console.error('[AdminService] Failed to query alert_history:', e.message); return { count: 0 }; }),

            // Open error groups
            db
                .selectFrom('error_groups')
                .select(sql<number>`COUNT(*)::int`.as('count'))
                .where('status', '=', 'open')
                .executeTakeFirstOrThrow()
                .catch((e) => { console.error('[AdminService] Failed to query error_groups:', e.message); return { count: 0 }; }),
        ]);

        return {
            openIncidents: openIncidents.count,
            criticalDetections24h: criticalDetections.count,
            failedNotifications24h: failedNotifications.count,
            openErrorGroups: unresolvedErrors.count,
        };
    }

    /**
     * Check for new versions by querying GitHub Releases API.
     * Results are cached for 6 hours.
     */
    async checkVersion(): Promise<VersionCheckResult> {
        // Try cache first
        const cacheKey = CacheManager.adminStatsKey('version-check');
        const cached = await CacheManager.get<VersionCheckResult>(cacheKey);
        if (cached) {
            return cached;
        }

        const channel = await settingsService.get('updates.channel').catch(() => 'stable' as UpdateChannel);

        let latestStable: ReleaseInfo | null = null;
        let latestBeta: ReleaseInfo | null = null;

        try {
            const headers: Record<string, string> = {
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'LogTide',
            };
            const githubToken = process.env.GITHUB_TOKEN;
            if (githubToken) {
                headers['Authorization'] = `Bearer ${githubToken}`;
            }

            const response = await fetch(
                'https://api.github.com/repos/logtide-dev/logtide/releases?per_page=20',
                { headers }
            );

            if (!response.ok) {
                console.error(`[AdminService] GitHub API returned ${response.status}`);
                const result: VersionCheckResult = {
                    currentVersion: CURRENT_VERSION,
                    channel,
                    latestStable: null,
                    latestBeta: null,
                    updateAvailable: false,
                    checkedAt: new Date().toISOString(),
                };
                // Cache error result for 30 minutes to avoid hammering
                await CacheManager.set(cacheKey, result, 1800);
                return result;
            }

            const releases: GitHubRelease[] = await response.json();

            for (const release of releases) {
                if (release.draft) continue;

                const info: ReleaseInfo = {
                    version: release.tag_name.replace(/^v/, ''),
                    tag: release.tag_name,
                    name: release.name || release.tag_name,
                    publishedAt: release.published_at,
                    url: release.html_url,
                    prerelease: release.prerelease,
                };

                if (!release.prerelease && !latestStable) {
                    latestStable = info;
                }
                if (release.prerelease && !latestBeta) {
                    latestBeta = info;
                }

                if (latestStable && latestBeta) break;
            }
        } catch (error) {
            console.error('[AdminService] Error checking GitHub releases:', error);
        }

        const targetRelease = channel === 'beta' ? (latestBeta || latestStable) : latestStable;
        const updateAvailable = targetRelease
            ? this.isNewerVersion(CURRENT_VERSION, targetRelease.version)
            : false;

        const result: VersionCheckResult = {
            currentVersion: CURRENT_VERSION,
            channel,
            latestStable,
            latestBeta,
            updateAvailable,
            checkedAt: new Date().toISOString(),
        };

        // Cache for 6 hours
        await CacheManager.set(cacheKey, result, 21600);

        return result;
    }

    /**
     * Compare semver versions. Returns true if remote is newer than current.
     */
    private isNewerVersion(current: string, remote: string): boolean {
        const parseSemver = (v: string) => {
            // Strip pre-release suffix for comparison (e.g. "0.6.0-beta.1" -> [0,6,0])
            const clean = v.replace(/^v/, '').split('-')[0];
            return clean.split('.').map(Number);
        };

        const c = parseSemver(current);
        const r = parseSemver(remote);

        for (let i = 0; i < Math.max(c.length, r.length); i++) {
            const cv = c[i] || 0;
            const rv = r[i] || 0;
            if (rv > cv) return true;
            if (rv < cv) return false;
        }
        return false;
    }

    /**
     * Get slow/long-running queries from pg_stat_activity and pg_stat_statements
     */
    async getSlowQueries(): Promise<SlowQueriesStats> {
        // 1. Currently running queries (from pg_stat_activity, always available)
        const activeQueries = await db.executeQuery<{
            pid: number;
            duration_ms: number;
            state: string;
            query: string;
            wait_event: string | null;
            application_name: string;
            started_at: string;
        }>(
            sql`
                SELECT
                    pid,
                    EXTRACT(EPOCH FROM (NOW() - query_start))::int * 1000 AS duration_ms,
                    state,
                    LEFT(query, 200) AS query,
                    wait_event_type || ':' || wait_event AS wait_event,
                    application_name,
                    query_start::text AS started_at
                FROM pg_stat_activity
                WHERE datname = current_database()
                  AND state != 'idle'
                  AND pid != pg_backend_pid()
                  AND query_start IS NOT NULL
                ORDER BY query_start ASC
                LIMIT 20
            `.compile(db)
        ).catch(() => ({ rows: [] as Array<{
            pid: number; duration_ms: number; state: string;
            query: string; wait_event: string | null;
            application_name: string; started_at: string;
        }> }));

        // 2. Historical slow queries (from pg_stat_statements, may not be available)
        let topSlowQueries: Array<{
            query: string;
            calls: number;
            avg_ms: number;
            total_ms: number;
            rows_per_call: number;
        }> = [];
        let pgStatStatementsAvailable = false;

        try {
            // Check if extension is installed
            const extCheck = await db.executeQuery<{ installed: boolean }>(
                sql`
                    SELECT EXISTS(
                        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
                    ) AS installed
                `.compile(db)
            );

            if (extCheck.rows[0]?.installed) {
                pgStatStatementsAvailable = true;
                const result = await db.executeQuery<{
                    query: string;
                    calls: number;
                    avg_ms: number;
                    total_ms: number;
                    rows_per_call: number;
                }>(
                    sql`
                        SELECT
                            LEFT(query, 200) AS query,
                            calls::int AS calls,
                            ROUND((mean_exec_time)::numeric, 2)::float AS avg_ms,
                            ROUND((total_exec_time)::numeric, 0)::float AS total_ms,
                            CASE WHEN calls > 0
                                THEN ROUND((rows::numeric / calls), 1)::float
                                ELSE 0
                            END AS rows_per_call
                        FROM pg_stat_statements
                        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
                          AND calls > 5
                          AND query NOT LIKE '%pg_stat%'
                        ORDER BY mean_exec_time DESC
                        LIMIT 15
                    `.compile(db)
                );
                topSlowQueries = result.rows;
            }
        } catch (e) {
            console.error('[AdminService] pg_stat_statements query failed:', (e as Error).message);
        }

        return {
            activeQueries: activeQueries.rows.map(q => ({
                pid: q.pid,
                durationMs: q.duration_ms,
                state: q.state,
                query: q.query,
                waitEvent: q.wait_event,
                applicationName: q.application_name,
                startedAt: q.started_at,
            })),
            topSlowQueries,
            pgStatStatementsAvailable,
        };
    }
}

// Interfaces for new endpoints
export interface PlatformTimeline {
    timeline: Array<{
        bucket: string;
        logsCount: number;
        detectionsCount: number;
        spansCount: number;
    }>;
}

export interface ActiveIssues {
    openIncidents: number;
    criticalDetections24h: number;
    failedNotifications24h: number;
    openErrorGroups: number;
}

export interface SlowQueriesStats {
    activeQueries: Array<{
        pid: number;
        durationMs: number;
        state: string;
        query: string;
        waitEvent: string | null;
        applicationName: string;
        startedAt: string;
    }>;
    topSlowQueries: Array<{
        query: string;
        calls: number;
        avg_ms: number;
        total_ms: number;
        rows_per_call: number;
    }>;
    pgStatStatementsAvailable: boolean;
}

// GitHub Release API types (subset)
interface GitHubRelease {
    tag_name: string;
    name: string | null;
    prerelease: boolean;
    draft: boolean;
    published_at: string;
    html_url: string;
}

export interface ReleaseInfo {
    version: string;
    tag: string;
    name: string;
    publishedAt: string;
    url: string;
    prerelease: boolean;
}

export interface VersionCheckResult {
    currentVersion: string;
    channel: UpdateChannel;
    latestStable: ReleaseInfo | null;
    latestBeta: ReleaseInfo | null;
    updateAvailable: boolean;
    checkedAt: string;
}

export const adminService = new AdminService();

export type { CacheStats };
