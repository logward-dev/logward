import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { db } from '../../../database/index.js';
import { createTestContext, createTestApiKey } from '../../helpers/factories.js';
import { build } from '../../../server.js';
import supertest from 'supertest';

describe('API Key Management', () => {
    let app: any;

    beforeAll(async () => {
        app = await build();
        await app.ready();
    });

    afterAll(async () => {
        if (app) {
            await app.close();
        }
    });

    beforeEach(async () => {
        await db.deleteFrom('api_keys').execute();
        await db.deleteFrom('projects').execute();
        await db.deleteFrom('users').execute();
        await db.deleteFrom('sessions').execute();
    });

    it('should create a new API key', async () => {
        const { user, project } = await createTestContext();

        // Login
        const loginResponse = await supertest(app.server)
            .post('/api/v1/auth/login')
            .send({
                email: user.email,
                password: 'password123',
            });
        const token = loginResponse.body.session.token;

        const response = await supertest(app.server)
            .post(`/api/v1/projects/${project.id}/api-keys`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'New API Key',
            });

        expect(response.status).toBe(201);
        expect(response.body.apiKey).toBeDefined();
        expect(response.body.apiKey).toMatch(/^lp_/); // Check prefix
        expect(response.body.message).toBeDefined();

        // Verify in DB
        const apiKey = await db
            .selectFrom('api_keys')
            .selectAll()
            .where('id', '=', response.body.id)
            .executeTakeFirst();

        expect(apiKey).toBeDefined();
        expect(apiKey?.name).toBe('New API Key');
        expect(apiKey?.key_hash).toBeDefined();
    });

    it('should list API keys for a project', async () => {
        const { user, project } = await createTestContext();

        // Create 2 keys via factory
        await createTestApiKey({ projectId: project.id, name: 'Key 1' });
        await createTestApiKey({ projectId: project.id, name: 'Key 2' });

        // Login
        const loginResponse = await supertest(app.server)
            .post('/api/v1/auth/login')
            .send({
                email: user.email,
                password: 'password123',
            });
        const token = loginResponse.body.session.token;

        const response = await supertest(app.server)
            .get(`/api/v1/projects/${project.id}/api-keys`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(response.body.apiKeys).toHaveLength(3); // 2 created above + 1 from createTestContext
    });

    it('should revoke an API key', async () => {
        const { user, project, apiKey } = await createTestContext();

        // Login
        const loginResponse = await supertest(app.server)
            .post('/api/v1/auth/login')
            .send({
                email: user.email,
                password: 'password123',
            });
        const token = loginResponse.body.session.token;

        const response = await supertest(app.server)
            .delete(`/api/v1/projects/${project.id}/api-keys/${apiKey.id}`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(204);

        // Verify deleted from DB
        const deletedKey = await db
            .selectFrom('api_keys')
            .selectAll()
            .where('id', '=', apiKey.id)
            .executeTakeFirst();

        expect(deletedKey).toBeUndefined();
    });

    it('should prevent unauthorized access to other projects', async () => {
        const { user, project } = await createTestContext();
        const { project: otherProject } = await createTestContext(); // Different user/org

        // Login as User 1
        const loginResponse = await supertest(app.server)
            .post('/api/v1/auth/login')
            .send({
                email: user.email,
                password: 'password123',
            });
        const token = loginResponse.body.session.token;

        // Try to access keys of User 2's project
        const response = await supertest(app.server)
            .get(`/api/v1/projects/${otherProject.id}/api-keys`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(404); // Should be 404 Not Found (security through obscurity) or 403
    });
});
