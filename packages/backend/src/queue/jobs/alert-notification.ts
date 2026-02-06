import { alertsService } from '../../modules/alerts/index.js';
import { notificationsService } from '../../modules/notifications/index.js';
import { notificationChannelsService } from '../../modules/notification-channels/index.js';
import { db } from '../../database/connection.js';
import nodemailer from 'nodemailer';
import { config } from '../../config/index.js';
import { generateAlertEmail, getFrontendUrl } from '../../lib/email-templates.js';
import type { EmailChannelConfig, WebhookChannelConfig } from '@logtide/shared';

export interface AlertNotificationData {
  historyId: string;
  rule_id: string;
  rule_name: string;
  organization_id: string;
  project_id: string | null;
  log_count: number;
  threshold: number;
  time_window: number;
  // Legacy fields (deprecated, use notification_channels instead)
  email_recipients: string[];
  webhook_url?: string;
}

// Create email transporter (reused across notifications)
let emailTransporter: nodemailer.Transporter | null = null;

function getEmailTransporter() {
  if (!emailTransporter) {
    // Check if SMTP is configured
    if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS) {
      console.warn('SMTP not configured - email notifications disabled');
      return null;
    }

    emailTransporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT || 587,
      secure: config.SMTP_SECURE || false, // true for 465, false for other ports
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
    });

    console.log(`Email transporter configured: ${config.SMTP_HOST}:${config.SMTP_PORT}`);
  }

  return emailTransporter;
}

export async function processAlertNotification(job: any) {
  const data: AlertNotificationData = job.data;

  console.log(`Processing alert notification: ${data.rule_name}`);

  const errors: string[] = [];

  try {
    // Get organization details
    const org = await db
      .selectFrom('organizations')
      .select(['name'])
      .where('id', '=', data.organization_id)
      .executeTakeFirst();

    // Get project name if applicable
    let projectName: string | null = null;
    if (data.project_id) {
      const project = await db
        .selectFrom('projects')
        .select(['name'])
        .where('id', '=', data.project_id)
        .executeTakeFirst();
      projectName = project?.name || null;
    }

    // STEP 1: Create in-app notifications for organization members
    try {
      await createInAppNotifications(data, projectName);
      console.log(`In-app notifications created: ${data.rule_name}`);
    } catch (error) {
      const errMsg = `In-app notification failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errMsg);
      errors.push(errMsg);
    }

    // STEP 2: Load notification channels for this alert rule
    const channels = await notificationChannelsService.getAlertRuleChannels(data.rule_id);

    // STEP 3: Collect email recipients from notification channels
    const emailRecipients = new Set<string>();

    // Add email recipients from channels
    channels
      .filter((ch) => ch.type === 'email' && ch.enabled)
      .forEach((ch) => {
        const emailConfig = ch.config as EmailChannelConfig;
        emailConfig.recipients.forEach((email: string) => emailRecipients.add(email));
      });

    // STEP 4: Send emails if there are recipients
    if (emailRecipients.size > 0) {
      try {
        await sendEmailNotification({
          ...data,
          email_recipients: Array.from(emailRecipients),
          organizationName: org?.name,
          projectName,
        });
        console.log(`Email notifications sent: ${data.rule_name} (${emailRecipients.size} recipients)`);
      } catch (error) {
        const errMsg = `Email failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errMsg);
        errors.push(errMsg);
      }
    } else {
      console.log(`No email recipients configured for: ${data.rule_name}`);
    }

    // STEP 5: Collect webhook URLs from notification channels
    const webhookUrls = new Set<string>();

    // Add webhook URLs from channels
    channels
      .filter((ch) => ch.type === 'webhook' && ch.enabled)
      .forEach((ch) => {
        const webhookConfig = ch.config as WebhookChannelConfig;
        webhookUrls.add(webhookConfig.url);
      });

    // STEP 6: Send webhooks
    for (const url of webhookUrls) {
      try {
        await sendWebhookNotification({ ...data, webhook_url: url });
        console.log(`Webhook notification sent: ${data.rule_name} -> ${url}`);
      } catch (error) {
        const errMsg = `Webhook failed (${url}): ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errMsg);
        errors.push(errMsg);
      }
    }

    if (webhookUrls.size === 0) {
      console.log(`No webhook configured for: ${data.rule_name}`);
    }

    // Mark as notified (with errors if any)
    if (errors.length > 0) {
      await alertsService.markAsNotified(data.historyId, errors.join('; '));
    } else {
      await alertsService.markAsNotified(data.historyId);
    }

    console.log(`Alert notification processed: ${data.rule_name}`);
  } catch (error) {
    console.error(`Failed to process alert notification: ${data.rule_name}`, error);
    await alertsService.markAsNotified(
      data.historyId,
      error instanceof Error ? error.message : 'Unknown error'
    );
    throw error;
  }
}

async function sendEmailNotification(data: AlertNotificationData & { organizationName?: string; projectName?: string | null }) {
  const transporter = getEmailTransporter();

  if (!transporter) {
    throw new Error('Email transporter not configured');
  }

  const { html, text } = generateAlertEmail({
    ruleName: data.rule_name,
    logCount: data.log_count,
    threshold: data.threshold,
    timeWindow: data.time_window,
    organizationName: data.organizationName,
    projectName: data.projectName,
    historyId: data.historyId,
  });

  const subject = `[Alert] ${data.rule_name} - ${data.log_count} logs exceeded threshold`;

  await transporter.sendMail({
    from: `"LogTide" <${config.SMTP_FROM || config.SMTP_USER}>`,
    to: data.email_recipients.join(', '),
    subject,
    text,
    html,
  });

  console.log(`Email sent to: ${data.email_recipients.join(', ')}`);
}

async function sendWebhookNotification(data: AlertNotificationData) {
  if (!data.webhook_url) return;

  const frontendUrl = getFrontendUrl();

  const response = await fetch(data.webhook_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'LogTide/1.0',
    },
    body: JSON.stringify({
      event_type: 'alert',
      alert_name: data.rule_name,
      log_count: data.log_count,
      threshold: data.threshold,
      time_window: data.time_window,
      organization_id: data.organization_id,
      project_id: data.project_id,
      link: `${frontendUrl}/dashboard/alerts`,
      timestamp: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Webhook request failed: ${response.statusText}`);
  }

  console.log(`Webhook notification sent to: ${data.webhook_url}`);
}

async function createInAppNotifications(data: AlertNotificationData, projectName: string | null) {
  // Get all members of the organization
  const members = await db
    .selectFrom('organization_members')
    .select(['user_id'])
    .where('organization_id', '=', data.organization_id)
    .execute();

  if (members.length === 0) {
    console.log(`No members found for organization: ${data.organization_id}`);
    return;
  }

  // Create notification for each member
  const notificationPromises = members.map((member) => {
    const title = `Alert Triggered: ${data.rule_name}`;
    const message = projectName
      ? `${data.log_count} logs exceeded threshold of ${data.threshold} in ${data.time_window} minutes for project ${projectName}.`
      : `${data.log_count} logs exceeded threshold of ${data.threshold} in ${data.time_window} minutes.`;

    return notificationsService.createNotification({
      userId: member.user_id,
      type: 'alert',
      title,
      message,
      organizationId: data.organization_id,
      projectId: data.project_id || undefined,
      metadata: {
        alertRuleId: data.rule_id,
        historyId: data.historyId,
        logCount: data.log_count,
        threshold: data.threshold,
        timeWindow: data.time_window,
      },
    });
  });

  await Promise.all(notificationPromises);

  console.log(`Created ${members.length} in-app notification(s) for alert: ${data.rule_name}`);
}
