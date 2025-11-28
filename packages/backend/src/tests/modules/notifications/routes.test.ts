import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { db } from '../../../database/index.js';
import { notificationsRoutes } from '../../../modules/notifications/routes.js';
import { createTestContext, createTestUser } from '../../helpers/factories.js';
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

// Helper to create a notification for a user
async function createTestNotification(userId: string, options: {
    title?: string;
    message?: string;
    read?: boolean;
    organizationId?: string;
} = {}) {
    const notification = await db
        .insertInto('notifications')
        .values({
            user_id: userId,
            type: 'alert',
            title: options.title || 'Test Notification',
            message: options.message || 'This is a test notification',
            read: options.read ?? false,
            organization_id: options.organizationId || null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

    return notification;
}

describe('Notifications Routes', () => {
    let app: FastifyInstance;
    let authToken: string;
    let testUser: any;
    let testOrganization: any;

    beforeAll(async () => {
        app = Fastify();
        await app.register(notificationsRoutes, { prefix: '/api/v1/notifications' });
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

    describe('GET /api/v1/notifications', () => {
        it('should get all notifications for authenticated user', async () => {
            await createTestNotification(testUser.id, { title: 'Notification 1' });
            await createTestNotification(testUser.id, { title: 'Notification 2' });

            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/notifications',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.notifications).toHaveLength(2);
            expect(body.total).toBe(2);
        });

        it('should return 401 without auth token', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/notifications',
            });

            expect(response.statusCode).toBe(401);
        });

        it('should filter unread only notifications', async () => {
            await createTestNotification(testUser.id, { title: 'Unread', read: false });
            await createTestNotification(testUser.id, { title: 'Read', read: true });

            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/notifications?unreadOnly=true',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.notifications).toHaveLength(1);
            expect(body.notifications[0].title).toBe('Unread');
        });

        it('should support pagination', async () => {
            for (let i = 0; i < 5; i++) {
                await createTestNotification(testUser.id, { title: `Notification ${i}` });
            }

            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/notifications?limit=2&offset=1',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.notifications).toHaveLength(2);
        });
    });

    describe('PUT /api/v1/notifications/:id/read', () => {
        it('should mark notification as read', async () => {
            const notification = await createTestNotification(testUser.id, { read: false });

            const response = await app.inject({
                method: 'PUT',
                url: `/api/v1/notifications/${notification.id}/read`,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(true);

            // Verify it was marked as read
            const updated = await db
                .selectFrom('notifications')
                .select('read')
                .where('id', '=', notification.id)
                .executeTakeFirst();
            expect(updated?.read).toBe(true);
        });

        it('should return 400 for invalid UUID', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/v1/notifications/invalid-uuid/read',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(400);
        });

        it('should return 401 without auth token', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/v1/notifications/00000000-0000-0000-0000-000000000001/read',
            });

            expect(response.statusCode).toBe(401);
        });
    });

    describe('PUT /api/v1/notifications/read-all', () => {
        it('should mark all notifications as read', async () => {
            await createTestNotification(testUser.id, { read: false });
            await createTestNotification(testUser.id, { read: false });

            const response = await app.inject({
                method: 'PUT',
                url: '/api/v1/notifications/read-all',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.success).toBe(true);

            // Verify all were marked as read
            const unread = await db
                .selectFrom('notifications')
                .selectAll()
                .where('user_id', '=', testUser.id)
                .where('read', '=', false)
                .execute();
            expect(unread).toHaveLength(0);
        });

        it('should return 401 without auth token', async () => {
            const response = await app.inject({
                method: 'PUT',
                url: '/api/v1/notifications/read-all',
            });

            expect(response.statusCode).toBe(401);
        });
    });

    describe('DELETE /api/v1/notifications/all', () => {
        it('should delete all notifications for user', async () => {
            await createTestNotification(testUser.id);
            await createTestNotification(testUser.id);

            const response = await app.inject({
                method: 'DELETE',
                url: '/api/v1/notifications/all',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(204);

            // Verify all were deleted
            const remaining = await db
                .selectFrom('notifications')
                .selectAll()
                .where('user_id', '=', testUser.id)
                .execute();
            expect(remaining).toHaveLength(0);
        });

        it('should return 401 without auth token', async () => {
            const response = await app.inject({
                method: 'DELETE',
                url: '/api/v1/notifications/all',
            });

            expect(response.statusCode).toBe(401);
        });
    });

    describe('DELETE /api/v1/notifications/:id', () => {
        it('should delete specific notification', async () => {
            const notification = await createTestNotification(testUser.id);

            const response = await app.inject({
                method: 'DELETE',
                url: `/api/v1/notifications/${notification.id}`,
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(204);

            // Verify it was deleted
            const remaining = await db
                .selectFrom('notifications')
                .selectAll()
                .where('id', '=', notification.id)
                .execute();
            expect(remaining).toHaveLength(0);
        });

        it('should return 400 for invalid UUID', async () => {
            const response = await app.inject({
                method: 'DELETE',
                url: '/api/v1/notifications/invalid-uuid',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(400);
        });

        it('should return 401 without auth token', async () => {
            const response = await app.inject({
                method: 'DELETE',
                url: '/api/v1/notifications/00000000-0000-0000-0000-000000000001',
            });

            expect(response.statusCode).toBe(401);
        });
    });

    describe('Authentication', () => {
        it('should return 401 for invalid session token', async () => {
            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/notifications',
                headers: {
                    Authorization: 'Bearer invalid-token',
                },
            });

            expect(response.statusCode).toBe(401);
        });

        it('should not show notifications from other users', async () => {
            // Create another user with their own notifications
            const otherUser = await createTestUser({ email: 'other@test.com' });
            await createTestNotification(otherUser.id, { title: 'Other User Notification' });

            // Create notification for test user
            await createTestNotification(testUser.id, { title: 'My Notification' });

            const response = await app.inject({
                method: 'GET',
                url: '/api/v1/notifications',
                headers: {
                    Authorization: `Bearer ${authToken}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = JSON.parse(response.payload);
            expect(body.notifications).toHaveLength(1);
            expect(body.notifications[0].title).toBe('My Notification');
        });
    });
});
