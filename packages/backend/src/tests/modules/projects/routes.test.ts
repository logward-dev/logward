import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { db } from '../../../database/index.js';
import { projectsRoutes } from '../../../modules/projects/routes.js';
import { createTestContext, createTestUser, createTestProject, createTestOrganization } from '../../helpers/factories.js';
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

describe('Projects Routes', () => {
    let app: FastifyInstance;
    let authToken: string;
    let testUser: any;
    let testOrganization: any;
    let testProject: any;

    beforeAll(async () => {
        app = Fastify();
        await app.register(projectsRoutes, { prefix: '/api/v1/projects' });
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
        testProject = context.project;

        // Create session for auth
        const session = await createTestSession(testUser.id);
        authToken = session.token;
    });

    describe('POST /api/v1/projects', () => {
        it('should create a project', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/projects',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    organizationId: testOrganization.id,
                    name: 'New Project',
                    description: 'A test project',
                },
            });

            expect(response.statusCode).toBe(201);
            const body = JSON.parse(response.payload);
            expect(body.project).toBeDefined();
            expect(body.project.name).toBe('New Project');
        });

        it('should return 401 without auth token', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/projects',
                payload: {
                    organizationId: testOrganization.id,
                    name: 'Test Project',
                },
            });

            expect(response.statusCode).toBe(401);
        });

        it('should return 400 for invalid payload', async () => {
            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/projects',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    // Missing organizationId and name
                },
            });

            expect(response.statusCode).toBe(400);
        });

        it('should return 403 for non-member organization', async () => {
            const otherUser = await createTestUser({ email: 'other@test.com' });
            const otherSession = await createTestSession(otherUser.id);

            const response = await app.inject({
                method: 'POST',
                url: '/api/v1/projects',
                headers: {
                    Authorization: `Bearer ${otherSession.token}`,
                },
                payload: {
                    organizationId: testOrganization.id,
                    name: 'Unauthorized Project',
                },
            });

            expect(response.statusCode).toBe(403);
        });
    });

    describe('GET /api/v1/projects', () => {
        it('should get projects for organization', async () => {
            const response = await app.inject({
                method: 'GET',
                url: `/api/v1/projects?organizationId=${testOrganization.id}`,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.projects).toBeDefined();
            expect(body.projects.length).toBeGreaterThan(0);
        });

        it('should return 400 without organizationId', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/projects',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(400);
        });
    });

    describe('GET /api/v1/projects/:id', () => {
        it('should get project by ID', async () => {
            const response = await app.inject({
                method: 'GET',
                url: `/api/v1/projects/${testProject.id}`,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.project.id).toBe(testProject.id);
        });

        it('should return 404 for non-existent project', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/projects/00000000-0000-0000-0000-000000000000',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(404);
        });

        it('should return 404 for unauthorized access', async () => {
            const otherUser = await createTestUser({ email: 'other@test.com' });
            const otherSession = await createTestSession(otherUser.id);

            const response = await app.inject({
                method: 'GET',
                url: `/api/v1/projects/${testProject.id}`,
                headers: {
                    Authorization: `Bearer ${otherSession.token}`,
                },
            });

            expect(response.statusCode).toBe(404);
        });
    });

    describe('PUT /api/v1/projects/:id', () => {
        it('should update project', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: `/api/v1/projects/${testProject.id}`,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    name: 'Updated Project Name',
                    description: 'Updated description',
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.project.name).toBe('Updated Project Name');
        });

        it('should return 404 for non-existent project', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/v1/projects/00000000-0000-0000-0000-000000000000',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
                payload: {
                    name: 'Updated',
                },
            });

            expect(response.statusCode).toBe(404);
        });
    });

    describe('DELETE /api/v1/projects/:id', () => {
        it('should delete project', async () => {
            // Create a separate project to delete
            const projectToDelete = await createTestProject({
                organizationId: testOrganization.id,
                userId: testUser.id,
                name: 'To Delete',
            });

            const response = await app.inject({
                method: 'DELETE',
                url: `/api/v1/projects/${projectToDelete.id}`,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(204);

            // Verify deleted
            const getResponse = await app.inject({
                method: 'GET',
                url: `/api/v1/projects/${projectToDelete.id}`,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });
            expect(getResponse.statusCode).toBe(404);
        });

        it('should return 404 for non-existent project', async () => {
            const response = await app.inject({
                method: 'DELETE',
                url: '/api/v1/projects/00000000-0000-0000-0000-000000000000',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(404);
        });
    });
});
