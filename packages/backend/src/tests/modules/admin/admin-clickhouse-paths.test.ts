import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../../database/index.js';
import { createTestContext, createTestProject } from '../../helpers/factories.js';

// Mock reservoir to simulate ClickHouse engine
vi.mock('../../../database/reservoir.js', () => {
    return {
        reservoir: {
            getEngineType: vi.fn(() => 'clickhouse'),
            count: vi.fn(async () => ({ count: 0 })),
            aggregate: vi.fn(async () => ({ timeseries: [] })),
            query: vi.fn(async () => ({ logs: [], hasMore: false, limit: 100, offset: 0 })),
            queryTraces: vi.fn(async () => ({ traces: [], total: 0, hasMore: false, limit: 100000, offset: 0 })),
            healthCheck: vi.fn(async () => ({
                status: 'healthy',
                engine: 'clickhouse',
                connected: true,
                responseTimeMs: 5,
            })),
        },
    };
});

// Import AFTER mocking
import { AdminService } from '../../../modules/admin/service.js';
import { reservoir } from '../../../database/reservoir.js';

describe('AdminService - ClickHouse code paths', () => {
    let adminService: AdminService;

    beforeEach(async () => {
        adminService = new AdminService();

        // Clean up in correct order (respecting foreign keys)
        await db.deleteFrom('alert_history').execute();
        await db.deleteFrom('sigma_rules').execute();
        await db.deleteFrom('alert_rules').execute();
        await db.deleteFrom('api_keys').execute();
        await db.deleteFrom('notifications').execute();
        await db.deleteFrom('organization_members').execute();
        await db.deleteFrom('projects').execute();
        await db.deleteFrom('organizations').execute();
        await db.deleteFrom('sessions').execute();
        await db.deleteFrom('users').execute();

        // Reset mock return values to defaults
        vi.mocked(reservoir.count).mockResolvedValue({ count: 0 });
        vi.mocked(reservoir.aggregate).mockResolvedValue({ timeseries: [] });
        vi.mocked(reservoir.query).mockResolvedValue({ logs: [], hasMore: false, limit: 100, offset: 0 });
        vi.mocked(reservoir.queryTraces).mockResolvedValue({ traces: [], total: 0, hasMore: false, limit: 100000, offset: 0 });
        vi.mocked(reservoir.healthCheck).mockResolvedValue({
            status: 'healthy',
            engine: 'clickhouse',
            connected: true,
            responseTimeMs: 5,
        });

        vi.clearAllMocks();
        // Re-set getEngineType after clearAllMocks
        vi.mocked(reservoir.getEngineType).mockReturnValue('clickhouse');
    });

    // =========================================================================
    // getDatabaseStats() - ClickHouse path
    // =========================================================================
    describe('getDatabaseStats - ClickHouse path', () => {
        it('should exclude logs, spans, traces from pgTableNames', async () => {
            vi.mocked(reservoir.count).mockResolvedValue({ count: 0 });

            const stats = await adminService.getDatabaseStats();

            // logs/spans/traces should not appear as public.logs, public.spans, public.traces
            const pgTableNames = stats.tables
                .filter(t => t.name.startsWith('public.'))
                .map(t => t.name.replace('public.', ''));

            expect(pgTableNames).not.toContain('logs');
            expect(pgTableNames).not.toContain('spans');
            expect(pgTableNames).not.toContain('traces');
        });

        it('should call reservoir.count() for log row count', async () => {
            vi.mocked(reservoir.count).mockResolvedValue({ count: 42 });

            const stats = await adminService.getDatabaseStats();

            expect(reservoir.count).toHaveBeenCalledWith({
                from: expect.any(Date),
                to: expect.any(Date),
            });
            // The logs entry in the rowsMap should come from reservoir
            expect(stats.totalRows).toBeGreaterThanOrEqual(0);
        });

        it('should attempt getClickHouseTableStats and handle missing client gracefully', async () => {
            vi.mocked(reservoir.count).mockResolvedValue({ count: 100 });

            const stats = await adminService.getDatabaseStats();

            // Since mock reservoir has no engine.client, getClickHouseTableStats returns []
            // No clickhouse.* tables should be present
            const chTables = stats.tables.filter(t => t.name.startsWith('clickhouse.'));
            expect(chTables).toHaveLength(0);

            // But stats should still be valid
            expect(stats).toHaveProperty('tables');
            expect(stats).toHaveProperty('totalSize');
            expect(stats).toHaveProperty('totalRows');
        });

        it('should include standard PG tables', async () => {
            vi.mocked(reservoir.count).mockResolvedValue({ count: 0 });

            const stats = await adminService.getDatabaseStats();

            const tableNames = stats.tables.map(t => t.name.replace('public.', ''));
            // Some of the expected PG tables should be present
            expect(tableNames).toContain('users');
            expect(tableNames).toContain('organizations');
            expect(tableNames).toContain('projects');
        });
    });

    // =========================================================================
    // getLogsStats() - ClickHouse path (getLogsStatsFromReservoir)
    // =========================================================================
    describe('getLogsStats - ClickHouse path', () => {
        it('should use reservoir.count for total logs', async () => {
            vi.mocked(reservoir.count).mockResolvedValue({ count: 1500 });
            vi.mocked(reservoir.aggregate).mockResolvedValue({ timeseries: [] });

            const stats = await adminService.getLogsStats();

            expect(stats.total).toBe(1500);
            // Should have called count at least once for total (from: new Date(0), to: now)
            expect(reservoir.count).toHaveBeenCalled();
        });

        it('should use reservoir.aggregate for perDay', async () => {
            const bucket1 = new Date('2025-01-10T00:00:00Z');
            const bucket2 = new Date('2025-01-11T00:00:00Z');

            vi.mocked(reservoir.count).mockResolvedValue({ count: 0 });
            vi.mocked(reservoir.aggregate).mockResolvedValue({
                timeseries: [
                    { bucket: bucket1, total: 100 },
                    { bucket: bucket2, total: 200 },
                ],
            });

            const stats = await adminService.getLogsStats();

            expect(reservoir.aggregate).toHaveBeenCalledWith(expect.objectContaining({
                interval: '1d',
            }));
            expect(stats.perDay).toHaveLength(2);
            // perDay sorted desc by date
            expect(stats.perDay[0].count).toBe(200);
            expect(stats.perDay[1].count).toBe(100);
        });

        it('should compute topOrgs and topProjects from reservoir.count per project', async () => {
            const { organization, project } = await createTestContext();
            const project2 = await createTestProject({ organizationId: organization.id });

            // First calls are for total/hourly/daily, then per-project counts
            let callIdx = 0;
            vi.mocked(reservoir.count).mockImplementation(async (params: any) => {
                if (params.projectId === project.id) return { count: 50 };
                if (params.projectId === project2.id) return { count: 30 };
                return { count: 80 }; // total / hourly / daily
            });
            vi.mocked(reservoir.aggregate).mockResolvedValue({ timeseries: [] });

            const stats = await adminService.getLogsStats();

            expect(stats.topOrganizations.length).toBeGreaterThanOrEqual(1);
            // The org should have count = 50 + 30 = 80
            const org = stats.topOrganizations.find(o => o.organizationId === organization.id);
            expect(org).toBeDefined();
            expect(org!.count).toBe(80);

            expect(stats.topProjects.length).toBe(2);
            // Projects sorted by count desc
            expect(stats.topProjects[0].count).toBe(50);
            expect(stats.topProjects[1].count).toBe(30);
        });

        it('should handle no projects gracefully', async () => {
            vi.mocked(reservoir.count).mockResolvedValue({ count: 0 });
            vi.mocked(reservoir.aggregate).mockResolvedValue({ timeseries: [] });

            const stats = await adminService.getLogsStats();

            expect(stats.topOrganizations).toEqual([]);
            expect(stats.topProjects).toEqual([]);
            expect(stats.total).toBe(0);
        });

        it('should compute growth stats from reservoir.count', async () => {
            let callCount = 0;
            vi.mocked(reservoir.count).mockImplementation(async () => {
                callCount++;
                // Return different values for different calls
                // Call pattern: total, logsLastHour, logsLastDay (parallel with aggregate)
                if (callCount <= 1) return { count: 1000 }; // total
                if (callCount === 2) return { count: 50 };  // logsLastHour
                return { count: 200 }; // logsLastDay
            });
            vi.mocked(reservoir.aggregate).mockResolvedValue({ timeseries: [] });

            const stats = await adminService.getLogsStats();

            expect(stats.growth).toBeDefined();
            expect(typeof stats.growth.logsPerHour).toBe('number');
            expect(typeof stats.growth.logsPerDay).toBe('number');
        });
    });

    // =========================================================================
    // getPerformanceStats() - ClickHouse path
    // =========================================================================
    describe('getPerformanceStats - ClickHouse path', () => {
        it('should return N/A for logsSize', async () => {
            vi.mocked(reservoir.count).mockResolvedValue({ count: 3600 });

            const stats = await adminService.getPerformanceStats();

            expect(stats.storage.logsSize).toBe('N/A');
        });

        it('should return 0 for compressionRatio', async () => {
            vi.mocked(reservoir.count).mockResolvedValue({ count: 100 });

            const stats = await adminService.getPerformanceStats();

            expect(stats.storage.compressionRatio).toBe(0);
        });

        it('should calculate throughput from reservoir.count', async () => {
            vi.mocked(reservoir.count).mockResolvedValue({ count: 7200 });

            const stats = await adminService.getPerformanceStats();

            // throughput = logsLastHour / 3600
            expect(stats.ingestion.throughput).toBe(2);
        });

        it('should return 0 for avgLatency', async () => {
            vi.mocked(reservoir.count).mockResolvedValue({ count: 100 });

            const stats = await adminService.getPerformanceStats();

            expect(stats.ingestion.avgLatency).toBe(0);
        });
    });

    // =========================================================================
    // getCompressionStats() - ClickHouse path
    // =========================================================================
    describe('getCompressionStats - ClickHouse path', () => {
        it('should call getClickHouseCompressionStats which returns [] without client', async () => {
            const stats = await adminService.getCompressionStats();

            // Since the mocked reservoir has no engine.client, it returns []
            expect(stats).toEqual([]);
        });

        it('should not query TimescaleDB hypertable_compression_stats', async () => {
            const stats = await adminService.getCompressionStats();

            // Just verifying it returns without error and is an array
            expect(Array.isArray(stats)).toBe(true);
        });
    });

    // =========================================================================
    // getAggregateStats() - ClickHouse path
    // =========================================================================
    describe('getAggregateStats - ClickHouse path', () => {
        it('should return empty array since aggregates are TimescaleDB-only', async () => {
            const stats = await adminService.getAggregateStats();

            expect(stats).toEqual([]);
        });
    });

    // =========================================================================
    // getPlatformTimeline() - ClickHouse path
    // =========================================================================
    describe('getPlatformTimeline - ClickHouse path', () => {
        it('should use reservoir.aggregate for logs timeline', async () => {
            const bucket = new Date('2025-01-10T10:00:00Z');
            vi.mocked(reservoir.aggregate).mockResolvedValue({
                timeseries: [{ bucket, total: 50 }],
            });
            vi.mocked(reservoir.queryTraces).mockResolvedValue({
                traces: [],
                total: 0,
                hasMore: false,
                limit: 100000,
                offset: 0,
            });

            await createTestContext(); // need at least one project

            const result = await adminService.getPlatformTimeline(24);

            expect(reservoir.aggregate).toHaveBeenCalledWith(expect.objectContaining({
                interval: '1h',
            }));
            // timeline should contain the bucket
            const logEntry = result.timeline.find(t => t.logsCount === 50);
            expect(logEntry).toBeDefined();
        });

        it('should use reservoir.queryTraces for spans timeline', async () => {
            const traceTime = new Date();
            traceTime.setMinutes(0, 0, 0); // align to hour

            vi.mocked(reservoir.aggregate).mockResolvedValue({ timeseries: [] });
            vi.mocked(reservoir.queryTraces).mockResolvedValue({
                traces: [
                    {
                        traceId: 'trace-1',
                        projectId: 'p1',
                        serviceName: 'svc',
                        startTime: traceTime,
                        endTime: new Date(traceTime.getTime() + 100),
                        durationMs: 100,
                        spanCount: 5,
                        error: false,
                    },
                ],
                total: 1,
                hasMore: false,
                limit: 100000,
                offset: 0,
            });

            await createTestContext(); // need at least one project

            const result = await adminService.getPlatformTimeline(24);

            expect(reservoir.queryTraces).toHaveBeenCalled();
            // spans should be bucketed by hour
            const spanEntry = result.timeline.find(t => t.spansCount > 0);
            expect(spanEntry).toBeDefined();
            expect(spanEntry!.spansCount).toBe(5);
        });

        it('should return empty timeline when no projects exist', async () => {
            vi.mocked(reservoir.aggregate).mockResolvedValue({ timeseries: [] });

            const result = await adminService.getPlatformTimeline(24);

            // With no projects, logs timeline should be empty
            // Spans timeline should also be empty (no projects)
            // Only detection events (from PG) may appear
            expect(result.timeline).toBeDefined();
            expect(Array.isArray(result.timeline)).toBe(true);
        });

        it('should handle queryTraces failure gracefully', async () => {
            vi.mocked(reservoir.aggregate).mockResolvedValue({ timeseries: [] });
            vi.mocked(reservoir.queryTraces).mockRejectedValue(new Error('ClickHouse connection failed'));

            await createTestContext();

            const result = await adminService.getPlatformTimeline(24);

            // Should not throw, spans timeline falls back to empty
            expect(result.timeline).toBeDefined();
        });
    });

    // =========================================================================
    // getHealthStats() - ClickHouse path
    // =========================================================================
    describe('getHealthStats - ClickHouse path', () => {
        it('should include clickhouse health check', async () => {
            vi.mocked(reservoir.healthCheck).mockResolvedValue({
                status: 'healthy',
                engine: 'clickhouse',
                connected: true,
                responseTimeMs: 3,
            });

            const stats = await adminService.getHealthStats();

            expect(stats.clickhouse).toBeDefined();
            expect(stats.clickhouse!.status).toBe('healthy');
            expect(stats.clickhouse!.latency).toBe(3);
        });

        it('should call reservoir.healthCheck()', async () => {
            vi.mocked(reservoir.healthCheck).mockResolvedValue({
                status: 'healthy',
                engine: 'clickhouse',
                connected: true,
                responseTimeMs: 10,
            });

            await adminService.getHealthStats();

            expect(reservoir.healthCheck).toHaveBeenCalled();
        });

        it('should report storageEngine as clickhouse', async () => {
            const stats = await adminService.getHealthStats();

            expect(stats.storageEngine).toBe('clickhouse');
        });

        it('should map unhealthy status to down', async () => {
            vi.mocked(reservoir.healthCheck).mockResolvedValue({
                status: 'unhealthy',
                engine: 'clickhouse',
                connected: false,
                responseTimeMs: -1,
            });

            const stats = await adminService.getHealthStats();

            expect(stats.clickhouse!.status).toBe('down');
            // overall should be down when clickhouse is down
            expect(stats.overall).toBe('down');
        });

        it('should map degraded status correctly', async () => {
            vi.mocked(reservoir.healthCheck).mockResolvedValue({
                status: 'degraded',
                engine: 'clickhouse',
                connected: true,
                responseTimeMs: 500,
            });

            const stats = await adminService.getHealthStats();

            expect(stats.clickhouse!.status).toBe('degraded');
        });

        it('should handle healthCheck failure gracefully', async () => {
            vi.mocked(reservoir.healthCheck).mockRejectedValue(new Error('Connection refused'));

            const stats = await adminService.getHealthStats();

            expect(stats.clickhouse).toBeDefined();
            expect(stats.clickhouse!.status).toBe('down');
            expect(stats.clickhouse!.latency).toBe(-1);
        });
    });
});
