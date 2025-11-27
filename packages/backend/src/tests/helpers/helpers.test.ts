import { describe, it, expect } from 'vitest';
import { createTestUser, createTestOrganization, createTestProject, createTestApiKey } from '../helpers/index.js';

describe('Test Helpers', () => {
    describe('createTestUser', () => {
        it('should create a test user', async () => {
            const user = await createTestUser({
                email: 'test@example.com',
                name: 'Test User',
            });

            expect(user.id).toBeDefined();
            expect(user.email).toBe('test@example.com');
            expect(user.name).toBe('Test User');
            expect(user.plainPassword).toBe('password123');
            expect(user.password_hash).toBeDefined();
            expect(user.password_hash).not.toBe('password123'); // Should be hashed
        });
    });

    describe('createTestOrganization', () => {
        it('should create an organization with a new owner', async () => {
            const org = await createTestOrganization({
                name: 'Test Organization',
            });

            expect(org.id).toBeDefined();
            expect(org.name).toBe('Test Organization');
            expect(org.slug).toBeDefined();
            expect(org.owner_id).toBeDefined();
        });

        it('should create an organization with existing owner', async () => {
            const user = await createTestUser();
            const org = await createTestOrganization({
                name: 'Test Org',
                ownerId: user.id,
            });

            expect(org.owner_id).toBe(user.id);
            expect(org.id).toBeDefined();
            expect(org.slug).toBeDefined();
        });
    });

    describe('createTestProject', () => {
        it('should create a project with new org and user', async () => {
            const project = await createTestProject({
                name: 'Test Project',
            });

            expect(project.id).toBeDefined();
            expect(project.name).toBe('Test Project');
            expect(project.organization_id).toBeDefined();
            expect(project.user_id).toBeDefined();
        });
    });

    describe('createTestApiKey', () => {
        it('should create an API key', async () => {
            const apiKey = await createTestApiKey({
                name: 'Test API Key',
            });

            expect(apiKey.id).toBeDefined();
            expect(apiKey.name).toBe('Test API Key');
            expect(apiKey.project_id).toBeDefined();
            expect(apiKey.plainKey).toContain('lp_test_');
            expect(apiKey.key_hash).toBeDefined();
            expect(apiKey.key_hash).not.toBe(apiKey.plainKey); // Should be hashed
        });
    });
});
