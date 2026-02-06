import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { db } from '../../../database/index.js';
import dashboardRoutes from '../../../modules/dashboard/routes.js';
import { createTestContext, createTestLog } from '../../helpers/factories.js';
import crypto from 'crypto';

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

describe('Dashboard Routes', () => {
    let app: FastifyInstance;
    let authToken: string;
    let testUser: any;
    let testOrganization: any;
    let testProject: any;

    beforeAll(async () => {
        app = Fastify();
        // Dashboard routes don't use authenticate middleware directly,
        // but rely on request.user being set. We register the routes and
        // add a mock auth hook that sets request.user from the session.
        app.addHook('onRequest', async (request: any) => {
            const authHeader = request.headers.authorization;
            if (!authHeader) return;

            const token = authHeader.replace('Bearer ', '');
            const session = await db
                .selectFrom('sessions')
                .select(['user_id'])
                .where('token', '=', token)
                .where('expires_at', '>', new Date())
                .executeTakeFirst();

            if (session) {
                request.user = { id: session.user_id };
            }
        });
        await app.register(dashboardRoutes);
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        await db.deleteFrom('logs').execute();
        await db.deleteFrom('api_keys').execute();
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

    function authHeaders() {
        return { Authorization: `Bearer ${authToken}` };
    }

    // =========================================================================
    // GET /api/v1/dashboard/stats
    // =========================================================================

    describe('GET /api/v1/dashboard/stats', () => {
        it('should return stats for the organization', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/dashboard/stats?organizationId=${testOrganization.id}`,
                headers: authHeaders(),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.totalLogsToday).toBeDefined();
            expect(body.errorRate).toBeDefined();
            expect(body.activeServices).toBeDefined();
            expect(body.avgThroughput).toBeDefined();
        });

        it('should return 400 for missing organizationId', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/dashboard/stats',
                headers: authHeaders(),
            });

            expect(res.statusCode).toBe(400);
        });

        it('should return 403 when user is not a member', async () => {
            const otherUser = await db
                .insertInto('users')
                .values({ email: 'other@test.com', name: 'Other', password_hash: 'h' })
                .returningAll()
                .executeTakeFirstOrThrow();
            const session = await createTestSession(otherUser.id);

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/dashboard/stats?organizationId=${testOrganization.id}`,
                headers: { Authorization: `Bearer ${session.token}` },
            });

            expect(res.statusCode).toBe(403);
        });

        it('should return zeros when no logs exist', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/dashboard/stats?organizationId=${testOrganization.id}`,
                headers: authHeaders(),
            });

            const body = JSON.parse(res.payload);
            expect(body.totalLogsToday.value).toBe(0);
        });

        it('should count logs correctly', async () => {
            await createTestLog({ projectId: testProject.id, level: 'info' });
            await createTestLog({ projectId: testProject.id, level: 'error' });

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/dashboard/stats?organizationId=${testOrganization.id}`,
                headers: authHeaders(),
            });

            const body = JSON.parse(res.payload);
            expect(body.totalLogsToday.value).toBe(2);
        });
    });

    // =========================================================================
    // GET /api/v1/dashboard/timeseries
    // =========================================================================

    describe('GET /api/v1/dashboard/timeseries', () => {
        it('should return timeseries data', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/dashboard/timeseries?organizationId=${testOrganization.id}`,
                headers: authHeaders(),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.timeseries).toBeDefined();
            expect(Array.isArray(body.timeseries)).toBe(true);
        });

        it('should return 400 for missing organizationId', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/dashboard/timeseries',
                headers: authHeaders(),
            });

            expect(res.statusCode).toBe(400);
        });

        it('should return 403 when user is not a member', async () => {
            const otherUser = await db
                .insertInto('users')
                .values({ email: 'ts@test.com', name: 'TS', password_hash: 'h' })
                .returningAll()
                .executeTakeFirstOrThrow();
            const session = await createTestSession(otherUser.id);

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/dashboard/timeseries?organizationId=${testOrganization.id}`,
                headers: { Authorization: `Bearer ${session.token}` },
            });

            expect(res.statusCode).toBe(403);
        });

        it('should return empty for org with no logs', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/dashboard/timeseries?organizationId=${testOrganization.id}`,
                headers: authHeaders(),
            });

            const body = JSON.parse(res.payload);
            expect(body.timeseries.length).toBe(0);
        });
    });

    // =========================================================================
    // GET /api/v1/dashboard/top-services
    // =========================================================================

    describe('GET /api/v1/dashboard/top-services', () => {
        it('should return top services', async () => {
            await createTestLog({ projectId: testProject.id, service: 'api' });
            await createTestLog({ projectId: testProject.id, service: 'worker' });

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/dashboard/top-services?organizationId=${testOrganization.id}`,
                headers: authHeaders(),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.services).toBeDefined();
            expect(Array.isArray(body.services)).toBe(true);
        });

        it('should respect limit parameter', async () => {
            for (let i = 0; i < 5; i++) {
                await createTestLog({ projectId: testProject.id, service: `svc-${i}` });
            }

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/dashboard/top-services?organizationId=${testOrganization.id}&limit=2`,
                headers: authHeaders(),
            });

            const body = JSON.parse(res.payload);
            expect(body.services.length).toBeLessThanOrEqual(2);
        });

        it('should return 400 for missing organizationId', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/dashboard/top-services',
                headers: authHeaders(),
            });

            expect(res.statusCode).toBe(400);
        });

        it('should return 403 when user is not a member', async () => {
            const otherUser = await db
                .insertInto('users')
                .values({ email: 'svc@test.com', name: 'SVC', password_hash: 'h' })
                .returningAll()
                .executeTakeFirstOrThrow();
            const session = await createTestSession(otherUser.id);

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/dashboard/top-services?organizationId=${testOrganization.id}`,
                headers: { Authorization: `Bearer ${session.token}` },
            });

            expect(res.statusCode).toBe(403);
        });
    });

    // =========================================================================
    // GET /api/v1/dashboard/recent-errors
    // =========================================================================

    describe('GET /api/v1/dashboard/recent-errors', () => {
        it('should return recent errors', async () => {
            await createTestLog({ projectId: testProject.id, level: 'error', message: 'Something broke' });
            await createTestLog({ projectId: testProject.id, level: 'critical', message: 'Total failure' });

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/dashboard/recent-errors?organizationId=${testOrganization.id}`,
                headers: authHeaders(),
            });

            expect(res.statusCode).toBe(200);
            const body = JSON.parse(res.payload);
            expect(body.errors).toBeDefined();
            expect(body.errors.length).toBe(2);
        });

        it('should not include info/debug/warn logs', async () => {
            await createTestLog({ projectId: testProject.id, level: 'info' });
            await createTestLog({ projectId: testProject.id, level: 'debug' });
            await createTestLog({ projectId: testProject.id, level: 'warn' });

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/dashboard/recent-errors?organizationId=${testOrganization.id}`,
                headers: authHeaders(),
            });

            const body = JSON.parse(res.payload);
            expect(body.errors.length).toBe(0);
        });

        it('should return 400 for missing organizationId', async () => {
            const res = await app.inject({
                method: 'GET',
                url: '/api/v1/dashboard/recent-errors',
                headers: authHeaders(),
            });

            expect(res.statusCode).toBe(400);
        });

        it('should return 403 when user is not a member', async () => {
            const otherUser = await db
                .insertInto('users')
                .values({ email: 'err@test.com', name: 'ERR', password_hash: 'h' })
                .returningAll()
                .executeTakeFirstOrThrow();
            const session = await createTestSession(otherUser.id);

            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/dashboard/recent-errors?organizationId=${testOrganization.id}`,
                headers: { Authorization: `Bearer ${session.token}` },
            });

            expect(res.statusCode).toBe(403);
        });

        it('should return empty when no errors exist', async () => {
            const res = await app.inject({
                method: 'GET',
                url: `/api/v1/dashboard/recent-errors?organizationId=${testOrganization.id}`,
                headers: authHeaders(),
            });

            const body = JSON.parse(res.payload);
            expect(body.errors.length).toBe(0);
        });
    });
});
