import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { db } from '../../../database/index.js';
import { onboardingRoutes } from '../../../modules/onboarding/routes.js';
import { createTestUser } from '../../helpers/factories.js';
import crypto from 'crypto';

// Helper to create a session for a user
async function createTestSession(userId: string) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

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

describe('Onboarding Routes', () => {
    let app: FastifyInstance;
    let authToken: string;
    let testUser: any;

    beforeAll(async () => {
        app = Fastify();
        await app.register(onboardingRoutes, { prefix: '/api/v1/onboarding' });
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        // Clean up in correct order (respecting foreign keys)
        await db.deleteFrom('user_onboarding').execute();
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

        // Create test user
        testUser = await createTestUser();

        // Create session for auth
        const session = await createTestSession(testUser.id);
        authToken = session.token;
    });

    describe('GET /api/v1/onboarding', () => {
        it('should get onboarding state for authenticated user', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/onboarding',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.checklistItems).toBeDefined();
            expect(body.checklistCollapsed).toBe(false);
            expect(body.checklistDismissed).toBe(false);
            expect(body.tutorialCompleted).toBe(false);
            expect(body.tutorialStep).toBe(0);
            expect(body.tutorialSkipped).toBe(false);
        });

        it('should return 401 without auth token', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/onboarding',
            });

            expect(response.statusCode).toBe(401);
            const body = JSON.parse(response.payload);
            expect(body.error).toBe('No token provided');
        });

        it('should return 401 for invalid auth token', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/onboarding',
                headers: {
                    Authorization: 'Bearer invalid-token',
                },
            });

            expect(response.statusCode).toBe(401);
            const body = JSON.parse(response.payload);
            expect(body.error).toBe('Invalid or expired session');
        });
    });

    describe('PUT /api/v1/onboarding', () => {
        it('should update onboarding state', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/v1/onboarding',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    tutorialStep: 3,
                    checklistCollapsed: true,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.tutorialStep).toBe(3);
            expect(body.checklistCollapsed).toBe(true);
        });

        it('should update tutorialCompleted', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/v1/onboarding',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    tutorialCompleted: true,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.tutorialCompleted).toBe(true);
        });

        it('should update tutorialSkipped', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/v1/onboarding',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    tutorialSkipped: true,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.tutorialSkipped).toBe(true);
        });

        it('should update checklistItems', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/v1/onboarding',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    checklistItems: { step1: true, step2: false },
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.checklistItems).toEqual({ step1: true, step2: false });
        });

        it('should update checklistDismissed', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/v1/onboarding',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    checklistDismissed: true,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.checklistDismissed).toBe(true);
        });

        it('should return 400 for invalid tutorialStep', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/v1/onboarding',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    tutorialStep: -1, // Invalid: must be >= 0
                },
            });

            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.payload);
            expect(body.error).toBe('Validation error');
        });

        it('should return 400 for non-integer tutorialStep', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/v1/onboarding',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    tutorialStep: 2.5, // Invalid: must be integer
                },
            });

            expect(response.statusCode).toBe(400);
        });

        it('should return 401 without auth token', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/v1/onboarding',
                payload: {
                    tutorialStep: 3,
                },
            });

            expect(response.statusCode).toBe(401);
        });
    });

    describe('POST /api/v1/onboarding/checklist/complete', () => {
        it('should complete a checklist item', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/onboarding/checklist/complete',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    itemId: 'create_project',
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.checklistItems.create_project).toBe(true);
        });

        it('should preserve other completed items', async () => {
            // Complete first item
            await app.inject({
                method: 'POST',
                url: '/api/v1/onboarding/checklist/complete',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    itemId: 'create_project',
                },
            });

            // Complete second item
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/onboarding/checklist/complete',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    itemId: 'create_api_key',
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.checklistItems.create_project).toBe(true);
            expect(body.checklistItems.create_api_key).toBe(true);
        });

        it('should return 400 for missing itemId', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/onboarding/checklist/complete',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {},
            });

            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.payload);
            expect(body.error).toBe('Validation error');
        });

        it('should return 400 for empty itemId', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/onboarding/checklist/complete',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    itemId: '',
                },
            });

            expect(response.statusCode).toBe(400);
            const body = JSON.parse(response.payload);
            expect(body.error).toBe('Validation error');
        });

        it('should return 401 without auth token', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/onboarding/checklist/complete',
                payload: {
                    itemId: 'create_project',
                },
            });

            expect(response.statusCode).toBe(401);
        });
    });

    describe('POST /api/v1/onboarding/reset', () => {
        it('should reset onboarding state', async () => {
            // First set some state
            await app.inject({
                method: 'PUT',
                url: '/api/v1/onboarding',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    tutorialStep: 5,
                    tutorialCompleted: true,
                    checklistDismissed: true,
                },
            });

            // Reset
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/onboarding/reset',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.tutorialStep).toBe(0);
            expect(body.tutorialCompleted).toBe(false);
            expect(body.checklistDismissed).toBe(false);
            expect(body.checklistItems).toEqual({});
        });

        it('should return 401 without auth token', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/onboarding/reset',
            });

            expect(response.statusCode).toBe(401);
        });
    });

    describe('Authentication edge cases', () => {
        it('should handle expired session', async () => {
            // Create an expired session
            const expiredToken = crypto.randomBytes(32).toString('hex');
            await db
                .insertInto('sessions')
                .values({
                    user_id: testUser.id,
                    token: expiredToken,
                    expires_at: new Date(Date.now() - 1000), // Already expired
                })
                .execute();

            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/onboarding',
                headers: {
                    Authorization: `Bearer ${expiredToken}`,
                },
            });

            expect(response.statusCode).toBe(401);
            const body = JSON.parse(response.payload);
            expect(body.error).toBe('Invalid or expired session');
        });

        it('should handle malformed Authorization header', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/onboarding',
                headers: {
                    Authorization: 'malformed-header',
                },
            });

            expect(response.statusCode).toBe(401);
        });
    });
});
