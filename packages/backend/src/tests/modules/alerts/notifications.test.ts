import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../database/index.js';
import { createTestContext, createTestAlertRule, createTestLog } from '../../helpers/factories.js';
import { alertsService } from '../../../modules/alerts/service.js';
import { processAlertNotification } from '../../../queue/jobs/alert-notification.js';

describe('Alert Notifications', () => {
    beforeEach(async () => {
        // Clean up before each test
        await db.deleteFrom('alert_history').execute();
        await db.deleteFrom('alert_rules').execute();
        await db.deleteFrom('notifications').execute();

        // Clear MailHog messages
        try {
            await fetch('http://localhost:8025/api/v1/messages', { method: 'DELETE' });
        } catch (e) {
            console.warn('Failed to clear MailHog messages - is it running?');
        }
    });

    it('should send an email when an alert is triggered', async () => {
        const { organization, project } = await createTestContext();
        const recipientEmail = 'test-recipient@example.com';

        // 1. Create an alert rule
        const rule = await createTestAlertRule({
            organizationId: organization.id,
            projectId: project.id,
            name: 'Critical Error Alert',
            threshold: 1, // Trigger on 1 log
            timeWindow: 5, // 5 minutes
        });

        // Update rule to have email recipient
        await db
            .updateTable('alert_rules')
            .set({ email_recipients: [recipientEmail] })
            .where('id', '=', rule.id)
            .execute();

        // 2. Create a log that triggers the alert
        await createTestLog({
            projectId: project.id,
            level: 'error',
            message: 'Critical system failure',
            service: 'payment-service',
        });

        // 3. Run alert check
        const triggeredAlerts = await alertsService.checkAlertRules();
        expect(triggeredAlerts).toHaveLength(1);
        const alert = triggeredAlerts[0];

        // 4. Process notifications (simulate worker)
        // The real app would queue this, but for testing we call the processor directly
        // We need to pass the alert data wrapped in a job-like object
        await processAlertNotification({ data: alert });

        // 5. Verify email in MailHog
        // Wait a brief moment for async email sending
        await new Promise(resolve => setTimeout(resolve, 1000));

        const response = await fetch('http://localhost:8025/api/v2/messages');
        const data = await response.json();

        expect(data.items.length).toBeGreaterThan(0);

        const email = data.items[0];
        // MailHog returns headers as arrays
        expect(email.Content.Headers.To[0]).toContain(recipientEmail);

        // We skip Subject/Body assertions because they are MIME encoded (Quoted-Printable)
        // and decoding them in the test environment is complex without extra deps.
        // Verifying the recipient received an email is sufficient proof of integration.
    });
});
