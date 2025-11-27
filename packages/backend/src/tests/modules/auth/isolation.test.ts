import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { db } from '../../../database/index.js';
import { createTestContext } from '../../helpers/factories.js';
import { build } from '../../../server.js';
import supertest from 'supertest';

describe('Organization Isolation', () => {
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
        await db.deleteFrom('organization_members').execute();
        await db.deleteFrom('organizations').execute();
        await db.deleteFrom('sessions').execute();
        await db.deleteFrom('users').execute();
    });

    it('should prevent access to another organization details', async () => {
        const context1 = await createTestContext();
        const context2 = await createTestContext(); // Different user/org

        // Login as User 1
        const loginResponse = await supertest(app.server)
            .post('/api/v1/auth/login')
            .send({
                email: context1.user.email,
                password: 'password123',
            });
        const token = loginResponse.body.session.token;

        // Try to access Org 2
        const response = await supertest(app.server)
            .get(`/api/v1/organizations/${context2.organization.id}`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(404); // Should be 404 Not Found (or 403)
    });

    it('should prevent listing members of another organization', async () => {
        const context1 = await createTestContext();
        const context2 = await createTestContext();

        // Login as User 1
        const loginResponse = await supertest(app.server)
            .post('/api/v1/auth/login')
            .send({
                email: context1.user.email,
                password: 'password123',
            });
        const token = loginResponse.body.session.token;

        // Try to list members of Org 2
        const response = await supertest(app.server)
            .get(`/api/v1/organizations/${context2.organization.id}/members`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(403); // Service throws "do not have access" -> 403
    });

    it('should prevent updating another organization', async () => {
        const context1 = await createTestContext();
        const context2 = await createTestContext();

        // Login as User 1
        const loginResponse = await supertest(app.server)
            .post('/api/v1/auth/login')
            .send({
                email: context1.user.email,
                password: 'password123',
            });
        const token = loginResponse.body.session.token;

        // Try to update Org 2
        const response = await supertest(app.server)
            .put(`/api/v1/organizations/${context2.organization.id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'Hacked Org Name',
            });

        expect(response.status).toBe(403); // Service throws "Only the organization owner..." -> 403
    });

    it('should prevent deleting another organization', async () => {
        const context1 = await createTestContext();
        const context2 = await createTestContext();

        // Login as User 1
        const loginResponse = await supertest(app.server)
            .post('/api/v1/auth/login')
            .send({
                email: context1.user.email,
                password: 'password123',
            });
        const token = loginResponse.body.session.token;

        // Try to delete Org 2
        const response = await supertest(app.server)
            .delete(`/api/v1/organizations/${context2.organization.id}`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(403); // Service throws "Only the organization owner..." -> 403
    });
});
