import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import crypto from 'crypto';
import { db } from '../../database/index.js';
import { processIncidentNotification, type IncidentNotificationJob } from '../../queue/jobs/incident-notification.js';
import { createTestContext, createTestUser, createTestOrganization } from '../helpers/factories.js';
import type { IJob } from '../../queue/abstractions/types.js';

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

describe('Incident Notification Job', () => {
  let testOrganization: any;
  let testUser: any;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    // Clean up tables
    await db.deleteFrom('notifications').execute();
    await db.deleteFrom('incident_channels').execute();
    await db.deleteFrom('organization_default_channels').execute();
    await db.deleteFrom('notification_channels').execute();
    await db.deleteFrom('incidents').execute();
    await db.deleteFrom('detection_events').execute();
    await db.deleteFrom('sigma_rules').execute();
    await db.deleteFrom('alert_rules').execute();
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockJob(data: IncidentNotificationJob): IJob<IncidentNotificationJob> {
    return {
      id: 'test-job-id',
      data,
      attemptsMade: 0,
      progress: vi.fn(),
    };
  }

  describe('processIncidentNotification', () => {
    it('should skip notification if organization not found', async () => {
      const job = createMockJob({
        incidentId: crypto.randomUUID(),
        organizationId: '00000000-0000-0000-0000-000000000000',
        title: 'Test Incident',
        description: 'Test description',
        severity: 'high',
        affectedServices: ['api'],
      });

      await processIncidentNotification(job);

      // Should not throw, just log and return
      const notifications = await db.selectFrom('notifications').selectAll().execute();
      expect(notifications).toHaveLength(0);
    });

    it('should create in-app notifications for members', async () => {
      const job = createMockJob({
        incidentId: crypto.randomUUID(),
        organizationId: testOrganization.id,
        title: 'Critical Security Incident',
        description: 'Suspicious activity detected',
        severity: 'critical',
        affectedServices: ['api', 'auth'],
      });

      await processIncidentNotification(job);

      // Should create in-app notification for the owner
      const notifications = await db.selectFrom('notifications').selectAll().execute();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].user_id).toBe(testUser.id);
      expect(notifications[0].title).toContain('Critical');
    });

    it('should only notify admins for medium severity', async () => {
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

      const job = createMockJob({
        incidentId: crypto.randomUUID(),
        organizationId: testOrganization.id,
        title: 'Medium Incident',
        description: 'Minor issue',
        severity: 'medium',
        affectedServices: null,
      });

      await processIncidentNotification(job);

      // Should only notify owner (admin), not the regular member
      const notifications = await db.selectFrom('notifications').selectAll().execute();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].user_id).toBe(testUser.id);
    });

    it('should notify all members for critical severity', async () => {
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

      const job = createMockJob({
        incidentId: crypto.randomUUID(),
        organizationId: testOrganization.id,
        title: 'Critical Incident',
        description: 'Major breach',
        severity: 'critical',
        affectedServices: ['auth'],
      });

      await processIncidentNotification(job);

      // Should notify both owner and member
      const notifications = await db.selectFrom('notifications').selectAll().execute();
      expect(notifications).toHaveLength(2);
    });

    it('should send webhook notifications to configured channels', async () => {
      // Create a webhook channel
      const [channel] = await db
        .insertInto('notification_channels')
        .values({
          organization_id: testOrganization.id,
          name: 'Incident Webhook',
          type: 'webhook',
          config: { url: 'https://example.com/incident-hook' },
          enabled: true,
        })
        .returningAll()
        .execute();

      // Create an incident and link channel
      const [incident] = await db
        .insertInto('incidents')
        .values({
          organization_id: testOrganization.id,
          title: 'Test Incident',
          description: 'Test',
          severity: 'high',
          status: 'open',
        })
        .returningAll()
        .execute();

      await db
        .insertInto('incident_channels')
        .values({
          incident_id: incident.id,
          channel_id: channel.id,
        })
        .execute();

      const job = createMockJob({
        incidentId: incident.id,
        organizationId: testOrganization.id,
        title: 'Test Incident',
        description: 'Test description',
        severity: 'high',
        affectedServices: ['api'],
      });

      await processIncidentNotification(job);

      // Should call webhook
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/incident-hook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should use organization defaults when no specific channels configured', async () => {
      // Create a webhook channel as org default
      const [channel] = await db
        .insertInto('notification_channels')
        .values({
          organization_id: testOrganization.id,
          name: 'Default Webhook',
          type: 'webhook',
          config: { url: 'https://example.com/default-hook' },
          enabled: true,
        })
        .returningAll()
        .execute();

      await db
        .insertInto('organization_default_channels')
        .values({
          organization_id: testOrganization.id,
          event_type: 'incident',
          channel_id: channel.id,
        })
        .execute();

      const job = createMockJob({
        incidentId: crypto.randomUUID(),
        organizationId: testOrganization.id,
        title: 'Incident without channels',
        description: null,
        severity: 'low',
        affectedServices: null,
      });

      await processIncidentNotification(job);

      // Should use default webhook
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/default-hook',
        expect.anything()
      );
    });

    it('should handle webhook errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const [channel] = await db
        .insertInto('notification_channels')
        .values({
          organization_id: testOrganization.id,
          name: 'Failing Webhook',
          type: 'webhook',
          config: { url: 'https://example.com/failing' },
          enabled: true,
        })
        .returningAll()
        .execute();

      await db
        .insertInto('organization_default_channels')
        .values({
          organization_id: testOrganization.id,
          event_type: 'incident',
          channel_id: channel.id,
        })
        .execute();

      const job = createMockJob({
        incidentId: crypto.randomUUID(),
        organizationId: testOrganization.id,
        title: 'Test',
        description: null,
        severity: 'low',
        affectedServices: null,
      });

      // Should not throw
      await expect(processIncidentNotification(job)).resolves.not.toThrow();
    });

    it('should skip if no members to notify', async () => {
      // Create org without members
      const emptyOrg = await createTestOrganization();
      await db
        .deleteFrom('organization_members')
        .where('organization_id', '=', emptyOrg.id)
        .execute();

      const job = createMockJob({
        incidentId: crypto.randomUUID(),
        organizationId: emptyOrg.id,
        title: 'Test',
        description: null,
        severity: 'low',
        affectedServices: null,
      });

      await processIncidentNotification(job);

      // Should not create any notifications
      const notifications = await db
        .selectFrom('notifications')
        .where('organization_id', '=', emptyOrg.id)
        .execute();
      expect(notifications).toHaveLength(0);
    });
  });
});
