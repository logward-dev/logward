import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { db } from '../../../database/index.js';
import { organizationsRoutes } from '../../../modules/organizations/routes.js';
import { createTestContext, createTestUser, createTestOrganization } from '../../helpers/factories.js';
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

describe('Organizations Routes', () => {
    let app: FastifyInstance;
    let authToken: string;
    let testUser: any;
    let testOrganization: any;

    beforeAll(async () => {
        app = Fastify();
        await app.register(organizationsRoutes, { prefix: '/api/v1/organizations' });
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

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

        // Create test context
        const context = await createTestContext();
        testUser = context.user;
        testOrganization = context.organization;

        // Create session for auth
        const session = await createTestSession(testUser.id);
        authToken = session.token;
    });

    describe('GET /api/v1/organizations', () => {
        it('should get all organizations for authenticated user', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/organizations',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.organizations).toBeDefined();
            expect(body.organizations.length).toBeGreaterThan(0);
        });

        it('should return 401 without auth token', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/organizations',
            });

            expect(response.statusCode).toBe(401);
        });
    });

    describe('GET /api/v1/organizations/:id', () => {
        it('should get organization by ID', async () => {
            const response = await app.inject({
                method: 'GET',
                url: `/api/v1/organizations/${testOrganization.id}`,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.organization.id).toBe(testOrganization.id);
        });

        it('should return 404 for non-existent organization', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/organizations/00000000-0000-0000-0000-000000000000',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(404);
        });

        it('should return 400 for invalid UUID', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/organizations/invalid-uuid',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(400);
        });
    });

    describe('GET /api/v1/organizations/slug/:slug', () => {
        it('should get organization by slug', async () => {
            const response = await app.inject({
                method: 'GET',
                url: `/api/v1/organizations/slug/${testOrganization.slug}`,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.organization.slug).toBe(testOrganization.slug);
        });

        it('should return 404 for non-existent slug', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/organizations/slug/non-existent-slug',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(404);
        });
    });

    describe('GET /api/v1/organizations/:id/members', () => {
        it('should get organization members', async () => {
            const response = await app.inject({
                method: 'GET',
                url: `/api/v1/organizations/${testOrganization.id}/members`,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.members).toBeDefined();
            expect(body.members.length).toBeGreaterThan(0);
        });

        it('should return 400 for invalid UUID', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/organizations/invalid-uuid/members',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(400);
        });

        it('should return 403 for non-member user', async () => {
            const otherUser = await createTestUser({ email: 'other@test.com' });
            const otherSession = await createTestSession(otherUser.id);

            const response = await app.inject({
                method: 'GET',
                url: `/api/v1/organizations/${testOrganization.id}/members`,
                headers: {
                    Authorization: `Bearer ${otherSession.token}`,
                },
            });

            expect(response.statusCode).toBe(403);
        });
    });

    describe('POST /api/v1/organizations', () => {
        it('should create a new organization', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/organizations',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    name: 'New Organization',
                    description: 'A test organization',
                },
            });

            expect(response.statusCode).toBe(201);
            const body = JSON.parse(response.payload);
            expect(body.organization.name).toBe('New Organization');
        });

        it('should return 400 for missing name', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/organizations',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    description: 'No name provided',
                },
            });

            expect(response.statusCode).toBe(400);
        });

        it('should create organizations with same name (different slug)', async () => {
            // Organizations can have same name but different slugs
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/organizations',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    name: testOrganization.name,
                },
            });

            // Should succeed - slug will be auto-generated with suffix
            expect(response.statusCode).toBe(201);
            const body = JSON.parse(response.payload);
            expect(body.organization.name).toBe(testOrganization.name);
            expect(body.organization.slug).not.toBe(testOrganization.slug);
        });
    });

    describe('PUT /api/v1/organizations/:id', () => {
        it('should update organization', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: `/api/v1/organizations/${testOrganization.id}`,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    name: 'Updated Organization Name',
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.organization.name).toBe('Updated Organization Name');
        });

        it('should return 400 for invalid UUID', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/v1/organizations/invalid-uuid',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    name: 'Updated',
                },
            });

            expect(response.statusCode).toBe(400);
        });

        it('should return 404 for non-existent organization', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/v1/organizations/00000000-0000-0000-0000-000000000000',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    name: 'Updated',
                },
            });

            expect(response.statusCode).toBe(404);
        });

        it('should return 403 for non-owner user', async () => {
            const otherUser = await createTestUser({ email: 'other@test.com' });
            const otherSession = await createTestSession(otherUser.id);

            // Add user as member but not owner
            await db
                .insertInto('organization_members')
                .values({
                    user_id: otherUser.id,
                    organization_id: testOrganization.id,
                    role: 'member',
                })
                .execute();

            const response = await app.inject({
                method: 'PUT',
                url: `/api/v1/organizations/${testOrganization.id}`,
                headers: {
                    Authorization: `Bearer ${otherSession.token}`,
                },
                payload: {
                    name: 'Unauthorized Update',
                },
            });

            expect(response.statusCode).toBe(403);
        });
    });

    describe('DELETE /api/v1/organizations/:id', () => {
        it('should delete organization', async () => {
            // Create a separate organization to delete
            const orgToDelete = await createTestOrganization({
                ownerId: testUser.id,
                name: 'Org To Delete',
            });

            const response = await app.inject({
                method: 'DELETE',
                url: `/api/v1/organizations/${orgToDelete.id}`,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(204);
        });

        it('should return 400 for invalid UUID', async () => {
            const response = await app.inject({
                method: 'DELETE',
                url: '/api/v1/organizations/invalid-uuid',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(400);
        });

        it('should return 404 for non-existent organization', async () => {
            const response = await app.inject({
                method: 'DELETE',
                url: '/api/v1/organizations/00000000-0000-0000-0000-000000000000',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(404);
        });

        it('should return 403 for non-owner user', async () => {
            const otherUser = await createTestUser({ email: 'other@test.com' });
            const otherSession = await createTestSession(otherUser.id);

            // Add user as member but not owner
            await db
                .insertInto('organization_members')
                .values({
                    user_id: otherUser.id,
                    organization_id: testOrganization.id,
                    role: 'member',
                })
                .execute();

            const response = await app.inject({
                method: 'DELETE',
                url: `/api/v1/organizations/${testOrganization.id}`,
                headers: {
                    Authorization: `Bearer ${otherSession.token}`,
                },
            });

            expect(response.statusCode).toBe(403);
        });
    });

    describe('Authentication', () => {
        it('should return 401 for invalid session token', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/organizations',
                headers: {
                    Authorization: 'Bearer invalid-token',
                },
            });

            expect(response.statusCode).toBe(401);
        });
    });
});
