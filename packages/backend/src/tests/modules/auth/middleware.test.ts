import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { db } from '../../../database/index.js';
import { createTestUser } from '../../helpers/factories.js';
import { authenticate, requireAdmin } from '../../../modules/auth/middleware.js';
import { CacheManager } from '../../../utils/cache.js';
import { settingsService } from '../../../modules/settings/service.js';
import { bootstrapService } from '../../../modules/bootstrap/service.js';
import crypto from 'crypto';

describe('Authentication Middleware', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        // Reset system settings and cache
        await db.deleteFrom('system_settings').execute();
        await CacheManager.invalidateSettings();

        // Clean up database in correct order
        await db.deleteFrom('oidc_states').execute();
        await db.deleteFrom('user_identities').execute();
        await db.deleteFrom('sessions').execute();
        await db.deleteFrom('organization_members').execute();
        await db.deleteFrom('api_keys').execute();
        await db.deleteFrom('projects').execute();
        await db.deleteFrom('organizations').execute();
        await db.deleteFrom('users').execute();

        // Clear bootstrap cache
        bootstrapService.clearCache();

        // Create fresh Fastify instance for each test
        app = Fastify();
    });

    afterAll(async () => {
        // Cleanup
        await db.deleteFrom('oidc_states').execute();
        await db.deleteFrom('user_identities').execute();
        await db.deleteFrom('sessions').execute();
        await db.deleteFrom('organization_members').execute();
        await db.deleteFrom('api_keys').execute();
        await db.deleteFrom('projects').execute();
        await db.deleteFrom('organizations').execute();
        await db.deleteFrom('users').execute();
        await db.deleteFrom('system_settings').execute();
        await CacheManager.invalidateSettings();
    });

    // ==========================================================================
    // authenticate middleware - standard mode
    // ==========================================================================
    describe('authenticate - standard mode', () => {
        beforeEach(async () => {
            // Ensure auth mode is standard
            await settingsService.set('auth.mode', 'standard');
            await CacheManager.invalidateSettings();
        });

        it('should return 401 when no token is provided', async () => {
            app.get('/test', {
                preHandler: authenticate,
                handler: async (request, reply) => {
                    return { user: request.user };
                },
            });
            await app.ready();

            const response = await app.inject({
                method: 'GET',
                url: '/test',
            });

            expect(response.statusCode).toBe(401);
            expect(response.json()).toEqual({ error: 'No token provided' });
        });

        it('should return 401 when token is invalid', async () => {
            app.get('/test', {
                preHandler: authenticate,
                handler: async (request, reply) => {
                    return { user: request.user };
                },
            });
            await app.ready();

            const response = await app.inject({
                method: 'GET',
                url: '/test',
                headers: {
                    Authorization: 'Bearer invalid-token-12345',
                },
            });

            expect(response.statusCode).toBe(401);
            expect(response.json()).toEqual({ error: 'Invalid or expired session' });
        });

        it('should return 401 when session is expired', async () => {
            const user = await createTestUser({ email: 'expired-session@test.com' });
            const token = crypto.randomBytes(32).toString('hex');

            // Create expired session
            const expiredDate = new Date();
            expiredDate.setDate(expiredDate.getDate() - 1); // Yesterday

            await db
                .insertInto('sessions')
                .values({
                    user_id: user.id,
                    token,
                    expires_at: expiredDate,
                })
                .execute();

            app.get('/test', {
                preHandler: authenticate,
                handler: async (request, reply) => {
                    return { user: request.user };
                },
            });
            await app.ready();

            const response = await app.inject({
                method: 'GET',
                url: '/test',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            expect(response.statusCode).toBe(401);
            expect(response.json()).toEqual({ error: 'Invalid or expired session' });
        });

        it('should attach user to request on valid token', async () => {
            const user = await createTestUser({ email: 'valid-session@test.com' });
            const token = crypto.randomBytes(32).toString('hex');

            // Create valid session
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);

            await db
                .insertInto('sessions')
                .values({
                    user_id: user.id,
                    token,
                    expires_at: expiresAt,
                })
                .execute();

            app.get('/test', {
                preHandler: authenticate,
                handler: async (request, reply) => {
                    return { userId: request.user?.id, email: request.user?.email };
                },
            });
            await app.ready();

            const response = await app.inject({
                method: 'GET',
                url: '/test',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = response.json();
            expect(body.userId).toBe(user.id);
            expect(body.email).toBe('valid-session@test.com');
        });

        it('should return 401 when user is disabled', async () => {
            // Create disabled user
            const user = await db
                .insertInto('users')
                .values({
                    email: 'disabled@test.com',
                    name: 'Disabled User',
                    password_hash: 'hash',
                    disabled: true,
                })
                .returningAll()
                .executeTakeFirstOrThrow();

            const token = crypto.randomBytes(32).toString('hex');

            // Create valid session for disabled user
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);

            await db
                .insertInto('sessions')
                .values({
                    user_id: user.id,
                    token,
                    expires_at: expiresAt,
                })
                .execute();

            app.get('/test', {
                preHandler: authenticate,
                handler: async (request, reply) => {
                    return { user: request.user };
                },
            });
            await app.ready();

            const response = await app.inject({
                method: 'GET',
                url: '/test',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            // validateSession should return null for disabled users
            expect(response.statusCode).toBe(401);
            expect(response.json()).toEqual({ error: 'Invalid or expired session' });
        });

        it('should strip Bearer prefix from token', async () => {
            const user = await createTestUser({ email: 'bearer-test@test.com' });
            const token = crypto.randomBytes(32).toString('hex');

            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);

            await db
                .insertInto('sessions')
                .values({
                    user_id: user.id,
                    token,
                    expires_at: expiresAt,
                })
                .execute();

            app.get('/test', {
                preHandler: authenticate,
                handler: async (request, reply) => {
                    return { success: true };
                },
            });
            await app.ready();

            const response = await app.inject({
                method: 'GET',
                url: '/test',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            expect(response.statusCode).toBe(200);
        });
    });

    // ==========================================================================
    // authenticate middleware - auth-free mode
    // ==========================================================================
    describe('authenticate - auth-free mode', () => {
        beforeEach(async () => {
            // Set auth-free mode
            await settingsService.set('auth.mode', 'none');
            await CacheManager.invalidateSettings();
            bootstrapService.clearCache();
        });

        it('should return 503 when default user is not configured', async () => {
            // No default user ID set
            await settingsService.set('auth.default_user_id', null as any);
            await CacheManager.invalidateSettings();

            app.get('/test', {
                preHandler: authenticate,
                handler: async (request, reply) => {
                    return { user: request.user };
                },
            });
            await app.ready();

            const response = await app.inject({
                method: 'GET',
                url: '/test',
            });

            expect(response.statusCode).toBe(503);
            expect(response.json()).toEqual({
                error: 'Service not ready',
                message: 'Auth-free mode is enabled but default user not initialized',
            });
        });

        it('should return 503 when default user ID is set but user does not exist', async () => {
            // Set a non-existent user ID
            await settingsService.set('auth.default_user_id', crypto.randomUUID());
            await CacheManager.invalidateSettings();

            app.get('/test', {
                preHandler: authenticate,
                handler: async (request, reply) => {
                    return { user: request.user };
                },
            });
            await app.ready();

            const response = await app.inject({
                method: 'GET',
                url: '/test',
            });

            expect(response.statusCode).toBe(503);
        });

        it('should attach default user to request in auth-free mode', async () => {
            // Create default user
            const defaultUser = await createTestUser({ email: 'default@test.com' });

            // Set as default user
            await settingsService.set('auth.default_user_id', defaultUser.id);
            await CacheManager.invalidateSettings();
            bootstrapService.clearCache();

            app.get('/test', {
                preHandler: authenticate,
                handler: async (request, reply) => {
                    return { userId: request.user?.id, email: request.user?.email };
                },
            });
            await app.ready();

            // No Authorization header needed in auth-free mode
            const response = await app.inject({
                method: 'GET',
                url: '/test',
            });

            expect(response.statusCode).toBe(200);
            const body = response.json();
            expect(body.userId).toBe(defaultUser.id);
            expect(body.email).toBe('default@test.com');
        });

        it('should work without Authorization header in auth-free mode', async () => {
            const defaultUser = await createTestUser({ email: 'no-auth@test.com' });
            await settingsService.set('auth.default_user_id', defaultUser.id);
            await CacheManager.invalidateSettings();
            bootstrapService.clearCache();

            app.get('/test', {
                preHandler: authenticate,
                handler: async (request, reply) => {
                    return { success: true, email: request.user?.email };
                },
            });
            await app.ready();

            const response = await app.inject({
                method: 'GET',
                url: '/test',
                // No headers at all
            });

            expect(response.statusCode).toBe(200);
            expect(response.json().email).toBe('no-auth@test.com');
        });

        it('should cache default user after first request', async () => {
            const defaultUser = await createTestUser({ email: 'cached@test.com' });
            await settingsService.set('auth.default_user_id', defaultUser.id);
            await CacheManager.invalidateSettings();
            bootstrapService.clearCache();

            app.get('/test', {
                preHandler: authenticate,
                handler: async (request, reply) => {
                    return { email: request.user?.email };
                },
            });
            await app.ready();

            // First request - should load from DB
            const response1 = await app.inject({
                method: 'GET',
                url: '/test',
            });
            expect(response1.statusCode).toBe(200);

            // Second request - should use cache
            const response2 = await app.inject({
                method: 'GET',
                url: '/test',
            });
            expect(response2.statusCode).toBe(200);
            expect(response2.json().email).toBe('cached@test.com');
        });
    });

    // ==========================================================================
    // requireAdmin middleware
    // ==========================================================================
    describe('requireAdmin', () => {
        beforeEach(async () => {
            // Ensure auth mode is standard for admin tests
            await settingsService.set('auth.mode', 'standard');
            await CacheManager.invalidateSettings();
        });

        it('should return 401 if no user is attached to request', async () => {
            // Use requireAdmin without authenticate
            app.get('/admin-test', {
                preHandler: requireAdmin,
                handler: async (request, reply) => {
                    return { success: true };
                },
            });
            await app.ready();

            const response = await app.inject({
                method: 'GET',
                url: '/admin-test',
            });

            expect(response.statusCode).toBe(401);
            expect(response.json()).toEqual({ error: 'Not authenticated' });
        });

        it('should return 403 if user is not admin', async () => {
            // Create non-admin user
            const user = await createTestUser({ email: 'nonadmin@test.com' });
            const token = crypto.randomBytes(32).toString('hex');

            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);

            await db
                .insertInto('sessions')
                .values({
                    user_id: user.id,
                    token,
                    expires_at: expiresAt,
                })
                .execute();

            app.get('/admin-test', {
                preHandler: [authenticate, requireAdmin],
                handler: async (request, reply) => {
                    return { success: true };
                },
            });
            await app.ready();

            const response = await app.inject({
                method: 'GET',
                url: '/admin-test',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            expect(response.statusCode).toBe(403);
            expect(response.json()).toEqual({ error: 'Admin access required' });
        });

        it('should allow admin user through', async () => {
            // Create admin user
            const adminUser = await db
                .insertInto('users')
                .values({
                    email: 'admin@test.com',
                    name: 'Admin User',
                    password_hash: 'hash',
                    is_admin: true,
                })
                .returningAll()
                .executeTakeFirstOrThrow();

            const token = crypto.randomBytes(32).toString('hex');

            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);

            await db
                .insertInto('sessions')
                .values({
                    user_id: adminUser.id,
                    token,
                    expires_at: expiresAt,
                })
                .execute();

            app.get('/admin-test', {
                preHandler: [authenticate, requireAdmin],
                handler: async (request, reply) => {
                    return { success: true, email: request.user?.email };
                },
            });
            await app.ready();

            const response = await app.inject({
                method: 'GET',
                url: '/admin-test',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            expect(response.statusCode).toBe(200);
            expect(response.json()).toEqual({ success: true, email: 'admin@test.com' });
        });
    });

    // ==========================================================================
    // Edge cases and integration
    // ==========================================================================
    describe('edge cases', () => {
        it('should handle empty Authorization header', async () => {
            await settingsService.set('auth.mode', 'standard');
            await CacheManager.invalidateSettings();

            app.get('/test', {
                preHandler: authenticate,
                handler: async (request, reply) => {
                    return { user: request.user };
                },
            });
            await app.ready();

            const response = await app.inject({
                method: 'GET',
                url: '/test',
                headers: {
                    Authorization: '',
                },
            });

            expect(response.statusCode).toBe(401);
        });

        it('should handle Authorization header without Bearer prefix', async () => {
            await settingsService.set('auth.mode', 'standard');
            await CacheManager.invalidateSettings();

            const user = await createTestUser({ email: 'no-bearer@test.com' });
            const token = crypto.randomBytes(32).toString('hex');

            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);

            await db
                .insertInto('sessions')
                .values({
                    user_id: user.id,
                    token,
                    expires_at: expiresAt,
                })
                .execute();

            app.get('/test', {
                preHandler: authenticate,
                handler: async (request, reply) => {
                    return { success: true };
                },
            });
            await app.ready();

            // Token directly without Bearer prefix
            const response = await app.inject({
                method: 'GET',
                url: '/test',
                headers: {
                    Authorization: token,
                },
            });

            // Should work - the middleware strips "Bearer " if present
            expect(response.statusCode).toBe(200);
        });

        it('should handle multiple middleware in sequence', async () => {
            await settingsService.set('auth.mode', 'standard');
            await CacheManager.invalidateSettings();

            // Create admin user
            const adminUser = await db
                .insertInto('users')
                .values({
                    email: 'multi-admin@test.com',
                    name: 'Multi Admin',
                    password_hash: 'hash',
                    is_admin: true,
                })
                .returningAll()
                .executeTakeFirstOrThrow();

            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);

            await db
                .insertInto('sessions')
                .values({
                    user_id: adminUser.id,
                    token,
                    expires_at: expiresAt,
                })
                .execute();

            app.get('/protected', {
                preHandler: [authenticate, requireAdmin],
                handler: async (request, reply) => {
                    return { user: request.user?.email, isAdmin: request.user?.is_admin };
                },
            });
            await app.ready();

            const response = await app.inject({
                method: 'GET',
                url: '/protected',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            expect(response.statusCode).toBe(200);
            const body = response.json();
            expect(body.user).toBe('multi-admin@test.com');
            expect(body.isAdmin).toBe(true);
        });
    });
});
