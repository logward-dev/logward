import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../../database/index.js';
import { processErrorNotification, type ErrorNotificationJobData } from '../../queue/jobs/error-notification.js';
import { createTestContext, createTestUser, createTestProject } from '../helpers/factories.js';
import type { IJob } from '../../queue/abstractions/types.js';
import crypto from 'crypto';

// Mock nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
    })),
  },
}));

// Mock fetch for webhooks
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Error Notification Job', () => {
  let testOrganization: any;
  let testUser: any;
  let testProject: any;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    // Clean up tables
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('error_group_channels').execute();
    await db.deleteFrom('organization_default_channels').execute();
    await db.deleteFrom('notification_channels').execute();
    await db.deleteFrom('exceptions').execute();
    await db.deleteFrom('error_groups').execute();
    await db.deleteFrom('api_keys').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('organization_members').execute();
    await db.deleteFrom('organizations').execute();
    await db.deleteFrom('sessions').execute();
    await db.deleteFrom('users').execute();

    // Create test context
    const context = await createTestContext();
    testOrganization = context.organization;
    testUser = context.user;
    testProject = context.project;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockJob(data: ErrorNotificationJobData): IJob<ErrorNotificationJobData> {
    return {
      id: 'test-job-id',
      data,
      attemptsMade: 0,
      progress: vi.fn(),
    };
  }

  async function createTestErrorGroup(overrides: {
    organizationId?: string;
    fingerprint?: string;
    status?: 'open' | 'resolved' | 'ignored';
  } = {}) {
    const fingerprint = overrides.fingerprint || crypto.randomBytes(16).toString('hex');
    const [errorGroup] = await db
      .insertInto('error_groups')
      .values({
        organization_id: overrides.organizationId || testOrganization.id,
        project_id: testProject.id,
        fingerprint,
        exception_type: 'TestError',
        exception_message: 'Test error message',
        first_seen: new Date(),
        last_seen: new Date(),
        occurrence_count: 1,
        status: overrides.status || 'open',
        language: 'nodejs',
        affected_services: ['test-service'],
      })
      .returningAll()
      .execute();
    return errorGroup;
  }

  describe('processErrorNotification', () => {
    it('should skip if error group not found', async () => {
      const job = createMockJob({
        exceptionId: 'exception-123',
        organizationId: testOrganization.id,
        projectId: testProject.id,
        fingerprint: 'non-existent-fingerprint',
        exceptionType: 'TestError',
        exceptionMessage: 'Test message',
        language: 'nodejs',
        service: 'api',
        isNewErrorGroup: true,
      });

      await processErrorNotification(job);

      // Should not create notifications
      const notifications = await db.selectFrom('notifications').selectAll().execute();
      expect(notifications).toHaveLength(0);
    });

    it('should skip if error group is ignored', async () => {
      const errorGroup = await createTestErrorGroup({ status: 'ignored' });

      const job = createMockJob({
        exceptionId: 'exception-123',
        organizationId: testOrganization.id,
        projectId: testProject.id,
        fingerprint: errorGroup.fingerprint,
        exceptionType: 'TestError',
        exceptionMessage: 'Test message',
        language: 'nodejs',
        service: 'api',
        isNewErrorGroup: false,
      });

      await processErrorNotification(job);

      // Should not create notifications
      const notifications = await db.selectFrom('notifications').selectAll().execute();
      expect(notifications).toHaveLength(0);
    });

    it('should skip if organization not found', async () => {
      const job = createMockJob({
        exceptionId: 'exception-123',
        organizationId: '00000000-0000-0000-0000-000000000000',
        projectId: testProject.id,
        fingerprint: 'some-fingerprint',
        exceptionType: 'TestError',
        exceptionMessage: null,
        language: 'nodejs',
        service: 'api',
        isNewErrorGroup: true,
      });

      await processErrorNotification(job);

      const notifications = await db.selectFrom('notifications').selectAll().execute();
      expect(notifications).toHaveLength(0);
    });

    it('should skip if project not found', async () => {
      const errorGroup = await createTestErrorGroup();

      const job = createMockJob({
        exceptionId: 'exception-123',
        organizationId: testOrganization.id,
        projectId: '00000000-0000-0000-0000-000000000000',
        fingerprint: errorGroup.fingerprint,
        exceptionType: 'TestError',
        exceptionMessage: null,
        language: 'nodejs',
        service: 'api',
        isNewErrorGroup: true,
      });

      await processErrorNotification(job);

      const notifications = await db.selectFrom('notifications').selectAll().execute();
      expect(notifications).toHaveLength(0);
    });

    it('should create in-app notifications for admins', async () => {
      const errorGroup = await createTestErrorGroup();

      const job = createMockJob({
        exceptionId: 'exception-123',
        organizationId: testOrganization.id,
        projectId: testProject.id,
        fingerprint: errorGroup.fingerprint,
        exceptionType: 'NullPointerException',
        exceptionMessage: 'Cannot read property x of null',
        language: 'nodejs',
        service: 'api-service',
        isNewErrorGroup: true,
      });

      await processErrorNotification(job);

      const notifications = await db.selectFrom('notifications').selectAll().execute();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].user_id).toBe(testUser.id);
      expect(notifications[0].title).toContain('New Error');
    });

    it('should only notify owners and admins', async () => {
      // Add a regular member
      const member = await createTestUser({ email: 'member@test.com' });
      await db
        .insertInto('organization_members')
        .values({
          user_id: member.id,
          organization_id: testOrganization.id,
          role: 'member',
        })
        .execute();

      const errorGroup = await createTestErrorGroup();

      const job = createMockJob({
        exceptionId: 'exception-123',
        organizationId: testOrganization.id,
        projectId: testProject.id,
        fingerprint: errorGroup.fingerprint,
        exceptionType: 'Error',
        exceptionMessage: 'Test',
        language: 'nodejs',
        service: 'api',
        isNewErrorGroup: false,
      });

      await processErrorNotification(job);

      // Only owner should be notified (member should not)
      const notifications = await db.selectFrom('notifications').selectAll().execute();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].user_id).toBe(testUser.id);
    });

    it('should send webhook notifications to configured channels', async () => {
      const errorGroup = await createTestErrorGroup();

      // Create webhook channel
      const [channel] = await db
        .insertInto('notification_channels')
        .values({
          organization_id: testOrganization.id,
          name: 'Error Webhook',
          type: 'webhook',
          config: { url: 'https://example.com/error-hook' },
          enabled: true,
        })
        .returningAll()
        .execute();

      // Link channel to error group
      await db
        .insertInto('error_group_channels')
        .values({
          error_group_id: errorGroup.id,
          channel_id: channel.id,
        })
        .execute();

      const job = createMockJob({
        exceptionId: 'exception-123',
        organizationId: testOrganization.id,
        projectId: testProject.id,
        fingerprint: errorGroup.fingerprint,
        exceptionType: 'TypeError',
        exceptionMessage: 'undefined is not a function',
        language: 'nodejs',
        service: 'api',
        isNewErrorGroup: true,
      });

      await processErrorNotification(job);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/error-hook',
        expect.objectContaining({
          method: 'POST',
        })
      );

      // Check payload
      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.event_type).toBe('error');
      expect(body.exception_type).toBe('TypeError');
      expect(body.is_new).toBe(true);
    });

    it('should use organization defaults when no specific channels', async () => {
      const errorGroup = await createTestErrorGroup();

      // Create default channel
      const [channel] = await db
        .insertInto('notification_channels')
        .values({
          organization_id: testOrganization.id,
          name: 'Default Error Webhook',
          type: 'webhook',
          config: { url: 'https://example.com/default-error' },
          enabled: true,
        })
        .returningAll()
        .execute();

      await db
        .insertInto('organization_default_channels')
        .values({
          organization_id: testOrganization.id,
          event_type: 'error',
          channel_id: channel.id,
        })
        .execute();

      const job = createMockJob({
        exceptionId: 'exception-123',
        organizationId: testOrganization.id,
        projectId: testProject.id,
        fingerprint: errorGroup.fingerprint,
        exceptionType: 'Error',
        exceptionMessage: null,
        language: 'python',
        service: 'worker',
        isNewErrorGroup: false,
      });

      await processErrorNotification(job);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/default-error',
        expect.anything()
      );
    });

    it('should truncate long exception messages in notification', async () => {
      const errorGroup = await createTestErrorGroup();
      const longMessage = 'A'.repeat(500);

      const job = createMockJob({
        exceptionId: 'exception-123',
        organizationId: testOrganization.id,
        projectId: testProject.id,
        fingerprint: errorGroup.fingerprint,
        exceptionType: 'Error',
        exceptionMessage: longMessage,
        language: 'nodejs',
        service: 'api',
        isNewErrorGroup: true,
      });

      await processErrorNotification(job);

      const notifications = await db.selectFrom('notifications').selectAll().execute();
      expect(notifications).toHaveLength(1);
      // Message should be truncated to 100 chars + "..."
      expect(notifications[0].message.length).toBeLessThanOrEqual(103);
      expect(notifications[0].message).toContain('...');
    });

    it('should handle webhook errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const errorGroup = await createTestErrorGroup();

      const [channel] = await db
        .insertInto('notification_channels')
        .values({
          organization_id: testOrganization.id,
          name: 'Failing Webhook',
          type: 'webhook',
          config: { url: 'https://failing.example.com' },
          enabled: true,
        })
        .returningAll()
        .execute();

      await db
        .insertInto('organization_default_channels')
        .values({
          organization_id: testOrganization.id,
          event_type: 'error',
          channel_id: channel.id,
        })
        .execute();

      const job = createMockJob({
        exceptionId: 'exception-123',
        organizationId: testOrganization.id,
        projectId: testProject.id,
        fingerprint: errorGroup.fingerprint,
        exceptionType: 'Error',
        exceptionMessage: null,
        language: 'nodejs',
        service: 'api',
        isNewErrorGroup: false,
      });

      // Should not throw
      await expect(processErrorNotification(job)).resolves.not.toThrow();

      // In-app notifications should still be created
      const notifications = await db.selectFrom('notifications').selectAll().execute();
      expect(notifications).toHaveLength(1);
    });

    it('should include correct metadata in notification', async () => {
      const errorGroup = await createTestErrorGroup();

      const job = createMockJob({
        exceptionId: 'exception-abc',
        organizationId: testOrganization.id,
        projectId: testProject.id,
        fingerprint: errorGroup.fingerprint,
        exceptionType: 'ValueError',
        exceptionMessage: 'Invalid value',
        language: 'python',
        service: 'ml-service',
        isNewErrorGroup: true,
      });

      await processErrorNotification(job);

      const notifications = await db.selectFrom('notifications').selectAll().execute();
      expect(notifications).toHaveLength(1);

      const metadata = notifications[0].metadata as any;
      expect(metadata.exceptionId).toBe('exception-abc');
      expect(metadata.errorGroupId).toBe(errorGroup.id);
      expect(metadata.exceptionType).toBe('ValueError');
      expect(metadata.language).toBe('python');
      expect(metadata.service).toBe('ml-service');
      expect(metadata.isNewErrorGroup).toBe(true);
      expect(metadata.link).toContain(errorGroup.id);
    });
  });
});
