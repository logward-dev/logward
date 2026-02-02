import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../../database/index.js';
import { NotificationChannelsService } from '../../../modules/notification-channels/service.js';
import { createTestContext, createTestOrganization, createTestAlertRule, createTestSigmaRule } from '../../helpers/factories.js';

describe('NotificationChannelsService', () => {
  let service: NotificationChannelsService;
  let testOrganization: any;
  let testUser: any;

  beforeEach(async () => {
    service = new NotificationChannelsService();

    // Clean up tables
    await db.deleteFrom('organization_default_channels').execute();
    await db.deleteFrom('alert_rule_channels').execute();
    await db.deleteFrom('sigma_rule_channels').execute();
    await db.deleteFrom('incident_channels').execute();
    await db.deleteFrom('error_group_channels').execute();
    await db.deleteFrom('notification_channels').execute();
    await db.deleteFrom('alert_history').execute();
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

  describe('createChannel', () => {
    it('should create an email channel', async () => {
      const channel = await service.createChannel(
        testOrganization.id,
        {
          name: 'Test Email Channel',
          type: 'email',
          config: { recipients: ['test@example.com'] },
        },
        testUser.id
      );

      expect(channel).toBeDefined();
      expect(channel.name).toBe('Test Email Channel');
      expect(channel.type).toBe('email');
      expect(channel.config).toEqual({ recipients: ['test@example.com'] });
      expect(channel.enabled).toBe(true);
      expect(channel.createdBy).toBe(testUser.id);
    });

    it('should create a webhook channel', async () => {
      const channel = await service.createChannel(
        testOrganization.id,
        {
          name: 'Test Webhook Channel',
          type: 'webhook',
          config: { url: 'https://example.com/webhook' },
        },
        testUser.id
      );

      expect(channel).toBeDefined();
      expect(channel.name).toBe('Test Webhook Channel');
      expect(channel.type).toBe('webhook');
      expect(channel.config).toEqual({ url: 'https://example.com/webhook' });
    });

    it('should create channel with description', async () => {
      const channel = await service.createChannel(
        testOrganization.id,
        {
          name: 'Described Channel',
          type: 'email',
          config: { recipients: ['test@example.com'] },
          description: 'This is a test channel',
        },
        testUser.id
      );

      expect(channel.description).toBe('This is a test channel');
    });

    it('should throw for unsupported channel type', async () => {
      await expect(
        service.createChannel(testOrganization.id, {
          name: 'Invalid Channel',
          type: 'sms' as any,
          config: { phone: '+1234567890' },
        })
      ).rejects.toThrow('Unsupported channel type: sms');
    });

    it('should throw for invalid email config', async () => {
      await expect(
        service.createChannel(testOrganization.id, {
          name: 'Invalid Email',
          type: 'email',
          config: { recipients: [] }, // empty recipients
        })
      ).rejects.toThrow('Invalid configuration for email channel');
    });

    it('should throw for invalid webhook config', async () => {
      await expect(
        service.createChannel(testOrganization.id, {
          name: 'Invalid Webhook',
          type: 'webhook',
          config: { url: 'not-a-url' }, // invalid url
        })
      ).rejects.toThrow('Invalid configuration for webhook channel');
    });
  });

  describe('getChannels', () => {
    it('should get all channels for organization', async () => {
      await service.createChannel(testOrganization.id, {
        name: 'Channel 1',
        type: 'email',
        config: { recipients: ['test1@example.com'] },
      });
      await service.createChannel(testOrganization.id, {
        name: 'Channel 2',
        type: 'webhook',
        config: { url: 'https://example.com/hook' },
      });

      const channels = await service.getChannels(testOrganization.id);

      expect(channels).toHaveLength(2);
    });

    it('should filter by enabledOnly', async () => {
      const ch1 = await service.createChannel(testOrganization.id, {
        name: 'Enabled Channel',
        type: 'email',
        config: { recipients: ['test1@example.com'] },
      });
      const ch2 = await service.createChannel(testOrganization.id, {
        name: 'Disabled Channel',
        type: 'email',
        config: { recipients: ['test2@example.com'] },
      });

      // Disable one channel
      await service.updateChannel(ch2.id, testOrganization.id, { enabled: false });

      const enabledChannels = await service.getChannels(testOrganization.id, { enabledOnly: true });

      expect(enabledChannels).toHaveLength(1);
      expect(enabledChannels[0].name).toBe('Enabled Channel');
    });

    it('should filter by type', async () => {
      await service.createChannel(testOrganization.id, {
        name: 'Email Channel',
        type: 'email',
        config: { recipients: ['test@example.com'] },
      });
      await service.createChannel(testOrganization.id, {
        name: 'Webhook Channel',
        type: 'webhook',
        config: { url: 'https://example.com/hook' },
      });

      const emailChannels = await service.getChannels(testOrganization.id, { type: 'email' });
      const webhookChannels = await service.getChannels(testOrganization.id, { type: 'webhook' });

      expect(emailChannels).toHaveLength(1);
      expect(emailChannels[0].type).toBe('email');
      expect(webhookChannels).toHaveLength(1);
      expect(webhookChannels[0].type).toBe('webhook');
    });

    it('should return empty array for org with no channels', async () => {
      const channels = await service.getChannels(testOrganization.id);
      expect(channels).toHaveLength(0);
    });
  });

  describe('getChannel', () => {
    it('should get a single channel by id', async () => {
      const created = await service.createChannel(testOrganization.id, {
        name: 'Test Channel',
        type: 'email',
        config: { recipients: ['test@example.com'] },
      });

      const channel = await service.getChannel(created.id, testOrganization.id);

      expect(channel).toBeDefined();
      expect(channel!.id).toBe(created.id);
      expect(channel!.name).toBe('Test Channel');
    });

    it('should return null for non-existent channel', async () => {
      const channel = await service.getChannel(
        '00000000-0000-0000-0000-000000000000',
        testOrganization.id
      );
      expect(channel).toBeNull();
    });

    it('should return null for channel in different org', async () => {
      const created = await service.createChannel(testOrganization.id, {
        name: 'Test Channel',
        type: 'email',
        config: { recipients: ['test@example.com'] },
      });

      const otherOrg = await createTestOrganization();
      const channel = await service.getChannel(created.id, otherOrg.id);

      expect(channel).toBeNull();
    });
  });

  describe('updateChannel', () => {
    it('should update channel name', async () => {
      const created = await service.createChannel(testOrganization.id, {
        name: 'Original Name',
        type: 'email',
        config: { recipients: ['test@example.com'] },
      });

      const updated = await service.updateChannel(created.id, testOrganization.id, {
        name: 'New Name',
      });

      expect(updated.name).toBe('New Name');
    });

    it('should update channel config', async () => {
      const created = await service.createChannel(testOrganization.id, {
        name: 'Test Channel',
        type: 'email',
        config: { recipients: ['old@example.com'] },
      });

      const updated = await service.updateChannel(created.id, testOrganization.id, {
        config: { recipients: ['new@example.com'] },
      });

      expect(updated.config).toEqual({ recipients: ['new@example.com'] });
    });

    it('should update channel enabled status', async () => {
      const created = await service.createChannel(testOrganization.id, {
        name: 'Test Channel',
        type: 'email',
        config: { recipients: ['test@example.com'] },
      });

      expect(created.enabled).toBe(true);

      const updated = await service.updateChannel(created.id, testOrganization.id, {
        enabled: false,
      });

      expect(updated.enabled).toBe(false);
    });

    it('should throw for non-existent channel', async () => {
      await expect(
        service.updateChannel('00000000-0000-0000-0000-000000000000', testOrganization.id, {
          name: 'New Name',
          config: { recipients: ['test@example.com'] },
        })
      ).rejects.toThrow('Channel not found');
    });

    it('should throw for invalid config update', async () => {
      const created = await service.createChannel(testOrganization.id, {
        name: 'Test Channel',
        type: 'email',
        config: { recipients: ['test@example.com'] },
      });

      await expect(
        service.updateChannel(created.id, testOrganization.id, {
          config: { recipients: [] }, // invalid
        })
      ).rejects.toThrow('Invalid configuration for email channel');
    });
  });

  describe('deleteChannel', () => {
    it('should delete a channel', async () => {
      const created = await service.createChannel(testOrganization.id, {
        name: 'Test Channel',
        type: 'email',
        config: { recipients: ['test@example.com'] },
      });

      const deleted = await service.deleteChannel(created.id, testOrganization.id);
      expect(deleted).toBe(true);

      const channel = await service.getChannel(created.id, testOrganization.id);
      expect(channel).toBeNull();
    });

    it('should return false for non-existent channel', async () => {
      const deleted = await service.deleteChannel(
        '00000000-0000-0000-0000-000000000000',
        testOrganization.id
      );
      expect(deleted).toBe(false);
    });

    it('should return false for channel in different org', async () => {
      const created = await service.createChannel(testOrganization.id, {
        name: 'Test Channel',
        type: 'email',
        config: { recipients: ['test@example.com'] },
      });

      const otherOrg = await createTestOrganization();
      const deleted = await service.deleteChannel(created.id, otherOrg.id);

      expect(deleted).toBe(false);

      // Channel should still exist
      const channel = await service.getChannel(created.id, testOrganization.id);
      expect(channel).toBeDefined();
    });
  });

  describe('Alert Rule Channels', () => {
    it('should set and get channels for alert rule', async () => {
      const alertRule = await createTestAlertRule({ organizationId: testOrganization.id });
      const channel1 = await service.createChannel(testOrganization.id, {
        name: 'Channel 1',
        type: 'email',
        config: { recipients: ['test1@example.com'] },
      });
      const channel2 = await service.createChannel(testOrganization.id, {
        name: 'Channel 2',
        type: 'webhook',
        config: { url: 'https://example.com/hook' },
      });

      await service.setAlertRuleChannels(alertRule.id, [channel1.id, channel2.id]);

      const channels = await service.getAlertRuleChannels(alertRule.id);

      expect(channels).toHaveLength(2);
    });

    it('should replace existing alert rule channels', async () => {
      const alertRule = await createTestAlertRule({ organizationId: testOrganization.id });
      const channel1 = await service.createChannel(testOrganization.id, {
        name: 'Channel 1',
        type: 'email',
        config: { recipients: ['test1@example.com'] },
      });
      const channel2 = await service.createChannel(testOrganization.id, {
        name: 'Channel 2',
        type: 'email',
        config: { recipients: ['test2@example.com'] },
      });

      await service.setAlertRuleChannels(alertRule.id, [channel1.id]);
      let channels = await service.getAlertRuleChannels(alertRule.id);
      expect(channels).toHaveLength(1);

      await service.setAlertRuleChannels(alertRule.id, [channel2.id]);
      channels = await service.getAlertRuleChannels(alertRule.id);
      expect(channels).toHaveLength(1);
      expect(channels[0].id).toBe(channel2.id);
    });

    it('should only return enabled channels for alert rule', async () => {
      const alertRule = await createTestAlertRule({ organizationId: testOrganization.id });
      const channel1 = await service.createChannel(testOrganization.id, {
        name: 'Enabled Channel',
        type: 'email',
        config: { recipients: ['test1@example.com'] },
      });
      const channel2 = await service.createChannel(testOrganization.id, {
        name: 'Disabled Channel',
        type: 'email',
        config: { recipients: ['test2@example.com'] },
      });

      await service.updateChannel(channel2.id, testOrganization.id, { enabled: false });
      await service.setAlertRuleChannels(alertRule.id, [channel1.id, channel2.id]);

      const channels = await service.getAlertRuleChannels(alertRule.id);
      expect(channels).toHaveLength(1);
      expect(channels[0].name).toBe('Enabled Channel');
    });
  });

  describe('Sigma Rule Channels', () => {
    it('should set and get channels for sigma rule', async () => {
      const sigmaRule = await createTestSigmaRule({ organizationId: testOrganization.id });
      const channel = await service.createChannel(testOrganization.id, {
        name: 'Sigma Channel',
        type: 'email',
        config: { recipients: ['test@example.com'] },
      });

      await service.setSigmaRuleChannels(sigmaRule.id, [channel.id]);

      const channels = await service.getSigmaRuleChannels(sigmaRule.id);

      expect(channels).toHaveLength(1);
      expect(channels[0].id).toBe(channel.id);
    });

    it('should clear sigma rule channels with empty array', async () => {
      const sigmaRule = await createTestSigmaRule({ organizationId: testOrganization.id });
      const channel = await service.createChannel(testOrganization.id, {
        name: 'Sigma Channel',
        type: 'email',
        config: { recipients: ['test@example.com'] },
      });

      await service.setSigmaRuleChannels(sigmaRule.id, [channel.id]);
      await service.setSigmaRuleChannels(sigmaRule.id, []);

      const channels = await service.getSigmaRuleChannels(sigmaRule.id);
      expect(channels).toHaveLength(0);
    });
  });

  describe('Organization Defaults', () => {
    it('should set and get organization defaults for event type', async () => {
      const channel = await service.createChannel(testOrganization.id, {
        name: 'Default Channel',
        type: 'email',
        config: { recipients: ['test@example.com'] },
      });

      await service.setOrganizationDefaults(testOrganization.id, 'alert', [channel.id]);

      const defaults = await service.getOrganizationDefaults(testOrganization.id, 'alert');

      expect(defaults).toHaveLength(1);
      expect(defaults[0].id).toBe(channel.id);
    });

    it('should set defaults for different event types independently', async () => {
      const alertChannel = await service.createChannel(testOrganization.id, {
        name: 'Alert Channel',
        type: 'email',
        config: { recipients: ['alert@example.com'] },
      });
      const sigmaChannel = await service.createChannel(testOrganization.id, {
        name: 'Sigma Channel',
        type: 'email',
        config: { recipients: ['sigma@example.com'] },
      });

      await service.setOrganizationDefaults(testOrganization.id, 'alert', [alertChannel.id]);
      await service.setOrganizationDefaults(testOrganization.id, 'sigma', [sigmaChannel.id]);

      const alertDefaults = await service.getOrganizationDefaults(testOrganization.id, 'alert');
      const sigmaDefaults = await service.getOrganizationDefaults(testOrganization.id, 'sigma');

      expect(alertDefaults).toHaveLength(1);
      expect(alertDefaults[0].name).toBe('Alert Channel');
      expect(sigmaDefaults).toHaveLength(1);
      expect(sigmaDefaults[0].name).toBe('Sigma Channel');
    });

    it('should get all organization defaults', async () => {
      const channel1 = await service.createChannel(testOrganization.id, {
        name: 'Channel 1',
        type: 'email',
        config: { recipients: ['test1@example.com'] },
      });
      const channel2 = await service.createChannel(testOrganization.id, {
        name: 'Channel 2',
        type: 'email',
        config: { recipients: ['test2@example.com'] },
      });

      await service.setOrganizationDefaults(testOrganization.id, 'alert', [channel1.id]);
      await service.setOrganizationDefaults(testOrganization.id, 'error', [channel2.id]);

      const allDefaults = await service.getAllOrganizationDefaults(testOrganization.id);

      expect(allDefaults.alert).toHaveLength(1);
      expect(allDefaults.error).toHaveLength(1);
      expect(allDefaults.sigma).toHaveLength(0);
      expect(allDefaults.incident).toHaveLength(0);
    });
  });

  describe('sendToChannels', () => {
    it('should return empty map for empty channel ids', async () => {
      const results = await service.sendToChannels([], testOrganization.id, {
        organizationId: testOrganization.id,
        organizationName: 'Test Org',
        eventType: 'alert',
        title: 'Test',
        message: 'Test message',
      });

      expect(results.size).toBe(0);
    });

    it('should skip disabled channels', async () => {
      const channel = await service.createChannel(testOrganization.id, {
        name: 'Disabled Channel',
        type: 'email',
        config: { recipients: ['test@example.com'] },
      });
      await service.updateChannel(channel.id, testOrganization.id, { enabled: false });

      const results = await service.sendToChannels([channel.id], testOrganization.id, {
        organizationId: testOrganization.id,
        organizationName: 'Test Org',
        eventType: 'alert',
        title: 'Test',
        message: 'Test message',
      });

      // Disabled channels are not fetched from DB, so no results
      expect(results.size).toBe(0);
    });
  });
});
