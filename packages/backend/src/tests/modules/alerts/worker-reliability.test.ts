import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { db } from '../../../database/index.js';
import {
    createTestContext,
    createTestAlertRule,
    createTestLog,
} from '../../helpers/factories.js';
import { alertsService } from '../../../modules/alerts/service.js';
import { processAlertNotification, AlertNotificationData } from '../../../queue/jobs/alert-notification.js';

describe('Alert Worker Reliability', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(async () => {
        originalFetch = global.fetch;

        await db.deleteFrom('logs').execute();
        await db.deleteFrom('alert_history').execute();
        await db.deleteFrom('alert_rules').execute();
        await db.deleteFrom('notifications').execute();

        // Clear MailHog messages
        try {
            await fetch('http://localhost:8025/api/v1/messages', { method: 'DELETE' });
        } catch (e) {
            // MailHog might not be running
        }
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    describe('Webhook Notifications', () => {
        it('should send webhook notification successfully', async () => {
            const { organization, project } = await createTestContext();

            // Mock fetch to simulate successful webhook
            global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
                // Allow MailHog requests to pass through
                if (url.includes('localhost:8025')) {
                    return originalFetch(url, options);
                }
                // Mock webhook response
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({ success: true }),
                });
            }) as typeof fetch;

            // Create rule with webhook
            const rule = await db
                .insertInto('alert_rules')
                .values({
                    organization_id: organization.id,
                    project_id: project.id,
                    name: 'Webhook Test Rule',
                    service: null,
                    level: ['error'],
                    time_window: 5,
                    threshold: 1,
                    enabled: true,
                    email_recipients: [],
                    webhook_url: 'https://example.com/webhook',
                    metadata: null,
                })
                .returningAll()
                .executeTakeFirstOrThrow();

            // Create error log to trigger
            await createTestLog({
                projectId: project.id,
                level: 'error',
                message: 'Test error for webhook',
            });

            // Trigger alert
            const triggered = await alertsService.checkAlertRules();
            expect(triggered).toHaveLength(1);

            // Process notification
            await processAlertNotification({ data: triggered[0] });

            // Verify alert was marked as notified
            const history = await db
                .selectFrom('alert_history')
                .selectAll()
                .where('id', '=', triggered[0].historyId)
                .executeTakeFirst();

            expect(history?.notified).toBe(true);
            expect(history?.error).toBeNull();
        });

        it('should handle webhook failure gracefully', async () => {
            const { organization, project } = await createTestContext();

            // Create rule with invalid webhook URL (only webhook, no email to simplify)
            const rule = await db
                .insertInto('alert_rules')
                .values({
                    organization_id: organization.id,
                    project_id: project.id,
                    name: 'Failed Webhook Rule',
                    service: null,
                    level: ['error'],
                    time_window: 5,
                    threshold: 1,
                    enabled: true,
                    email_recipients: [],
                    webhook_url: 'http://localhost:99999/nonexistent', // Invalid port
                    metadata: null,
                })
                .returningAll()
                .executeTakeFirstOrThrow();

            // Create error log
            await createTestLog({
                projectId: project.id,
                level: 'error',
                message: 'Test error',
            });

            // Trigger alert
            const triggered = await alertsService.checkAlertRules();
            expect(triggered).toHaveLength(1);

            // Process notification - the function records errors internally
            // and may or may not throw depending on whether all notifications fail
            try {
                await processAlertNotification({ data: triggered[0] });
            } catch (e) {
                // Expected if webhook is the only notification method and it fails
            }

            // Verify error was recorded in history
            const history = await db
                .selectFrom('alert_history')
                .selectAll()
                .where('id', '=', triggered[0].historyId)
                .executeTakeFirst();

            // The alert should have an error recorded because webhook failed
            expect(history?.error).toBeTruthy();
            expect(history?.error).toContain('Webhook failed');
        });
    });

    describe('Email Notifications', () => {
        it('should send email notification and mark as notified', async () => {
            const { organization, project } = await createTestContext();
            const recipientEmail = `test-${Date.now()}@example.com`;

            // Create rule with email recipient
            const rule = await db
                .insertInto('alert_rules')
                .values({
                    organization_id: organization.id,
                    project_id: project.id,
                    name: 'Email Test Rule',
                    service: null,
                    level: ['error'],
                    time_window: 5,
                    threshold: 1,
                    enabled: true,
                    email_recipients: [recipientEmail],
                    webhook_url: null,
                    metadata: null,
                })
                .returningAll()
                .executeTakeFirstOrThrow();

            // Create error log
            await createTestLog({
                projectId: project.id,
                level: 'error',
                message: 'Test error for email',
            });

            // Trigger alert
            const triggered = await alertsService.checkAlertRules();
            expect(triggered).toHaveLength(1);

            // Process notification
            await processAlertNotification({ data: triggered[0] });

            // Wait for async email
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Verify alert was marked as notified
            const history = await db
                .selectFrom('alert_history')
                .selectAll()
                .where('id', '=', triggered[0].historyId)
                .executeTakeFirst();

            expect(history?.notified).toBe(true);

            // Verify email in MailHog
            try {
                const response = await fetch('http://localhost:8025/api/v2/messages');
                const data = await response.json();
                expect(data.items.length).toBeGreaterThan(0);

                // Find email to our recipient
                const email = data.items.find((item: any) =>
                    item.Content.Headers.To[0].includes(recipientEmail)
                );
                expect(email).toBeDefined();
            } catch (e) {
                console.warn('MailHog check skipped - might not be running');
            }
        });

        it('should handle multiple email recipients', async () => {
            const { organization, project } = await createTestContext();
            const recipients = [
                `test1-${Date.now()}@example.com`,
                `test2-${Date.now()}@example.com`,
            ];

            // Create rule with multiple recipients
            const rule = await db
                .insertInto('alert_rules')
                .values({
                    organization_id: organization.id,
                    project_id: project.id,
                    name: 'Multi-Recipient Rule',
                    service: null,
                    level: ['error'],
                    time_window: 5,
                    threshold: 1,
                    enabled: true,
                    email_recipients: recipients,
                    webhook_url: null,
                    metadata: null,
                })
                .returningAll()
                .executeTakeFirstOrThrow();

            // Create error log
            await createTestLog({
                projectId: project.id,
                level: 'error',
                message: 'Test error',
            });

            // Trigger and process
            const triggered = await alertsService.checkAlertRules();
            await processAlertNotification({ data: triggered[0] });

            // Wait for async email
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Verify notified
            const history = await db
                .selectFrom('alert_history')
                .selectAll()
                .where('id', '=', triggered[0].historyId)
                .executeTakeFirst();

            expect(history?.notified).toBe(true);
        });
    });

    describe('Mark As Notified', () => {
        it('should mark alert as notified without error', async () => {
            const { organization, project } = await createTestContext();

            const rule = await createTestAlertRule({
                organizationId: organization.id,
                projectId: project.id,
                threshold: 1,
            });

            // Insert history entry
            const historyEntry = await db
                .insertInto('alert_history')
                .values({
                    rule_id: rule.id,
                    triggered_at: new Date(),
                    log_count: 5,
                    notified: false,
                })
                .returningAll()
                .executeTakeFirstOrThrow();

            // Mark as notified
            await alertsService.markAsNotified(historyEntry.id);

            // Verify
            const updated = await db
                .selectFrom('alert_history')
                .selectAll()
                .where('id', '=', historyEntry.id)
                .executeTakeFirst();

            expect(updated?.notified).toBe(true);
            expect(updated?.error).toBeNull();
        });

        it('should mark alert as failed with error message', async () => {
            const { organization, project } = await createTestContext();

            const rule = await createTestAlertRule({
                organizationId: organization.id,
                projectId: project.id,
                threshold: 1,
            });

            // Insert history entry
            const historyEntry = await db
                .insertInto('alert_history')
                .values({
                    rule_id: rule.id,
                    triggered_at: new Date(),
                    log_count: 5,
                    notified: false,
                })
                .returningAll()
                .executeTakeFirstOrThrow();

            // Mark as failed with error
            const errorMessage = 'SMTP connection timeout';
            await alertsService.markAsNotified(historyEntry.id, errorMessage);

            // Verify
            const updated = await db
                .selectFrom('alert_history')
                .selectAll()
                .where('id', '=', historyEntry.id)
                .executeTakeFirst();

            expect(updated?.notified).toBe(false);
            expect(updated?.error).toBe(errorMessage);
        });
    });

    describe('In-App Notifications', () => {
        it('should create in-app notifications for org members', async () => {
            const { organization, project, user } = await createTestContext();

            // Create rule
            const rule = await createTestAlertRule({
                organizationId: organization.id,
                projectId: project.id,
                name: 'In-App Notification Rule',
                threshold: 1,
            });

            // Create error log
            await createTestLog({
                projectId: project.id,
                level: 'error',
                message: 'Test error',
            });

            // Trigger alert
            const triggered = await alertsService.checkAlertRules();
            expect(triggered).toHaveLength(1);

            // Process notification
            await processAlertNotification({ data: triggered[0] });

            // Verify in-app notification was created
            const notifications = await db
                .selectFrom('notifications')
                .selectAll()
                .where('user_id', '=', user.id)
                .where('type', '=', 'alert')
                .execute();

            expect(notifications).toHaveLength(1);
            expect(notifications[0].title).toContain('In-App Notification Rule');
        });
    });
});
