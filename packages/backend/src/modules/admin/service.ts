import { db, getPoolStats } from '../../database/index.js';
import { sql } from 'kysely';
import { connection as redis, isRedisAvailable } from '../../queue/connection.js';
import { CacheManager, type CacheStats, isCacheEnabled } from '../../utils/cache.js';

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
    async getDatabaseStats(): Promise<DatabaseStats> {
        // Query table sizes and row counts
        const tables = await db.executeQuery<{
            name: string;
            size: string;
            rows: number;
            indexes_size: string;
        }>(
            sql`
        SELECT
          schemaname || '.' || tablename AS name,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
          (SELECT COUNT(*) FROM logs WHERE tablename = 'logs')::int AS rows,
          pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS indexes_size
        FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename IN ('users', 'organizations', 'projects', 'logs', 'alert_rules', 'alert_history', 'api_keys', 'sessions', 'notifications', 'sigma_rules')
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      `.compile(db)
        );

        // Get row counts for each table
        const logsCount = await db
            .selectFrom('logs')
            .select(sql<number>`COUNT(*)::int`.as('count'))
            .executeTakeFirstOrThrow();

        const usersCount = await db
            .selectFrom('users')
            .select(sql<number>`COUNT(*)::int`.as('count'))
            .executeTakeFirstOrThrow();

        const orgsCount = await db
            .selectFrom('organizations')
            .select(sql<number>`COUNT(*)::int`.as('count'))
            .executeTakeFirstOrThrow();

        const projectsCount = await db
            .selectFrom('projects')
            .select(sql<number>`COUNT(*)::int`.as('count'))
            .executeTakeFirstOrThrow();

        const alertRulesCount = await db
            .selectFrom('alert_rules')
            .select(sql<number>`COUNT(*)::int`.as('count'))
            .executeTakeFirstOrThrow();

        // Calculate total database size
        const totalSizeResult = await db.executeQuery<{ size: string }>(
            sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`.compile(db)
        );

        const tablesWithCounts = tables.rows.map((table) => {
            let rows = 0;
            if (table.name === 'public.logs') rows = logsCount.count;
            else if (table.name === 'public.users') rows = usersCount.count;
            else if (table.name === 'public.organizations') rows = orgsCount.count;
            else if (table.name === 'public.projects') rows = projectsCount.count;
            else if (table.name === 'public.alert_rules') rows = alertRulesCount.count;

            return {
                ...table,
                rows,
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
     */
    async getLogsStats(): Promise<LogsStats> {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        // Total logs
        const totalLogs = await db
            .selectFrom('logs')
            .select(sql<number>`COUNT(*)::int`.as('count'))
            .executeTakeFirstOrThrow();

        // Logs per day (last 30 days)
        const logsPerDay = await db.executeQuery<{
            date: string;
            count: number;
        }>(
            sql`
        SELECT
          DATE(time) AS date,
          COUNT(*)::int AS count
        FROM logs
        WHERE time >= ${sql.lit(thirtyDaysAgo)}
        GROUP BY DATE(time)
        ORDER BY date DESC
        LIMIT 30
      `.compile(db)
        );

        // Top organizations by log count
        const topOrgs = await db
            .selectFrom('logs')
            .innerJoin('projects', 'projects.id', 'logs.project_id')
            .innerJoin('organizations', 'organizations.id', 'projects.organization_id')
            .select([
                'organizations.id as organizationId',
                'organizations.name as organizationName',
                sql<number>`COUNT(*)::int`.as('count'),
            ])
            .groupBy(['organizations.id', 'organizations.name'])
            .orderBy('count', 'desc')
            .limit(10)
            .execute();

        // Top projects by log count
        const topProjects = await db
            .selectFrom('logs')
            .innerJoin('projects', 'projects.id', 'logs.project_id')
            .innerJoin('organizations', 'organizations.id', 'projects.organization_id')
            .select([
                'projects.id as projectId',
                'projects.name as projectName',
                'organizations.name as organizationName',
                sql<number>`COUNT(*)::int`.as('count'),
            ])
            .groupBy(['projects.id', 'projects.name', 'organizations.name'])
            .orderBy('count', 'desc')
            .limit(10)
            .execute();

        // Logs in last hour and last day for growth calculation
        const logsLastHour = await db
            .selectFrom('logs')
            .select(sql<number>`COUNT(*)::int`.as('count'))
            .where('time', '>=', oneHourAgo)
            .executeTakeFirstOrThrow();

        const logsLastDay = await db
            .selectFrom('logs')
            .select(sql<number>`COUNT(*)::int`.as('count'))
            .where('time', '>=', oneDayAgo)
            .executeTakeFirstOrThrow();

        return {
            total: totalLogs.count,
            perDay: logsPerDay.rows.map((row) => ({
                date: row.date,
                count: row.count,
            })),
            topOrganizations: topOrgs.map((org) => ({
                organizationId: org.organizationId,
                organizationName: org.organizationName,
                count: org.count,
            })),
            topProjects: topProjects.map((proj) => ({
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
     */
    async getPerformanceStats(): Promise<PerformanceStats> {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        // Logs ingested in last hour
        const logsLastHour = await db
            .selectFrom('logs')
            .select(sql<number>`COUNT(*)::int`.as('count'))
            .where('created_at', '>=', oneHourAgo)
            .executeTakeFirstOrThrow();

        const throughput = logsLastHour.count / 3600; // logs per second

        // Get logs table size
        const logsSize = await db.executeQuery<{ size: string }>(
            sql`SELECT pg_size_pretty(pg_total_relation_size('logs')) AS size`.compile(db)
        );

        // Calculate average latency from recent ingestion (time between log generation and ingestion)
        // This is a simplified metric - for production, use dedicated metrics service like Prometheus
        const avgLatencyResult = await db.executeQuery<{ avg_latency: number }>(
            sql`
                SELECT AVG(EXTRACT(EPOCH FROM (NOW() - time)) * 1000)::int AS avg_latency
                FROM logs
                WHERE time > NOW() - INTERVAL '5 minutes'
                AND time <= NOW()
            `.compile(db)
        );
        const avgLatency = avgLatencyResult.rows[0]?.avg_latency || 0;

        return {
            ingestion: {
                throughput,
                avgLatency,
            },
            storage: {
                logsSize: logsSize.rows[0]?.size || '0 bytes',
                compressionRatio: await this.getCompressionRatio(),
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
                            config->>'schedule_interval' AS schedule_interval
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

        // PERFORMANCE: Single query for logs counts (last 30 days only to avoid full scan)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [logsCounts, apiKeysCounts, alertRulesCounts] = await Promise.all([
            db
                .selectFrom('logs')
                .select(['project_id', sql<number>`COUNT(*)::int`.as('count')])
                .where('project_id', 'in', projectIds)
                .where('time', '>=', thirtyDaysAgo)
                .groupBy('project_id')
                .execute(),
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

        // Get logs count
        const logsCount = await db
            .selectFrom('logs')
            .select(({ fn }) => [fn.count<number>('id').as('count')])
            .where('project_id', '=', projectId)
            .executeTakeFirst();

        // Get recent logs timestamp
        const recentLog = await db
            .selectFrom('logs')
            .select('time')
            .where('project_id', '=', projectId)
            .orderBy('time', 'desc')
            .limit(1)
            .executeTakeFirst();

        return {
            ...project,
            logsCount: Number(logsCount?.count || 0),
            apiKeys,
            alertRules,
            sigmaRules,
            lastLogTime: recentLog?.time || null,
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
}

export const adminService = new AdminService();

export type { CacheStats };
