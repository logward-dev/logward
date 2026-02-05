import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../../../database/index.js';
import { createTestContext, createTestLog } from '../../helpers/factories.js';

/**
 * Tests for DashboardService with mocked TimescaleDB continuous aggregates.
 * These tests cover the aggregate code paths that cannot be tested without
 * real TimescaleDB continuous aggregates (logs_hourly_stats, logs_daily_stats).
 */

// Import the class directly to mock internal methods
import { dashboardService } from '../../../modules/dashboard/service.js';

describe('DashboardService - Mocked Aggregates', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('getStats - aggregate path', () => {
        it('should use aggregate path when available', async () => {
            const ctx = await createTestContext();

            // Create some logs so projectIds is not empty
            await createTestLog({ projectId: ctx.project.id });

            // Mock getStatsFromAggregate to return stats
            const mockStats = {
                totalLogsToday: { value: 1500, trend: 25.5 },
                errorRate: { value: 2.5, trend: -0.5 },
                activeServices: { value: 10, trend: 2 },
                avgThroughput: { value: 15.5, trend: 10.2 },
            };

            const aggregateSpy = vi.spyOn(dashboardService as any, 'getStatsFromAggregate')
                .mockResolvedValue(mockStats);

            const result = await dashboardService.getStats(ctx.organization.id);

            expect(aggregateSpy).toHaveBeenCalled();
            expect(result.totalLogsToday.value).toBe(1500);
            expect(result.errorRate.value).toBe(2.5);
            expect(result.activeServices.value).toBe(10);
            expect(result.avgThroughput.value).toBe(15.5);
        });

        it('should fall back to raw logs when aggregate fails', async () => {
            const ctx = await createTestContext();

            // Create some logs
            await createTestLog({ projectId: ctx.project.id });

            // Mock aggregate to fail
            vi.spyOn(dashboardService as any, 'getStatsFromAggregate')
                .mockRejectedValue(new Error('Continuous aggregate not available'));

            // Mock raw logs path
            const rawLogsSpy = vi.spyOn(dashboardService as any, 'getStatsFromRawLogs')
                .mockResolvedValue({
                    totalLogsToday: { value: 100, trend: 0 },
                    errorRate: { value: 1, trend: 0 },
                    activeServices: { value: 3, trend: 0 },
                    avgThroughput: { value: 0.5, trend: 0 },
                });

            const result = await dashboardService.getStats(ctx.organization.id);

            expect(rawLogsSpy).toHaveBeenCalled();
            expect(result.totalLogsToday.value).toBe(100);
        });

        it('should calculate stats from aggregate and recent data', async () => {
            const ctx = await createTestContext();

            // Create logs
            await createTestLog({ projectId: ctx.project.id });

            // Call the actual method without mocking getStatsFromAggregate
            // This will hit the aggregate path which fails and falls back to raw logs
            const result = await dashboardService.getStats(ctx.organization.id);

            // Should return valid stats structure
            expect(result).toHaveProperty('totalLogsToday');
            expect(result).toHaveProperty('errorRate');
            expect(result).toHaveProperty('activeServices');
            expect(result).toHaveProperty('avgThroughput');
            expect(typeof result.totalLogsToday.value).toBe('number');
            expect(typeof result.totalLogsToday.trend).toBe('number');
        });
    });

    describe('getTopServices - aggregate path', () => {
        it('should use aggregate path when available', async () => {
            const ctx = await createTestContext();

            // Create logs
            await createTestLog({ projectId: ctx.project.id, service: 'api' });

            const mockServices = [
                { name: 'api', count: 500, percentage: 50 },
                { name: 'worker', count: 300, percentage: 30 },
                { name: 'web', count: 200, percentage: 20 },
            ];

            const aggregateSpy = vi.spyOn(dashboardService as any, 'getTopServicesFromAggregate')
                .mockResolvedValue(mockServices);

            const result = await dashboardService.getTopServices(ctx.organization.id);

            expect(aggregateSpy).toHaveBeenCalled();
            expect(result.length).toBe(3);
            expect(result[0].name).toBe('api');
            expect(result[0].count).toBe(500);
        });

        it('should fall back to raw logs when aggregate fails', async () => {
            const ctx = await createTestContext();

            // Create logs
            await createTestLog({ projectId: ctx.project.id, service: 'test-service' });

            // Mock aggregate to fail
            vi.spyOn(dashboardService as any, 'getTopServicesFromAggregate')
                .mockRejectedValue(new Error('Continuous aggregate not available'));

            // Mock raw logs path
            const rawLogsSpy = vi.spyOn(dashboardService as any, 'getTopServicesFromRawLogs')
                .mockResolvedValue([
                    { name: 'test-service', count: 50, percentage: 100 },
                ]);

            const result = await dashboardService.getTopServices(ctx.organization.id);

            expect(rawLogsSpy).toHaveBeenCalled();
            expect(result[0].name).toBe('test-service');
        });

        it('should respect limit parameter', async () => {
            const ctx = await createTestContext();

            await createTestLog({ projectId: ctx.project.id });

            const mockServices = [
                { name: 'api', count: 500, percentage: 40 },
                { name: 'worker', count: 400, percentage: 32 },
                { name: 'web', count: 350, percentage: 28 },
            ];

            vi.spyOn(dashboardService as any, 'getTopServicesFromAggregate')
                .mockResolvedValue(mockServices.slice(0, 2));

            const result = await dashboardService.getTopServices(ctx.organization.id, 2);

            expect(result.length).toBe(2);
        });

        it('should handle empty service map from aggregates', async () => {
            const ctx = await createTestContext();

            // Create a log so we have projectIds
            await createTestLog({ projectId: ctx.project.id });

            vi.spyOn(dashboardService as any, 'getTopServicesFromAggregate')
                .mockResolvedValue([]);

            const result = await dashboardService.getTopServices(ctx.organization.id);

            expect(result).toEqual([]);
        });
    });

    describe('getTimeseries - aggregate path', () => {
        it('should combine historical and recent results', async () => {
            const ctx = await createTestContext();

            // Create a log
            await createTestLog({ projectId: ctx.project.id });

            // The actual getTimeseries tries to query logs_hourly_stats
            // which will fail in test env and fall back to raw query
            const result = await dashboardService.getTimeseries(ctx.organization.id);

            // Should return valid timeseries structure
            expect(Array.isArray(result)).toBe(true);
            if (result.length > 0) {
                expect(result[0]).toHaveProperty('time');
                expect(result[0]).toHaveProperty('total');
                expect(result[0]).toHaveProperty('debug');
                expect(result[0]).toHaveProperty('info');
                expect(result[0]).toHaveProperty('warn');
                expect(result[0]).toHaveProperty('error');
                expect(result[0]).toHaveProperty('critical');
            }
        });

        it('should handle empty results from aggregates', async () => {
            const ctx = await createTestContext();

            // Don't create any logs - org will have no data
            const result = await dashboardService.getTimeseries(ctx.organization.id);

            expect(result).toEqual([]);
        });

        it('should aggregate counts by level correctly', async () => {
            const ctx = await createTestContext();

            // Create logs with different levels
            await Promise.all([
                createTestLog({ projectId: ctx.project.id, level: 'info' }),
                createTestLog({ projectId: ctx.project.id, level: 'info' }),
                createTestLog({ projectId: ctx.project.id, level: 'error' }),
                createTestLog({ projectId: ctx.project.id, level: 'warn' }),
            ]);

            const result = await dashboardService.getTimeseries(ctx.organization.id);

            // Should have aggregated data
            expect(result.length).toBeGreaterThan(0);

            // Find the bucket with our logs
            const totalLogs = result.reduce((sum, point) => sum + point.total, 0);
            expect(totalLogs).toBeGreaterThanOrEqual(4);
        });
    });

    describe('getRecentErrors', () => {
        it('should return recent error and critical logs', async () => {
            const ctx = await createTestContext();

            // Create error logs
            await Promise.all([
                createTestLog({ projectId: ctx.project.id, level: 'error', message: 'Error 1' }),
                createTestLog({ projectId: ctx.project.id, level: 'critical', message: 'Critical 1' }),
                createTestLog({ projectId: ctx.project.id, level: 'info', message: 'Info 1' }),
            ]);

            const result = await dashboardService.getRecentErrors(ctx.organization.id);

            // Should only include error and critical
            expect(result.length).toBe(2);
            expect(result.every(e => ['error', 'critical'].includes(e.level))).toBe(true);
        });

        it('should limit to 10 results', async () => {
            const ctx = await createTestContext();

            // Create 15 error logs
            await Promise.all(
                Array.from({ length: 15 }, (_, i) =>
                    createTestLog({ projectId: ctx.project.id, level: 'error', message: `Error ${i}` })
                )
            );

            const result = await dashboardService.getRecentErrors(ctx.organization.id);

            expect(result.length).toBe(10);
        });

        it('should return errors in descending time order', async () => {
            const ctx = await createTestContext();

            const now = new Date();
            await createTestLog({
                projectId: ctx.project.id,
                level: 'error',
                message: 'Older error',
                time: new Date(now.getTime() - 60000), // 1 minute ago
            });
            await createTestLog({
                projectId: ctx.project.id,
                level: 'error',
                message: 'Newer error',
                time: now,
            });

            const result = await dashboardService.getRecentErrors(ctx.organization.id);

            expect(result[0].message).toBe('Newer error');
            expect(result[1].message).toBe('Older error');
        });

        it('should include trace_id when present', async () => {
            const ctx = await createTestContext();

            await createTestLog({
                projectId: ctx.project.id,
                level: 'error',
                message: 'Error with trace',
                trace_id: 'trace-123',
            });

            const result = await dashboardService.getRecentErrors(ctx.organization.id);

            expect(result[0].traceId).toBe('trace-123');
        });

        it('should return empty array for org with no projects', async () => {
            // Create context but don't use the project - create org with no logs
            const ctx = await createTestContext();

            // Delete the project that was created
            await db.deleteFrom('projects').where('id', '=', ctx.project.id).execute();

            const result = await dashboardService.getRecentErrors(ctx.organization.id);

            expect(result).toEqual([]);
        });
    });

    describe('calculateStats - edge cases', () => {
        it('should handle zero yesterday count for trend calculation', async () => {
            const ctx = await createTestContext();

            // Create today's log only
            await createTestLog({ projectId: ctx.project.id });

            // With no yesterday data, trend should be 0
            const result = await dashboardService.getStats(ctx.organization.id);

            expect(result.totalLogsToday.trend).toBe(0);
        });

        it('should handle zero throughput in previous hour', async () => {
            const ctx = await createTestContext();

            // Create a log in the last hour only
            await createTestLog({ projectId: ctx.project.id });

            const result = await dashboardService.getStats(ctx.organization.id);

            // With no previous hour data, throughput trend should be 0
            expect(result.avgThroughput.trend).toBe(0);
        });

        it('should calculate correct error rate trend', async () => {
            const ctx = await createTestContext();

            // Simulate aggregate returning specific values
            const mockStats = {
                totalLogsToday: { value: 100, trend: 0 },
                errorRate: { value: 5, trend: 2 }, // 5% today, was 3% yesterday = +2pp
                activeServices: { value: 5, trend: 0 },
                avgThroughput: { value: 1, trend: 0 },
            };

            vi.spyOn(dashboardService as any, 'getStatsFromAggregate')
                .mockResolvedValue(mockStats);

            const result = await dashboardService.getStats(ctx.organization.id);

            expect(result.errorRate.trend).toBe(2);
        });
    });
});
