import { describe, it, expect, beforeEach } from 'vitest';
import { sql } from 'kysely';
import { db } from '../../../database/index.js';
import { createTestContext, createTestLog } from '../../helpers/factories.js';
import { BaselineCalculatorService } from '../../../modules/alerts/baseline-calculator.js';

describe('BaselineCalculatorService', () => {
    let service: BaselineCalculatorService;
    let testProject: any;

    beforeEach(async () => {
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

        const context = await createTestContext();
        testProject = context.project;
        service = new BaselineCalculatorService();
    });

    /**
     * Helper: insert N logs at a given timestamp.
     */
    async function insertLogsAt(
        time: Date,
        count: number,
        overrides: { level?: 'debug' | 'info' | 'warn' | 'error' | 'critical'; service?: string } = {},
    ) {
        for (let i = 0; i < count; i++) {
            await createTestLog({
                projectId: testProject.id,
                level: overrides.level ?? 'error',
                service: overrides.service ?? 'test-service',
                message: `log entry ${i}`,
                time,
            });
        }
    }

    /**
     * Helper: get an anchor Date that is in the middle of the current hour.
     * Using 30 minutes into the hour ensures logs land cleanly in the expected bucket.
     */
    function midCurrentHour(): Date {
        const now = new Date();
        const anchor = new Date(now);
        anchor.setMinutes(30, 0, 0);
        return anchor;
    }

    /**
     * Refresh the continuous aggregate so test-inserted logs appear in
     * logs_hourly_stats.
     */
    async function refreshAggregate() {
        await sql`CALL refresh_continuous_aggregate('logs_hourly_stats', NULL, NULL)`.execute(db);
    }

    // -----------------------------------------------------------------------
    // calculate() dispatch
    // -----------------------------------------------------------------------
    describe('calculate()', () => {
        it('should return null for empty projectIds', async () => {
            const result = await service.calculate('rolling_7d_avg', [], ['error'], null);
            expect(result).toBeNull();
        });

        it('should dispatch to sameTimeYesterday', async () => {
            // No data -> null; proves the method is called
            const result = await service.calculate('same_time_yesterday', [testProject.id], ['error'], null);
            expect(result).toBeNull();
        });

        it('should dispatch to sameDayLastWeek', async () => {
            const result = await service.calculate('same_day_last_week', [testProject.id], ['error'], null);
            expect(result).toBeNull();
        });

        it('should dispatch to rolling7dAvg', async () => {
            const result = await service.calculate('rolling_7d_avg', [testProject.id], ['error'], null);
            expect(result).toBeNull();
        });

        it('should dispatch to percentileP95', async () => {
            const result = await service.calculate('percentile_p95', [testProject.id], ['error'], null);
            expect(result).toBeNull();
        });

        it('should return null for unknown method', async () => {
            const result = await service.calculate(
                'nonexistent' as any,
                [testProject.id],
                ['error'],
                null,
            );
            expect(result).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // getCurrentHourlyRate()
    // -----------------------------------------------------------------------
    describe('getCurrentHourlyRate()', () => {
        it('should return 0 for empty projectIds', async () => {
            const rate = await service.getCurrentHourlyRate([], ['error'], null);
            expect(rate).toBe(0);
        });

        it('should return 0 when no logs exist', async () => {
            const rate = await service.getCurrentHourlyRate([testProject.id], ['error'], null);
            expect(rate).toBe(0);
        });

        it('should count logs in the last hour', async () => {
            const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
            await insertLogsAt(thirtyMinAgo, 7);

            const rate = await service.getCurrentHourlyRate([testProject.id], ['error'], null);
            expect(rate).toBe(7);
        });

        it('should not count logs older than one hour', async () => {
            // Logs from 2 hours ago should not count
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            await insertLogsAt(twoHoursAgo, 5);
            // Logs from 20 minutes ago should count
            const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
            await insertLogsAt(twentyMinAgo, 3);

            const rate = await service.getCurrentHourlyRate([testProject.id], ['error'], null);
            expect(rate).toBe(3);
        });

        it('should filter by level', async () => {
            const recent = new Date(Date.now() - 15 * 60 * 1000);
            await insertLogsAt(recent, 4, { level: 'error' });
            await insertLogsAt(recent, 6, { level: 'info' });

            const errorRate = await service.getCurrentHourlyRate(
                [testProject.id],
                ['error'],
                null,
            );
            expect(errorRate).toBe(4);

            const infoRate = await service.getCurrentHourlyRate(
                [testProject.id],
                ['info'],
                null,
            );
            expect(infoRate).toBe(6);

            const bothRate = await service.getCurrentHourlyRate(
                [testProject.id],
                ['error', 'info'],
                null,
            );
            expect(bothRate).toBe(10);
        });

        it('should filter by service', async () => {
            const recent = new Date(Date.now() - 10 * 60 * 1000);
            await insertLogsAt(recent, 3, { service: 'api' });
            await insertLogsAt(recent, 5, { service: 'worker' });

            const apiRate = await service.getCurrentHourlyRate(
                [testProject.id],
                ['error'],
                'api',
            );
            expect(apiRate).toBe(3);
        });
    });

    // -----------------------------------------------------------------------
    // sameTimeYesterday()
    // -----------------------------------------------------------------------
    describe('sameTimeYesterday()', () => {
        it('should return null when no data exists', async () => {
            const result = await service.calculate(
                'same_time_yesterday',
                [testProject.id],
                ['error'],
                null,
            );
            expect(result).toBeNull();
        });

        it('should return value when yesterday data exists', async () => {
            // Insert logs at the same hour, 24h ago
            const anchor = midCurrentHour();
            const yesterday = new Date(anchor.getTime() - 24 * 60 * 60 * 1000);
            await insertLogsAt(yesterday, 10);

            await refreshAggregate();

            const result = await service.calculate(
                'same_time_yesterday',
                [testProject.id],
                ['error'],
                null,
            );
            expect(result).not.toBeNull();
            expect(result!.value).toBe(10);
            expect(result!.samplesUsed).toBeGreaterThan(0);
        });

        it('should filter by service', async () => {
            const anchor = midCurrentHour();
            const yesterday = new Date(anchor.getTime() - 24 * 60 * 60 * 1000);
            await insertLogsAt(yesterday, 8, { service: 'api' });
            await insertLogsAt(yesterday, 4, { service: 'worker' });

            await refreshAggregate();

            const result = await service.calculate(
                'same_time_yesterday',
                [testProject.id],
                ['error'],
                'api',
            );
            expect(result).not.toBeNull();
            expect(result!.value).toBe(8);
        });
    });

    // -----------------------------------------------------------------------
    // sameDayLastWeek()
    // -----------------------------------------------------------------------
    describe('sameDayLastWeek()', () => {
        it('should return null when no data exists', async () => {
            const result = await service.calculate(
                'same_day_last_week',
                [testProject.id],
                ['error'],
                null,
            );
            expect(result).toBeNull();
        });

        it('should return value when last week data exists', async () => {
            const anchor = midCurrentHour();
            const lastWeek = new Date(anchor.getTime() - 7 * 24 * 60 * 60 * 1000);
            await insertLogsAt(lastWeek, 15);

            await refreshAggregate();

            const result = await service.calculate(
                'same_day_last_week',
                [testProject.id],
                ['error'],
                null,
            );
            expect(result).not.toBeNull();
            expect(result!.value).toBe(15);
            expect(result!.samplesUsed).toBeGreaterThan(0);
        });

        it('should filter by level', async () => {
            const anchor = midCurrentHour();
            const lastWeek = new Date(anchor.getTime() - 7 * 24 * 60 * 60 * 1000);
            await insertLogsAt(lastWeek, 5, { level: 'error' });
            await insertLogsAt(lastWeek, 12, { level: 'info' });

            await refreshAggregate();

            const errorResult = await service.calculate(
                'same_day_last_week',
                [testProject.id],
                ['error'],
                null,
            );
            expect(errorResult).not.toBeNull();
            expect(errorResult!.value).toBe(5);

            const infoResult = await service.calculate(
                'same_day_last_week',
                [testProject.id],
                ['info'],
                null,
            );
            expect(infoResult).not.toBeNull();
            expect(infoResult!.value).toBe(12);
        });
    });

    // -----------------------------------------------------------------------
    // rolling7dAvg()
    // -----------------------------------------------------------------------
    describe('rolling7dAvg()', () => {
        it('should return null when no data exists', async () => {
            const result = await service.calculate(
                'rolling_7d_avg',
                [testProject.id],
                ['error'],
                null,
            );
            expect(result).toBeNull();
        });

        it('should return average across available days', async () => {
            const anchor = midCurrentHour();

            // Insert different counts at the same hour for days 1, 2, 3 ago
            const day1 = new Date(anchor.getTime() - 1 * 24 * 60 * 60 * 1000);
            const day2 = new Date(anchor.getTime() - 2 * 24 * 60 * 60 * 1000);
            const day3 = new Date(anchor.getTime() - 3 * 24 * 60 * 60 * 1000);

            await insertLogsAt(day1, 10); // 10 logs
            await insertLogsAt(day2, 20); // 20 logs
            await insertLogsAt(day3, 30); // 30 logs

            await refreshAggregate();

            const result = await service.calculate(
                'rolling_7d_avg',
                [testProject.id],
                ['error'],
                null,
            );
            expect(result).not.toBeNull();
            // Average of 10, 20, 30 = 20
            expect(result!.value).toBe(20);
            expect(result!.samplesUsed).toBe(3);
        });

        it('should only count matching levels', async () => {
            const anchor = midCurrentHour();
            const day1 = new Date(anchor.getTime() - 1 * 24 * 60 * 60 * 1000);

            await insertLogsAt(day1, 6, { level: 'error' });
            await insertLogsAt(day1, 100, { level: 'info' });

            await refreshAggregate();

            const result = await service.calculate(
                'rolling_7d_avg',
                [testProject.id],
                ['error'],
                null,
            );
            expect(result).not.toBeNull();
            expect(result!.value).toBe(6);
            expect(result!.samplesUsed).toBe(1);
        });

        it('should filter by service', async () => {
            const anchor = midCurrentHour();
            const day1 = new Date(anchor.getTime() - 1 * 24 * 60 * 60 * 1000);
            const day2 = new Date(anchor.getTime() - 2 * 24 * 60 * 60 * 1000);

            await insertLogsAt(day1, 5, { service: 'api' });
            await insertLogsAt(day1, 50, { service: 'worker' });
            await insertLogsAt(day2, 15, { service: 'api' });

            await refreshAggregate();

            const result = await service.calculate(
                'rolling_7d_avg',
                [testProject.id],
                ['error'],
                'api',
            );
            expect(result).not.toBeNull();
            // Average of 5 and 15 = 10
            expect(result!.value).toBe(10);
            expect(result!.samplesUsed).toBe(2);
        });
    });

    // -----------------------------------------------------------------------
    // percentileP95()
    // -----------------------------------------------------------------------
    describe('percentileP95()', () => {
        it('should return null when no data exists', async () => {
            const result = await service.calculate(
                'percentile_p95',
                [testProject.id],
                ['error'],
                null,
            );
            expect(result).toBeNull();
        });

        it('should return correct P95 value with single bucket', async () => {
            const anchor = midCurrentHour();
            const day1 = new Date(anchor.getTime() - 1 * 24 * 60 * 60 * 1000);

            await insertLogsAt(day1, 42);
            await refreshAggregate();

            const result = await service.calculate(
                'percentile_p95',
                [testProject.id],
                ['error'],
                null,
            );
            expect(result).not.toBeNull();
            // With a single sample, P95 is that sample
            expect(result!.value).toBe(42);
            expect(result!.samplesUsed).toBe(1);
        });

        it('should return P95 across multiple buckets', async () => {
            const anchor = midCurrentHour();

            // Insert logs across 5 different hourly buckets (different days)
            // Values sorted: [2, 4, 6, 8, 20]
            const counts = [
                { daysAgo: 1, count: 20 },
                { daysAgo: 2, count: 2 },
                { daysAgo: 3, count: 8 },
                { daysAgo: 4, count: 4 },
                { daysAgo: 5, count: 6 },
            ];

            for (const { daysAgo, count } of counts) {
                const time = new Date(anchor.getTime() - daysAgo * 24 * 60 * 60 * 1000);
                await insertLogsAt(time, count);
            }

            await refreshAggregate();

            const result = await service.calculate(
                'percentile_p95',
                [testProject.id],
                ['error'],
                null,
            );
            expect(result).not.toBeNull();
            // sorted: [2, 4, 6, 8, 20]
            // index = min(ceil(5 * 0.95) - 1, 4) = min(4, 4) = 4
            // value at index 4 = 20
            expect(result!.value).toBe(20);
            expect(result!.samplesUsed).toBe(5);
        });

        it('should filter by level', async () => {
            const anchor = midCurrentHour();
            const day1 = new Date(anchor.getTime() - 1 * 24 * 60 * 60 * 1000);

            await insertLogsAt(day1, 10, { level: 'error' });
            await insertLogsAt(day1, 100, { level: 'info' });

            await refreshAggregate();

            const result = await service.calculate(
                'percentile_p95',
                [testProject.id],
                ['error'],
                null,
            );
            expect(result).not.toBeNull();
            expect(result!.value).toBe(10);
        });

        it('should filter by service', async () => {
            const anchor = midCurrentHour();
            const day1 = new Date(anchor.getTime() - 1 * 24 * 60 * 60 * 1000);

            await insertLogsAt(day1, 7, { service: 'api' });
            await insertLogsAt(day1, 50, { service: 'worker' });

            await refreshAggregate();

            const result = await service.calculate(
                'percentile_p95',
                [testProject.id],
                ['error'],
                'api',
            );
            expect(result).not.toBeNull();
            expect(result!.value).toBe(7);
        });
    });

    // -----------------------------------------------------------------------
    // Edge cases & cross-cutting
    // -----------------------------------------------------------------------
    describe('edge cases', () => {
        it('should support multiple levels combined', async () => {
            const recent = new Date(Date.now() - 10 * 60 * 1000);
            await insertLogsAt(recent, 3, { level: 'error' });
            await insertLogsAt(recent, 4, { level: 'critical' });
            await insertLogsAt(recent, 100, { level: 'info' });

            const rate = await service.getCurrentHourlyRate(
                [testProject.id],
                ['error', 'critical'],
                null,
            );
            expect(rate).toBe(7);
        });

        it('should handle multiple project ids', async () => {
            // Create a second project under the same org
            const context2 = await createTestContext();
            const project2 = context2.project;

            const recent = new Date(Date.now() - 10 * 60 * 1000);
            await insertLogsAt(recent, 3); // project 1
            await createTestLog({
                projectId: project2.id,
                level: 'error',
                service: 'test-service',
                message: 'log from project 2',
                time: recent,
            });

            const rate = await service.getCurrentHourlyRate(
                [testProject.id, project2.id],
                ['error'],
                null,
            );
            expect(rate).toBe(4);
        });

        it('should ignore data from wrong hour bucket for sameTimeYesterday', async () => {
            const anchor = midCurrentHour();

            // Insert logs 24h ago but in a different hourly bucket (2 hours off)
            const wrongBucket = new Date(anchor.getTime() - 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000);
            await insertLogsAt(wrongBucket, 99);

            await refreshAggregate();

            const result = await service.calculate(
                'same_time_yesterday',
                [testProject.id],
                ['error'],
                null,
            );
            // Should be null because data is not in the right hourly bucket
            expect(result).toBeNull();
        });
    });
});
