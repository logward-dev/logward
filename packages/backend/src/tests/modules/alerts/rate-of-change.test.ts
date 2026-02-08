import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { db } from '../../../database/index.js';
import { alertsRoutes } from '../../../modules/alerts/routes.js';
import { createTestContext, createTestAlertRule } from '../../helpers/factories.js';
import { createTestLog } from '../../helpers/index.js';
import crypto from 'crypto';
import { BaselineCalculatorService } from '../../../modules/alerts/baseline-calculator.js';
import { alertsService } from '../../../modules/alerts/service.js';

async function createTestSession(userId: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db
        .insertInto('sessions')
        .values({
            user_id: userId,
            token,
            expires_at: expiresAt,
        })
        .execute();

    return { token, expiresAt };
}

describe('Rate-of-Change Alerts', () => {
    let app: FastifyInstance;
    let authToken: string;
    let testUser: any;
    let testOrganization: any;
    let testProject: any;

    beforeAll(async () => {
        app = Fastify();
        await app.register(alertsRoutes, { prefix: '/api/v1/alerts' });
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

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
        testUser = context.user;
        testOrganization = context.organization;
        testProject = context.project;

        const session = await createTestSession(testUser.id);
        authToken = session.token;
    });

    describe('Routes - Create rate-of-change alert', () => {
        it('should create a rate-of-change alert rule', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/alerts',
                headers: { Authorization: `Bearer ${authToken}` },
                payload: {
                    organizationId: testOrganization.id,
                    projectId: testProject.id,
                    name: 'Error Anomaly',
                    level: ['error'],
                    threshold: 1,
                    timeWindow: 60,
                    alertType: 'rate_of_change',
                    baselineType: 'rolling_7d_avg',
                    deviationMultiplier: 3,
                    emailRecipients: ['test@example.com'],
                },
            });

            expect(response.statusCode).toBe(201);
            const body = JSON.parse(response.payload);
            expect(body.alertRule.alertType).toBe('rate_of_change');
            expect(body.alertRule.baselineType).toBe('rolling_7d_avg');
            expect(body.alertRule.deviationMultiplier).toBe(3);
        });

        it('should reject rate-of-change without baselineType', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/alerts',
                headers: { Authorization: `Bearer ${authToken}` },
                payload: {
                    organizationId: testOrganization.id,
                    name: 'Missing Baseline',
                    level: ['error'],
                    threshold: 1,
                    timeWindow: 60,
                    alertType: 'rate_of_change',
                    deviationMultiplier: 3,
                    emailRecipients: ['test@example.com'],
                },
            });

            expect(response.statusCode).toBe(400);
        });

        it('should reject rate-of-change without deviationMultiplier', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/alerts',
                headers: { Authorization: `Bearer ${authToken}` },
                payload: {
                    organizationId: testOrganization.id,
                    name: 'Missing Multiplier',
                    level: ['error'],
                    threshold: 1,
                    timeWindow: 60,
                    alertType: 'rate_of_change',
                    baselineType: 'rolling_7d_avg',
                    emailRecipients: ['test@example.com'],
                },
            });

            expect(response.statusCode).toBe(400);
        });

        it('should reject deviationMultiplier below 1.5', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/alerts',
                headers: { Authorization: `Bearer ${authToken}` },
                payload: {
                    organizationId: testOrganization.id,
                    name: 'Low Multiplier',
                    level: ['error'],
                    threshold: 1,
                    timeWindow: 60,
                    alertType: 'rate_of_change',
                    baselineType: 'rolling_7d_avg',
                    deviationMultiplier: 1.0,
                    emailRecipients: ['test@example.com'],
                },
            });

            expect(response.statusCode).toBe(400);
        });

        it('should create with all optional rate-of-change fields', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/alerts',
                headers: { Authorization: `Bearer ${authToken}` },
                payload: {
                    organizationId: testOrganization.id,
                    name: 'Full RoC Alert',
                    level: ['error', 'critical'],
                    threshold: 1,
                    timeWindow: 60,
                    alertType: 'rate_of_change',
                    baselineType: 'percentile_p95',
                    deviationMultiplier: 5,
                    minBaselineValue: 20,
                    cooldownMinutes: 120,
                    sustainedMinutes: 10,
                    emailRecipients: ['test@example.com'],
                },
            });

            expect(response.statusCode).toBe(201);
            const body = JSON.parse(response.payload);
            expect(body.alertRule.baselineType).toBe('percentile_p95');
            expect(body.alertRule.deviationMultiplier).toBe(5);
            expect(body.alertRule.minBaselineValue).toBe(20);
            expect(body.alertRule.cooldownMinutes).toBe(120);
            expect(body.alertRule.sustainedMinutes).toBe(10);
        });
    });

    describe('Routes - Update to rate-of-change', () => {
        it('should update a threshold alert to rate-of-change', async () => {
            // Create threshold alert
            const createRes = await app.inject({
                method: 'POST',
                url: '/api/v1/alerts',
                headers: { Authorization: `Bearer ${authToken}` },
                payload: {
                    organizationId: testOrganization.id,
                    name: 'Threshold Alert',
                    level: ['error'],
                    threshold: 10,
                    timeWindow: 5,
                    emailRecipients: ['test@example.com'],
                },
            });
            const alertId = JSON.parse(createRes.payload).alertRule.id;

            // Update to rate-of-change
            const response = await app.inject({
                method: 'PUT',
                url: `/api/v1/alerts/${alertId}?organizationId=${testOrganization.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
                payload: {
                    alertType: 'rate_of_change',
                    baselineType: 'same_time_yesterday',
                    deviationMultiplier: 2.5,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.alertRule.alertType).toBe('rate_of_change');
            expect(body.alertRule.baselineType).toBe('same_time_yesterday');
            expect(body.alertRule.deviationMultiplier).toBe(2.5);
        });
    });

    describe('Routes - Get rate-of-change alerts', () => {
        it('should return alertType in alert rules list', async () => {
            await createTestAlertRule({
                organizationId: testOrganization.id,
                projectId: testProject.id,
                name: 'RoC Alert',
                alertType: 'rate_of_change',
                baselineType: 'rolling_7d_avg',
                deviationMultiplier: 3,
            });

            const response = await app.inject({
                method: 'GET',
                url: `/api/v1/alerts?organizationId=${testOrganization.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.alertRules.length).toBe(1);
            expect(body.alertRules[0].alertType).toBe('rate_of_change');
            expect(body.alertRules[0].baselineType).toBe('rolling_7d_avg');
        });
    });

    describe('Routes - History includes baseline metadata', () => {
        it('should return baselineMetadata in history for RoC alerts', async () => {
            const rule = await createTestAlertRule({
                organizationId: testOrganization.id,
                projectId: testProject.id,
                name: 'RoC Alert',
                alertType: 'rate_of_change',
                baselineType: 'rolling_7d_avg',
                deviationMultiplier: 3,
            });

            // Insert history record with baseline_metadata
            await db.insertInto('alert_history').values({
                rule_id: rule.id,
                triggered_at: new Date(),
                log_count: 150,
                baseline_metadata: {
                    baseline_value: 50,
                    current_value: 150,
                    deviation_ratio: 3.0,
                    baseline_type: 'rolling_7d_avg',
                    evaluation_time: new Date().toISOString(),
                },
            }).execute();

            const response = await app.inject({
                method: 'GET',
                url: `/api/v1/alerts/history?organizationId=${testOrganization.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.history.length).toBe(1);
            expect(body.history[0].alertType).toBe('rate_of_change');
            expect(body.history[0].baselineMetadata).toBeTruthy();
            expect(body.history[0].baselineMetadata.baseline_value).toBe(50);
            expect(body.history[0].baselineMetadata.current_value).toBe(150);
            expect(body.history[0].baselineMetadata.deviation_ratio).toBe(3.0);
        });

        it('should return null baselineMetadata for threshold alerts', async () => {
            const rule = await createTestAlertRule({
                organizationId: testOrganization.id,
                projectId: testProject.id,
                name: 'Threshold Alert',
            });

            await db.insertInto('alert_history').values({
                rule_id: rule.id,
                triggered_at: new Date(),
                log_count: 15,
            }).execute();

            const response = await app.inject({
                method: 'GET',
                url: `/api/v1/alerts/history?organizationId=${testOrganization.id}`,
                headers: { Authorization: `Bearer ${authToken}` },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.history.length).toBe(1);
            expect(body.history[0].alertType).toBe('threshold');
            expect(body.history[0].baselineMetadata).toBeNull();
        });
    });

    describe('BaselineCalculatorService', () => {
        const calculator = new BaselineCalculatorService();

        it('should return null for empty projectIds', async () => {
            const result = await calculator.calculate('rolling_7d_avg', [], ['error'], null);
            expect(result).toBeNull();
        });

        it('should return 0 for getCurrentHourlyRate with no logs', async () => {
            const rate = await calculator.getCurrentHourlyRate(
                [testProject.id],
                ['error'],
                null,
            );
            expect(rate).toBe(0);
        });

        it('should count recent logs in getCurrentHourlyRate', async () => {
            // Insert 5 error logs in last hour
            for (let i = 0; i < 5; i++) {
                await createTestLog({
                    projectId: testProject.id,
                    level: 'error',
                    service: 'test-service',
                    message: `Error ${i}`,
                    time: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago
                });
            }

            const rate = await calculator.getCurrentHourlyRate(
                [testProject.id],
                ['error'],
                null,
            );
            expect(rate).toBe(5);
        });

        it('should filter by service in getCurrentHourlyRate', async () => {
            for (let i = 0; i < 3; i++) {
                await createTestLog({
                    projectId: testProject.id,
                    level: 'error',
                    service: 'service-a',
                    message: `Error A ${i}`,
                    time: new Date(Date.now() - 30 * 60 * 1000),
                });
            }
            for (let i = 0; i < 2; i++) {
                await createTestLog({
                    projectId: testProject.id,
                    level: 'error',
                    service: 'service-b',
                    message: `Error B ${i}`,
                    time: new Date(Date.now() - 30 * 60 * 1000),
                });
            }

            const rateA = await calculator.getCurrentHourlyRate(
                [testProject.id],
                ['error'],
                'service-a',
            );
            // service-a logs + any 'unknown' logs
            expect(rateA).toBe(3);

            const rateAll = await calculator.getCurrentHourlyRate(
                [testProject.id],
                ['error'],
                null,
            );
            expect(rateAll).toBe(5);
        });

        it('should return null for rolling7dAvg with no historical data', async () => {
            const result = await calculator.calculate(
                'rolling_7d_avg',
                [testProject.id],
                ['error'],
                null,
            );
            expect(result).toBeNull();
        });

        it('should return null for sameTimeYesterday with no data', async () => {
            const result = await calculator.calculate(
                'same_time_yesterday',
                [testProject.id],
                ['error'],
                null,
            );
            expect(result).toBeNull();
        });
    });

    describe('Service - checkRateOfChangeRule dispatching', () => {
        it('should skip rate-of-change rule without baseline_type', async () => {
            const rule = await createTestAlertRule({
                organizationId: testOrganization.id,
                projectId: testProject.id,
                alertType: 'rate_of_change',
                baselineType: null,
                deviationMultiplier: 3,
            });

            // Run checkAlertRules - should not trigger
            const triggered = await alertsService.checkAlertRules();
            expect(triggered.length).toBe(0);
        });

        it('should not trigger when baseline has no data', async () => {
            await createTestAlertRule({
                organizationId: testOrganization.id,
                projectId: testProject.id,
                alertType: 'rate_of_change',
                baselineType: 'rolling_7d_avg',
                deviationMultiplier: 3,
                minBaselineValue: 10,
            });

            // No historical data → baseline is null → no trigger
            const triggered = await alertsService.checkAlertRules();
            expect(triggered.length).toBe(0);
        });
    });

    describe('Baseline type validation', () => {
        it('should accept all valid baseline types', async () => {
            const types = ['same_time_yesterday', 'same_day_last_week', 'rolling_7d_avg', 'percentile_p95'];

            for (const bt of types) {
                const response = await app.inject({
                    method: 'POST',
                    url: '/api/v1/alerts',
                    headers: { Authorization: `Bearer ${authToken}` },
                    payload: {
                        organizationId: testOrganization.id,
                        name: `Alert ${bt}`,
                        level: ['error'],
                        threshold: 1,
                        timeWindow: 60,
                        alertType: 'rate_of_change',
                        baselineType: bt,
                        deviationMultiplier: 3,
                        emailRecipients: ['test@example.com'],
                    },
                });

                expect(response.statusCode).toBe(201);
            }
        });

        it('should reject invalid baseline type', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/alerts',
                headers: { Authorization: `Bearer ${authToken}` },
                payload: {
                    organizationId: testOrganization.id,
                    name: 'Bad Baseline',
                    level: ['error'],
                    threshold: 1,
                    timeWindow: 60,
                    alertType: 'rate_of_change',
                    baselineType: 'invalid_type',
                    deviationMultiplier: 3,
                    emailRecipients: ['test@example.com'],
                },
            });

            expect(response.statusCode).toBe(400);
        });
    });
});
