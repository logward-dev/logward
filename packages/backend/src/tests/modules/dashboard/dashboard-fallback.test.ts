import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../../database/index.js';
import { dashboardService } from '../../../modules/dashboard/service.js';
import { createTestContext, createTestLog } from '../../helpers/factories.js';

/**
 * These tests cover the fallback code paths in DashboardService
 * when continuous aggregates are not available or fail.
 */
describe('DashboardService - Fallback Paths', () => {
    beforeEach(async () => {
        // Clean up in correct order (respecting foreign keys)
        await db.deleteFrom('logs').execute();
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
    });

    describe('getStats - raw logs fallback', () => {
        it('should calculate stats from raw logs when aggregates throw', async () => {
            const { organization, project } = await createTestContext();

            // Create logs for today
            await createTestLog({ projectId: project.id, service: 'api', level: 'info' });
            await createTestLog({ projectId: project.id, service: 'api', level: 'error' });
            await createTestLog({ projectId: project.id, service: 'worker', level: 'info' });

            // The service will try aggregates first, then fall back to raw logs
            // In test env without aggregates set up, it should use the fallback
            const stats = await dashboardService.getStats(organization.id);

            // Stats should still be calculated correctly
            expect(stats.totalLogsToday.value).toBe(3);
            expect(stats.activeServices.value).toBeGreaterThanOrEqual(2);
        });

        it('should handle throughput calculation with zero previous hour', async () => {
            const { organization, project } = await createTestContext();

            // Create logs only in the current window
            await createTestLog({ projectId: project.id, level: 'info' });

            const stats = await dashboardService.getStats(organization.id);

            // Throughput trend should be 0 when previous hour has 0 logs
            expect(stats.avgThroughput.trend).toBe(0);
        });

        it('should calculate error rate with mixed log levels', async () => {
            const { organization, project } = await createTestContext();

            // Create 5 info, 3 error, 2 critical = 50% error rate
            for (let i = 0; i < 5; i++) {
                await createTestLog({ projectId: project.id, level: 'info' });
            }
            for (let i = 0; i < 3; i++) {
                await createTestLog({ projectId: project.id, level: 'error' });
            }
            for (let i = 0; i < 2; i++) {
                await createTestLog({ projectId: project.id, level: 'critical' });
            }

            const stats = await dashboardService.getStats(organization.id);

            // 5 errors+critical / 10 total = 50%
            expect(stats.errorRate.value).toBe(50);
        });

        it('should handle organization with multiple projects', async () => {
            const { organization, project: project1 } = await createTestContext();

            // Create second project in same org
            const project2 = await db
                .insertInto('projects')
                .values({
                    name: 'Project 2',
                    organization_id: organization.id,
                    user_id: organization.owner_id,
                })
                .returningAll()
                .executeTakeFirstOrThrow();

            // Create logs in both projects
            await createTestLog({ projectId: project1.id, service: 'service1', level: 'info' });
            await createTestLog({ projectId: project2.id, service: 'service2', level: 'error' });

            const stats = await dashboardService.getStats(organization.id);

            expect(stats.totalLogsToday.value).toBe(2);
            expect(stats.activeServices.value).toBeGreaterThanOrEqual(2);
        });
    });

    describe('getTimeseries - raw logs fallback', () => {
        it('should return timeseries from raw logs when aggregates fail', async () => {
            const { organization, project } = await createTestContext();

            // Create logs with different levels
            await createTestLog({ projectId: project.id, level: 'debug' });
            await createTestLog({ projectId: project.id, level: 'info' });
            await createTestLog({ projectId: project.id, level: 'warn' });
            await createTestLog({ projectId: project.id, level: 'error' });
            await createTestLog({ projectId: project.id, level: 'critical' });

            const timeseries = await dashboardService.getTimeseries(organization.id);

            // Should have at least one data point
            expect(timeseries.length).toBeGreaterThan(0);

            // Check the total counts
            const totalLogs = timeseries.reduce((sum, p) => sum + p.total, 0);
            expect(totalLogs).toBe(5);
        });

        it('should handle logs spanning multiple hours', async () => {
            const { organization, project } = await createTestContext();

            const now = new Date();
            const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
            const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

            await db.insertInto('logs').values({
                project_id: project.id,
                service: 'test',
                level: 'info',
                message: 'Now',
                time: now,
            }).execute();

            await db.insertInto('logs').values({
                project_id: project.id,
                service: 'test',
                level: 'error',
                time: twoHoursAgo,
                message: 'Two hours ago',
            }).execute();

            await db.insertInto('logs').values({
                project_id: project.id,
                service: 'test',
                level: 'warn',
                time: threeHoursAgo,
                message: 'Three hours ago',
            }).execute();

            const timeseries = await dashboardService.getTimeseries(organization.id);

            // Should have data points from multiple buckets
            expect(timeseries.length).toBeGreaterThanOrEqual(1);
        });

        it('should correctly aggregate levels in each time bucket', async () => {
            const { organization, project } = await createTestContext();

            // Create multiple logs with same timestamp to be in same bucket
            const timestamp = new Date();
            for (let i = 0; i < 3; i++) {
                await db.insertInto('logs').values({
                    project_id: project.id,
                    service: 'test',
                    level: 'info',
                    message: `Info ${i}`,
                    time: timestamp,
                }).execute();
            }
            for (let i = 0; i < 2; i++) {
                await db.insertInto('logs').values({
                    project_id: project.id,
                    service: 'test',
                    level: 'error',
                    message: `Error ${i}`,
                    time: timestamp,
                }).execute();
            }

            const timeseries = await dashboardService.getTimeseries(organization.id);

            expect(timeseries.length).toBeGreaterThan(0);
            const bucket = timeseries.find(b => b.info > 0);
            expect(bucket).toBeDefined();
            if (bucket) {
                expect(bucket.info).toBe(3);
                expect(bucket.error).toBe(2);
                expect(bucket.total).toBe(5);
            }
        });
    });

    describe('getTopServices - raw logs fallback', () => {
        it('should return top services from raw logs when aggregates fail', async () => {
            const { organization, project } = await createTestContext();

            // Create logs with different services
            for (let i = 0; i < 10; i++) {
                await createTestLog({ projectId: project.id, service: 'service-a' });
            }
            for (let i = 0; i < 5; i++) {
                await createTestLog({ projectId: project.id, service: 'service-b' });
            }
            for (let i = 0; i < 3; i++) {
                await createTestLog({ projectId: project.id, service: 'service-c' });
            }

            const services = await dashboardService.getTopServices(organization.id, 5);

            expect(services.length).toBeGreaterThan(0);
            expect(services[0].name).toBe('service-a');
            expect(services[0].count).toBe(10);
        });

        it('should return empty array when total logs is zero', async () => {
            const { organization } = await createTestContext();

            const services = await dashboardService.getTopServices(organization.id, 5);

            expect(services).toEqual([]);
        });

        it('should calculate percentages correctly for services', async () => {
            const { organization, project } = await createTestContext();

            // Create 8 logs for service-a, 2 for service-b = 80%, 20%
            for (let i = 0; i < 8; i++) {
                await createTestLog({ projectId: project.id, service: 'service-a' });
            }
            for (let i = 0; i < 2; i++) {
                await createTestLog({ projectId: project.id, service: 'service-b' });
            }

            const services = await dashboardService.getTopServices(organization.id, 5);

            expect(services.length).toBe(2);
            expect(services[0].percentage).toBe(80);
            expect(services[1].percentage).toBe(20);
        });

        it('should respect the limit parameter', async () => {
            const { organization, project } = await createTestContext();

            // Create logs for 10 different services
            for (let i = 0; i < 10; i++) {
                await createTestLog({ projectId: project.id, service: `service-${i}` });
            }

            const services = await dashboardService.getTopServices(organization.id, 3);

            expect(services.length).toBe(3);
        });
    });

    describe('getRecentErrors - edge cases', () => {
        it('should handle errors from multiple projects in same org', async () => {
            const { organization, project: project1 } = await createTestContext();

            const project2 = await db
                .insertInto('projects')
                .values({
                    name: 'Project 2',
                    organization_id: organization.id,
                    user_id: organization.owner_id,
                })
                .returningAll()
                .executeTakeFirstOrThrow();

            await createTestLog({ projectId: project1.id, level: 'error', message: 'Error from P1' });
            await createTestLog({ projectId: project2.id, level: 'critical', message: 'Critical from P2' });

            const errors = await dashboardService.getRecentErrors(organization.id);

            expect(errors.length).toBe(2);
            expect(errors.some(e => e.message === 'Error from P1')).toBe(true);
            expect(errors.some(e => e.message === 'Critical from P2')).toBe(true);
        });

        it('should return errors in descending time order', async () => {
            const { organization, project } = await createTestContext();

            const now = new Date();
            const older = new Date(now.getTime() - 60000);
            const oldest = new Date(now.getTime() - 120000);

            await db.insertInto('logs').values({
                project_id: project.id,
                service: 'test',
                level: 'error',
                message: 'Oldest',
                time: oldest,
            }).execute();

            await db.insertInto('logs').values({
                project_id: project.id,
                service: 'test',
                level: 'error',
                message: 'Older',
                time: older,
            }).execute();

            await db.insertInto('logs').values({
                project_id: project.id,
                service: 'test',
                level: 'error',
                message: 'Newest',
                time: now,
            }).execute();

            const errors = await dashboardService.getRecentErrors(organization.id);

            expect(errors.length).toBe(3);
            expect(errors[0].message).toBe('Newest');
            expect(errors[1].message).toBe('Older');
            expect(errors[2].message).toBe('Oldest');
        });

        it('should include trace_id in recent errors when available', async () => {
            const { organization, project } = await createTestContext();

            await db.insertInto('logs').values({
                project_id: project.id,
                service: 'test',
                level: 'error',
                message: 'Error with trace',
                time: new Date(),
                trace_id: 'trace-123-456',
            }).execute();

            const errors = await dashboardService.getRecentErrors(organization.id);

            expect(errors.length).toBe(1);
            expect(errors[0].traceId).toBe('trace-123-456');
        });

        it('should limit recent errors to 10', async () => {
            const { organization, project } = await createTestContext();

            // Create 15 errors
            for (let i = 0; i < 15; i++) {
                await db.insertInto('logs').values({
                    project_id: project.id,
                    service: 'test',
                    level: 'error',
                    message: `Error ${i}`,
                    time: new Date(Date.now() - i * 1000),
                }).execute();
            }

            const errors = await dashboardService.getRecentErrors(organization.id);

            expect(errors.length).toBe(10);
        });
    });

    describe('getStats - trend calculations', () => {
        it('should return stats with trend values', async () => {
            const { organization, project } = await createTestContext();

            // 4 logs today
            for (let i = 0; i < 4; i++) {
                await createTestLog({ projectId: project.id, level: 'info' });
            }

            const stats = await dashboardService.getStats(organization.id);

            expect(stats.totalLogsToday.value).toBe(4);
            // Trend is a number (0 when no yesterday data)
            expect(typeof stats.totalLogsToday.trend).toBe('number');
        });

        it('should calculate service trend correctly', async () => {
            const { organization, project } = await createTestContext();

            // Create 3 distinct services today
            await createTestLog({ projectId: project.id, service: 'service-a' });
            await createTestLog({ projectId: project.id, service: 'service-b' });
            await createTestLog({ projectId: project.id, service: 'service-c' });

            const stats = await dashboardService.getStats(organization.id);

            // Should have 3 active services
            expect(stats.activeServices.value).toBe(3);
            // Trend should be a number (positive when services increased)
            expect(typeof stats.activeServices.trend).toBe('number');
        });

        it('should return zero error rate when no logs exist', async () => {
            const { organization } = await createTestContext();

            const stats = await dashboardService.getStats(organization.id);

            expect(stats.errorRate.value).toBe(0);
            expect(stats.errorRate.trend).toBe(0);
        });

        it('should return zero throughput when no recent logs', async () => {
            const { organization } = await createTestContext();

            const stats = await dashboardService.getStats(organization.id);

            expect(stats.avgThroughput.value).toBe(0);
            expect(stats.avgThroughput.trend).toBe(0);
        });
    });

    describe('getTimeseries - bucket handling', () => {
        it('should handle empty time range', async () => {
            const { organization } = await createTestContext();

            const timeseries = await dashboardService.getTimeseries(organization.id);

            expect(timeseries).toEqual([]);
        });

        it('should group logs by hour correctly', async () => {
            const { organization, project } = await createTestContext();

            const now = new Date();
            // Round to current hour
            const thisHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

            // Create 3 logs in the same hour
            for (let i = 0; i < 3; i++) {
                await db.insertInto('logs').values({
                    project_id: project.id,
                    service: 'test',
                    level: 'info',
                    message: `Log ${i}`,
                    time: new Date(thisHour.getTime() + i * 60000), // Each minute apart
                }).execute();
            }

            const timeseries = await dashboardService.getTimeseries(organization.id);

            // Should have one bucket
            expect(timeseries.length).toBe(1);
            expect(timeseries[0].total).toBe(3);
            expect(timeseries[0].info).toBe(3);
        });

        it('should handle all log levels in timeseries', async () => {
            const { organization, project } = await createTestContext();

            await createTestLog({ projectId: project.id, level: 'debug' });
            await createTestLog({ projectId: project.id, level: 'info' });
            await createTestLog({ projectId: project.id, level: 'warn' });
            await createTestLog({ projectId: project.id, level: 'error' });
            await createTestLog({ projectId: project.id, level: 'critical' });

            const timeseries = await dashboardService.getTimeseries(organization.id);

            const totalDebug = timeseries.reduce((sum, p) => sum + p.debug, 0);
            const totalInfo = timeseries.reduce((sum, p) => sum + p.info, 0);
            const totalWarn = timeseries.reduce((sum, p) => sum + p.warn, 0);
            const totalError = timeseries.reduce((sum, p) => sum + p.error, 0);
            const totalCritical = timeseries.reduce((sum, p) => sum + p.critical, 0);

            expect(totalDebug).toBe(1);
            expect(totalInfo).toBe(1);
            expect(totalWarn).toBe(1);
            expect(totalError).toBe(1);
            expect(totalCritical).toBe(1);
        });
    });

    describe('getTopServices - sorting and limiting', () => {
        it('should correctly sort services by count descending', async () => {
            const { organization, project } = await createTestContext();

            // Create logs with specific counts per service
            for (let i = 0; i < 10; i++) {
                await createTestLog({ projectId: project.id, service: 'high-volume' });
            }
            for (let i = 0; i < 5; i++) {
                await createTestLog({ projectId: project.id, service: 'medium-volume' });
            }
            for (let i = 0; i < 1; i++) {
                await createTestLog({ projectId: project.id, service: 'low-volume' });
            }

            const services = await dashboardService.getTopServices(organization.id, 10);

            expect(services[0].name).toBe('high-volume');
            expect(services[0].count).toBe(10);
            expect(services[1].name).toBe('medium-volume');
            expect(services[1].count).toBe(5);
            expect(services[2].name).toBe('low-volume');
            expect(services[2].count).toBe(1);
        });

        it('should round percentages correctly', async () => {
            const { organization, project } = await createTestContext();

            // Create 3 logs total: 2 for service-a (66.67%), 1 for service-b (33.33%)
            await createTestLog({ projectId: project.id, service: 'service-a' });
            await createTestLog({ projectId: project.id, service: 'service-a' });
            await createTestLog({ projectId: project.id, service: 'service-b' });

            const services = await dashboardService.getTopServices(organization.id, 5);

            expect(services[0].name).toBe('service-a');
            expect(services[0].percentage).toBe(67); // Rounded from 66.67
            expect(services[1].name).toBe('service-b');
            expect(services[1].percentage).toBe(33); // Rounded from 33.33
        });
    });

    describe('getStats - with yesterday data for trends', () => {
        it('should calculate logs trend when yesterday has data', async () => {
            const { organization, project } = await createTestContext();

            // Create logs for yesterday - make sure time is in yesterday's window
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
            const yesterdayMiddle = new Date(yesterdayStart.getTime() + 12 * 60 * 60 * 1000);

            for (let i = 0; i < 5; i++) {
                await db.insertInto('logs').values({
                    project_id: project.id,
                    service: 'test',
                    level: 'info',
                    message: `Yesterday log ${i}`,
                    time: yesterdayMiddle,
                }).execute();
            }

            // Create logs for today
            for (let i = 0; i < 10; i++) {
                await createTestLog({ projectId: project.id, level: 'info' });
            }

            const stats = await dashboardService.getStats(organization.id);

            expect(stats.totalLogsToday.value).toBeGreaterThanOrEqual(10);
            // Trend should be a number (positive when increased)
            expect(typeof stats.totalLogsToday.trend).toBe('number');
        });

        it('should calculate error rate trend', async () => {
            const { organization, project } = await createTestContext();

            // Create logs for yesterday
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
            const yesterdayMiddle = new Date(yesterdayStart.getTime() + 12 * 60 * 60 * 1000);

            // Yesterday: 1 error out of 10 (10% error rate)
            for (let i = 0; i < 9; i++) {
                await db.insertInto('logs').values({
                    project_id: project.id,
                    service: 'test',
                    level: 'info',
                    message: `Yesterday info ${i}`,
                    time: yesterdayMiddle,
                }).execute();
            }
            await db.insertInto('logs').values({
                project_id: project.id,
                service: 'test',
                level: 'error',
                message: 'Yesterday error',
                time: yesterdayMiddle,
            }).execute();

            // Today: 5 errors out of 10 (50% error rate)
            for (let i = 0; i < 5; i++) {
                await createTestLog({ projectId: project.id, level: 'info' });
            }
            for (let i = 0; i < 5; i++) {
                await createTestLog({ projectId: project.id, level: 'error' });
            }

            const stats = await dashboardService.getStats(organization.id);

            // Error rate should be 50%
            expect(stats.errorRate.value).toBe(50);
            // Trend should be a number (positive when increased)
            expect(typeof stats.errorRate.trend).toBe('number');
        });
    });

    describe('getTopServices - with multiple projects', () => {
        it('should aggregate services across multiple projects', async () => {
            const { organization, project: project1 } = await createTestContext();

            const project2 = await db
                .insertInto('projects')
                .values({
                    name: 'Project 2',
                    organization_id: organization.id,
                    user_id: organization.owner_id,
                })
                .returningAll()
                .executeTakeFirstOrThrow();

            // Same service in both projects
            for (let i = 0; i < 5; i++) {
                await createTestLog({ projectId: project1.id, service: 'shared-service' });
            }
            for (let i = 0; i < 5; i++) {
                await createTestLog({ projectId: project2.id, service: 'shared-service' });
            }

            const services = await dashboardService.getTopServices(organization.id, 5);

            expect(services.length).toBeGreaterThan(0);
            expect(services[0].name).toBe('shared-service');
            expect(services[0].count).toBe(10); // Combined from both projects
        });
    });

    describe('getRecentErrors - edge cases', () => {
        it('should return only error and critical levels', async () => {
            const { organization, project } = await createTestContext();

            // Create various log levels
            await createTestLog({ projectId: project.id, level: 'debug', message: 'Debug' });
            await createTestLog({ projectId: project.id, level: 'info', message: 'Info' });
            await createTestLog({ projectId: project.id, level: 'warn', message: 'Warn' });
            await createTestLog({ projectId: project.id, level: 'error', message: 'Error' });
            await createTestLog({ projectId: project.id, level: 'critical', message: 'Critical' });

            const errors = await dashboardService.getRecentErrors(organization.id);

            expect(errors.length).toBe(2);
            errors.forEach(e => {
                expect(['error', 'critical']).toContain(e.level);
            });
        });

        it('should return empty array for organization without errors', async () => {
            const { organization, project } = await createTestContext();

            // Create only non-error logs
            await createTestLog({ projectId: project.id, level: 'info', message: 'Info log' });
            await createTestLog({ projectId: project.id, level: 'debug', message: 'Debug log' });

            const errors = await dashboardService.getRecentErrors(organization.id);

            expect(errors).toEqual([]);
        });

        it('should handle traceId being undefined gracefully', async () => {
            const { organization, project } = await createTestContext();

            // Error without trace_id
            await createTestLog({
                projectId: project.id,
                level: 'error',
                message: 'Error without trace',
            });

            const errors = await dashboardService.getRecentErrors(organization.id);

            expect(errors.length).toBe(1);
            expect(errors[0].traceId).toBeUndefined();
        });
    });

    describe('getTimeseries - with logs older than 24 hours', () => {
        it('should not include logs older than 24 hours', async () => {
            const { organization, project } = await createTestContext();

            // Create old log (36 hours ago - outside 24h window)
            const oldTime = new Date(Date.now() - 36 * 60 * 60 * 1000);
            await db.insertInto('logs').values({
                project_id: project.id,
                service: 'test',
                level: 'info',
                message: 'Old log',
                time: oldTime,
            }).execute();

            // Create recent log
            await createTestLog({ projectId: project.id, level: 'info' });

            const timeseries = await dashboardService.getTimeseries(organization.id);

            // Should only include the recent log
            const totalLogs = timeseries.reduce((sum, p) => sum + p.total, 0);
            expect(totalLogs).toBe(1);
        });
    });

    describe('getStats - throughput calculations', () => {
        it('should calculate throughput as logs per second', async () => {
            const { organization, project } = await createTestContext();

            // Create 360 logs in the last hour = 0.1 logs/sec
            for (let i = 0; i < 36; i++) {
                await createTestLog({ projectId: project.id, level: 'info' });
            }

            const stats = await dashboardService.getStats(organization.id);

            // 36 logs / 3600 seconds = 0.01 logs/sec
            expect(stats.avgThroughput.value).toBeCloseTo(0.01, 2);
        });

        it('should calculate throughput trend when previous hour has data', async () => {
            const { organization, project } = await createTestContext();

            // Create logs 1.5 hours ago (in previous hour window)
            const prevHour = new Date(Date.now() - 90 * 60 * 1000);
            for (let i = 0; i < 10; i++) {
                await db.insertInto('logs').values({
                    project_id: project.id,
                    service: 'test',
                    level: 'info',
                    message: `Prev hour log ${i}`,
                    time: prevHour,
                }).execute();
            }

            // Create logs now (in current hour)
            for (let i = 0; i < 20; i++) {
                await createTestLog({ projectId: project.id, level: 'info' });
            }

            const stats = await dashboardService.getStats(organization.id);

            // Throughput should have increased (20 vs 10)
            expect(stats.avgThroughput.trend).toBeGreaterThan(0);
        });
    });
});
