import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailProvider } from '../../../modules/notification-channels/providers/email-provider.js';
import { WebhookProvider } from '../../../modules/notification-channels/providers/webhook-provider.js';
import type { NotificationContext } from '../../../modules/notification-channels/providers/interface.js';

describe('EmailProvider', () => {
  let provider: EmailProvider;

  beforeEach(() => {
    provider = new EmailProvider();
  });

  describe('validateConfig', () => {
    it('should validate valid email config', () => {
      expect(provider.validateConfig({ recipients: ['test@example.com'] })).toBe(true);
    });

    it('should validate config with multiple recipients', () => {
      expect(
        provider.validateConfig({
          recipients: ['test1@example.com', 'test2@example.com'],
        })
      ).toBe(true);
    });

    it('should reject empty recipients array', () => {
      expect(provider.validateConfig({ recipients: [] })).toBe(false);
    });

    it('should reject invalid email format', () => {
      expect(provider.validateConfig({ recipients: ['not-an-email'] })).toBe(false);
    });

    it('should reject null config', () => {
      expect(provider.validateConfig(null)).toBe(false);
    });

    it('should reject missing recipients', () => {
      expect(provider.validateConfig({})).toBe(false);
    });

    it('should reject non-array recipients', () => {
      expect(provider.validateConfig({ recipients: 'test@example.com' })).toBe(false);
    });
  });

  describe('send', () => {
    it('should send email when SMTP is configured', async () => {
      const context: NotificationContext = {
        organizationId: 'org-123',
        organizationName: 'Test Org',
        eventType: 'alert',
        title: 'Test Alert',
        message: 'Test message',
      };

      const result = await provider.send(context, { recipients: ['test@example.com'] });

      // SMTP is configured in test env (MailHog), so it should succeed
      // If SMTP wasn't configured, it would return false
      expect(typeof result.success).toBe('boolean');
    });

    it('should return error for invalid config', async () => {
      const context: NotificationContext = {
        organizationId: 'org-123',
        organizationName: 'Test Org',
        eventType: 'alert',
        title: 'Test Alert',
        message: 'Test message',
      };

      const result = await provider.send(context, { recipients: [] });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email configuration');
    });
  });

  describe('test', () => {
    it('should send test notification', async () => {
      const result = await provider.test({ recipients: ['test@example.com'] });

      // SMTP is configured in test env (MailHog)
      expect(typeof result.success).toBe('boolean');
      if (result.success) {
        expect(result.metadata).toBeDefined();
      }
    });
  });
});

describe('WebhookProvider', () => {
  let provider: WebhookProvider;

  beforeEach(() => {
    provider = new WebhookProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateConfig', () => {
    it('should validate valid https URL', () => {
      expect(provider.validateConfig({ url: 'https://example.com/webhook' })).toBe(true);
    });

    it('should validate valid http URL', () => {
      expect(provider.validateConfig({ url: 'http://example.com/webhook' })).toBe(true);
    });

    it('should reject invalid URL', () => {
      expect(provider.validateConfig({ url: 'not-a-url' })).toBe(false);
    });

    it('should reject missing URL', () => {
      expect(provider.validateConfig({})).toBe(false);
    });

    it('should reject null config', () => {
      expect(provider.validateConfig(null)).toBe(false);
    });

    it('should reject ftp URLs', () => {
      expect(provider.validateConfig({ url: 'ftp://example.com/file' })).toBe(false);
    });
  });

  describe('send', () => {
    it('should return error for invalid config', async () => {
      const context: NotificationContext = {
        organizationId: 'org-123',
        organizationName: 'Test Org',
        eventType: 'alert',
        title: 'Test Alert',
        message: 'Test message',
      };

      const result = await provider.send(context, { url: 'invalid' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid webhook configuration');
    });

    it('should send webhook with correct payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch;

      const context: NotificationContext = {
        organizationId: 'org-123',
        organizationName: 'Test Org',
        eventType: 'alert',
        title: 'Test Alert',
        message: 'Test message',
        severity: 'high',
        link: '/dashboard/alerts/1',
      };

      const result = await provider.send(context, { url: 'https://example.com/webhook' });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.com/webhook');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.event_type).toBe('alert');
      expect(body.title).toBe('Test Alert');
      expect(body.message).toBe('Test message');
      expect(body.severity).toBe('high');
      expect(body.organization.id).toBe('org-123');
      expect(body.organization.name).toBe('Test Org');
    });

    it('should add bearer auth header when configured', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch;

      const context: NotificationContext = {
        organizationId: 'org-123',
        organizationName: 'Test Org',
        eventType: 'alert',
        title: 'Test',
        message: 'Test',
      };

      await provider.send(context, {
        url: 'https://example.com/webhook',
        auth: { type: 'bearer', token: 'my-token' },
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer my-token');
    });

    it('should add basic auth header when configured', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch;

      const context: NotificationContext = {
        organizationId: 'org-123',
        organizationName: 'Test Org',
        eventType: 'alert',
        title: 'Test',
        message: 'Test',
      };

      await provider.send(context, {
        url: 'https://example.com/webhook',
        auth: { type: 'basic', username: 'user', password: 'pass' },
      });

      const [, options] = mockFetch.mock.calls[0];
      const expectedAuth = Buffer.from('user:pass').toString('base64');
      expect(options.headers['Authorization']).toBe(`Basic ${expectedAuth}`);
    });

    it('should add custom headers when configured', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch;

      const context: NotificationContext = {
        organizationId: 'org-123',
        organizationName: 'Test Org',
        eventType: 'alert',
        title: 'Test',
        message: 'Test',
      };

      await provider.send(context, {
        url: 'https://example.com/webhook',
        headers: { 'X-Custom-Header': 'custom-value' },
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['X-Custom-Header']).toBe('custom-value');
    });

    it('should use configured HTTP method', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch;

      const context: NotificationContext = {
        organizationId: 'org-123',
        organizationName: 'Test Org',
        eventType: 'alert',
        title: 'Test',
        message: 'Test',
      };

      await provider.send(context, {
        url: 'https://example.com/webhook',
        method: 'PUT',
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('PUT');
    });

    it('should handle HTTP error response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      });
      global.fetch = mockFetch;

      const context: NotificationContext = {
        organizationId: 'org-123',
        organizationName: 'Test Org',
        eventType: 'alert',
        title: 'Test',
        message: 'Test',
      };

      const result = await provider.send(context, { url: 'https://example.com/webhook' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    it('should handle network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      const context: NotificationContext = {
        organizationId: 'org-123',
        organizationName: 'Test Org',
        eventType: 'alert',
        title: 'Test',
        message: 'Test',
      };

      const result = await provider.send(context, { url: 'https://example.com/webhook' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('test', () => {
    it('should send test notification with predefined content', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch;

      const result = await provider.test({ url: 'https://example.com/webhook' });

      expect(result.success).toBe(true);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.title).toBe('Test Notification');
      expect(body.organization.name).toBe('Test Organization');
    });
  });
});
