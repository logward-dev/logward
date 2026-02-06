/**
 * Centralized Email Templates
 *
 * All email templates use inline styles for maximum compatibility with email clients.
 * Gmail, Outlook, Apple Mail, etc. all have different CSS support.
 */

import { config } from '../config/index.js';
import { getLogoUrl } from './logo.js';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the frontend URL from config, with a sensible fallback.
 * In production, FRONTEND_URL should always be set.
 */
export function getFrontendUrl(): string {
  if (config.FRONTEND_URL) {
    return config.FRONTEND_URL.replace(/\/$/, ''); // Remove trailing slash
  }

  // Log warning in production if FRONTEND_URL is not set
  if (config.NODE_ENV === 'production') {
    console.warn('[Email] FRONTEND_URL not set in production - email links will be broken');
  }

  return 'http://localhost:5173';
}

/**
 * Format a date for display in emails
 */
export function formatEmailDate(date: Date = new Date()): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * Escape HTML to prevent XSS in email content
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// ============================================================================
// SHARED STYLES
// ============================================================================

const colors = {
  background: '#f4f4f5',
  cardBg: '#ffffff',
  text: '#18181b',
  textMuted: '#71717a',
  textLight: '#a1a1aa',
  border: '#e4e4e7',
  primary: '#18181b',
  error: '#dc2626',
  errorBg: '#fef2f2',
  warning: '#ca8a04',
  warningBg: '#fefce8',
  success: '#16a34a',
  successBg: '#f0fdf4',
  info: '#2563eb',
  infoBg: '#eff6ff',
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
  informational: '#6b7280',
};

// ============================================================================
// BASE TEMPLATE
// ============================================================================

interface BaseEmailOptions {
  preheader?: string; // Preview text shown in email clients
}

function baseTemplate(content: string, options: BaseEmailOptions = {}): string {
  const { preheader } = options;
  const frontendUrl = getFrontendUrl();
  const logoUrl = getLogoUrl();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>LogTide Notification</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; width: 100%; background-color: ${colors.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  ${preheader ? `<div style="display: none; max-height: 0; overflow: hidden;">${escapeHtml(preheader)}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${colors.background};">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding: 0 0 24px;">
              <a href="${frontendUrl}" style="text-decoration: none;">
                <img src="${logoUrl}" alt="LogTide" width="140" height="auto" style="display: block; max-width: 140px; height: auto;" />
              </a>
            </td>
          </tr>
          ${content}
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 0; text-align: center;">
              <p style="margin: 0 0 8px; font-size: 12px; color: ${colors.textLight};">
                Sent by <a href="${frontendUrl}" style="color: ${colors.textMuted}; text-decoration: none;">LogTide</a>
              </p>
              <p style="margin: 0; font-size: 11px; color: ${colors.textLight};">
                <a href="${frontendUrl}/dashboard/settings/channels" style="color: ${colors.textMuted}; text-decoration: underline;">Manage notification settings</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ============================================================================
// COMPONENTS
// ============================================================================

function card(content: string): string {
  return `<tr>
    <td style="background-color: ${colors.cardBg}; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
      ${content}
    </td>
  </tr>`;
}

function header(title: string, badge?: { text: string; color: string }): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding: 24px 24px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align: middle;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: ${colors.text}; line-height: 1.3;">
                ${escapeHtml(title)}
              </h1>
            </td>
            ${badge ? `<td align="right" style="vertical-align: middle;">
              <span style="display: inline-block; padding: 4px 10px; background-color: ${badge.color}; color: white; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                ${escapeHtml(badge.text)}
              </span>
            </td>` : ''}
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

function divider(): string {
  return `<tr><td style="padding: 0 24px;"><hr style="border: none; border-top: 1px solid ${colors.border}; margin: 0;"></td></tr>`;
}

function infoRow(label: string, value: string, isCode = false): string {
  const valueStyle = isCode
    ? `font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace; font-size: 13px; background-color: ${colors.background}; padding: 2px 6px; border-radius: 4px;`
    : '';

  return `<tr>
    <td style="padding: 8px 0;">
      <span style="font-size: 12px; color: ${colors.textMuted}; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(label)}</span><br>
      <span style="font-size: 14px; color: ${colors.text}; font-weight: 500; ${valueStyle}">${escapeHtml(value)}</span>
    </td>
  </tr>`;
}

function infoBox(rows: Array<{ label: string; value: string; isCode?: boolean }>): string {
  return `<tr>
    <td style="padding: 16px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${colors.background}; border-radius: 8px;">
        <tr>
          <td style="padding: 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${rows.map(r => infoRow(r.label, r.value, r.isCode)).join('')}
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function alertBox(message: string, type: 'error' | 'warning' | 'success' | 'info' = 'error'): string {
  const bgColors = {
    error: colors.errorBg,
    warning: colors.warningBg,
    success: colors.successBg,
    info: colors.infoBg,
  };
  const borderColors = {
    error: colors.error,
    warning: colors.warning,
    success: colors.success,
    info: colors.info,
  };

  return `<tr>
    <td style="padding: 0 24px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${bgColors[type]}; border-left: 4px solid ${borderColors[type]}; border-radius: 4px;">
        <tr>
          <td style="padding: 12px 16px; font-size: 14px; color: ${colors.text}; line-height: 1.5;">
            ${message}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function cta(text: string, url: string): string {
  return `<tr>
    <td style="padding: 8px 24px 24px;" align="center">
      <a href="${url}" style="display: inline-block; padding: 12px 24px; background-color: ${colors.primary}; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
        ${escapeHtml(text)}
      </a>
    </td>
  </tr>`;
}

function codeBlock(code: string): string {
  return `<tr>
    <td style="padding: 0 24px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #1e1e1e; border-radius: 8px;">
        <tr>
          <td style="padding: 16px; font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace; font-size: 13px; color: #d4d4d4; line-height: 1.5; white-space: pre-wrap; word-break: break-word;">
            ${escapeHtml(code)}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function subtitle(text: string): string {
  return `<tr>
    <td style="padding: 16px 24px 8px;">
      <p style="margin: 0; font-size: 14px; color: ${colors.textMuted}; line-height: 1.5;">
        ${escapeHtml(text)}
      </p>
    </td>
  </tr>`;
}

function timestamp(): string {
  return `<tr>
    <td style="padding: 0 24px 8px;">
      <p style="margin: 0; font-size: 12px; color: ${colors.textLight};">
        ${formatEmailDate()}
      </p>
    </td>
  </tr>`;
}

// ============================================================================
// ALERT NOTIFICATION EMAIL
// ============================================================================

export interface AlertEmailData {
  ruleName: string;
  logCount: number;
  threshold: number;
  timeWindow: number;
  service?: string | null;
  levels?: string[];
  organizationName?: string;
  projectName?: string | null;
  historyId?: string;
}

export function generateAlertEmail(data: AlertEmailData): { html: string; text: string } {
  const frontendUrl = getFrontendUrl();
  const dashboardUrl = `${frontendUrl}/dashboard/alerts`;

  const html = baseTemplate(
    card(`
      ${header(`Alert: ${data.ruleName}`, { text: 'Triggered', color: colors.error })}
      ${divider()}
      ${subtitle(`Your alert threshold was exceeded.`)}
      ${timestamp()}
      ${alertBox(
        `<strong>${data.logCount.toLocaleString()}</strong> logs matched in the last <strong>${data.timeWindow}</strong> minute${data.timeWindow > 1 ? 's' : ''}, exceeding your threshold of <strong>${data.threshold.toLocaleString()}</strong>.`,
        'error'
      )}
      ${infoBox([
        { label: 'Rule Name', value: data.ruleName },
        ...(data.service ? [{ label: 'Service Filter', value: data.service, isCode: true }] : []),
        ...(data.levels?.length ? [{ label: 'Log Levels', value: data.levels.join(', ') }] : []),
        ...(data.organizationName ? [{ label: 'Organization', value: data.organizationName }] : []),
        ...(data.projectName ? [{ label: 'Project', value: data.projectName }] : []),
      ])}
      ${cta('View Alert History', dashboardUrl)}
    `),
    { preheader: `${data.logCount} logs exceeded threshold of ${data.threshold} for "${data.ruleName}"` }
  );

  const text = `
ALERT TRIGGERED: ${data.ruleName}
${'='.repeat(50)}

${data.logCount.toLocaleString()} logs matched in the last ${data.timeWindow} minute${data.timeWindow > 1 ? 's' : ''}, exceeding your threshold of ${data.threshold.toLocaleString()}.

DETAILS
-------
Rule Name: ${data.ruleName}
${data.service ? `Service: ${data.service}` : ''}
${data.levels?.length ? `Log Levels: ${data.levels.join(', ')}` : ''}
${data.organizationName ? `Organization: ${data.organizationName}` : ''}
${data.projectName ? `Project: ${data.projectName}` : ''}

Triggered: ${formatEmailDate()}

View details: ${dashboardUrl}

--
Sent by LogTide
Manage notifications: ${frontendUrl}/dashboard/settings/channels
`.trim();

  return { html, text };
}

// ============================================================================
// ERROR NOTIFICATION EMAIL
// ============================================================================

export interface ErrorEmailData {
  exceptionType: string;
  exceptionMessage?: string | null;
  language: string;
  service: string;
  isNewErrorGroup: boolean;
  errorGroupId: string;
  organizationName: string;
  projectName: string;
  fingerprint?: string;
}

const languageLabels: Record<string, string> = {
  nodejs: 'Node.js',
  python: 'Python',
  java: 'Java',
  go: 'Go',
  php: 'PHP',
  kotlin: 'Kotlin',
  csharp: 'C#',
  rust: 'Rust',
  ruby: 'Ruby',
  unknown: 'Unknown',
};

export function generateErrorEmail(data: ErrorEmailData): { html: string; text: string } {
  const frontendUrl = getFrontendUrl();
  const errorUrl = `${frontendUrl}/dashboard/errors/${data.errorGroupId}`;
  const languageLabel = languageLabels[data.language] || data.language;

  const title = data.isNewErrorGroup
    ? `New Error: ${data.exceptionType}`
    : `Error: ${data.exceptionType}`;

  const html = baseTemplate(
    card(`
      ${header(title, { text: languageLabel, color: colors.error })}
      ${divider()}
      ${data.exceptionMessage ? subtitle(truncate(data.exceptionMessage, 200)) : ''}
      ${timestamp()}
      ${data.exceptionMessage ? codeBlock(truncate(data.exceptionMessage, 500)) : ''}
      ${infoBox([
        { label: 'Exception Type', value: data.exceptionType, isCode: true },
        { label: 'Service', value: data.service, isCode: true },
        { label: 'Language', value: languageLabel },
        { label: 'Organization', value: data.organizationName },
        { label: 'Project', value: data.projectName },
      ])}
      ${data.isNewErrorGroup ? alertBox('This is a <strong>new error</strong> that hasn\'t been seen before.', 'warning') : ''}
      ${cta('View Error Details', errorUrl)}
    `),
    { preheader: `${data.isNewErrorGroup ? 'New ' : ''}${data.exceptionType} in ${data.service}` }
  );

  const text = `
${data.isNewErrorGroup ? 'NEW ' : ''}ERROR: ${data.exceptionType}
${'='.repeat(50)}

${data.exceptionMessage ? `Message: ${truncate(data.exceptionMessage, 300)}` : ''}

DETAILS
-------
Exception Type: ${data.exceptionType}
Service: ${data.service}
Language: ${languageLabel}
Organization: ${data.organizationName}
Project: ${data.projectName}

Occurred: ${formatEmailDate()}

View details: ${errorUrl}

--
Sent by LogTide
Manage notifications: ${frontendUrl}/dashboard/settings/channels
`.trim();

  return { html, text };
}

// ============================================================================
// INCIDENT NOTIFICATION EMAIL
// ============================================================================

export interface IncidentEmailData {
  incidentId: string;
  title: string;
  description?: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  affectedServices?: string[] | null;
  organizationName: string;
}

const severityColors: Record<string, string> = {
  critical: colors.critical,
  high: colors.high,
  medium: colors.medium,
  low: colors.low,
  informational: colors.informational,
};

const severityLabels: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Info',
};

export function generateIncidentEmail(data: IncidentEmailData): { html: string; text: string } {
  const frontendUrl = getFrontendUrl();
  const incidentUrl = `${frontendUrl}/dashboard/security/incidents/${data.incidentId}`;
  const severityColor = severityColors[data.severity] || colors.informational;
  const severityLabel = severityLabels[data.severity] || data.severity;

  const html = baseTemplate(
    card(`
      ${header(`Security Incident: ${data.title}`, { text: severityLabel, color: severityColor })}
      ${divider()}
      ${data.description ? subtitle(truncate(data.description, 200)) : ''}
      ${timestamp()}
      ${(data.severity === 'critical' || data.severity === 'high') ?
        alertBox('This incident requires <strong>immediate attention</strong>.', data.severity === 'critical' ? 'error' : 'warning')
        : ''
      }
      ${infoBox([
        { label: 'Incident', value: data.title },
        { label: 'Severity', value: severityLabel },
        { label: 'Organization', value: data.organizationName },
        ...(data.affectedServices?.length ? [{ label: 'Affected Services', value: data.affectedServices.join(', '), isCode: true }] : []),
      ])}
      ${cta('View Incident', incidentUrl)}
    `),
    { preheader: `[${severityLabel}] ${data.title}` }
  );

  const text = `
SECURITY INCIDENT: ${data.title}
${'='.repeat(50)}
Severity: ${severityLabel.toUpperCase()}

${data.description || ''}

DETAILS
-------
Organization: ${data.organizationName}
${data.affectedServices?.length ? `Affected Services: ${data.affectedServices.join(', ')}` : ''}

Detected: ${formatEmailDate()}

View details: ${incidentUrl}

--
Sent by LogTide
Manage notifications: ${frontendUrl}/dashboard/settings/channels
`.trim();

  return { html, text };
}

// ============================================================================
// SIGMA DETECTION EMAIL
// ============================================================================

export interface SigmaDetectionEmailData {
  ruleTitle: string;
  ruleDescription?: string | null;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  service: string;
  matchedFields?: Record<string, unknown>;
  organizationName: string;
  detectionId: string;
}

export function generateSigmaDetectionEmail(data: SigmaDetectionEmailData): { html: string; text: string } {
  const frontendUrl = getFrontendUrl();
  const detectionUrl = `${frontendUrl}/dashboard/security`;
  const severityColor = severityColors[data.severity] || colors.informational;
  const severityLabel = severityLabels[data.severity] || data.severity;

  const html = baseTemplate(
    card(`
      ${header(`Detection: ${data.ruleTitle}`, { text: severityLabel, color: severityColor })}
      ${divider()}
      ${data.ruleDescription ? subtitle(truncate(data.ruleDescription, 200)) : ''}
      ${timestamp()}
      ${(data.severity === 'critical' || data.severity === 'high') ?
        alertBox('A Sigma rule has detected potentially <strong>malicious activity</strong>.', data.severity === 'critical' ? 'error' : 'warning')
        : ''
      }
      ${infoBox([
        { label: 'Rule', value: data.ruleTitle },
        { label: 'Severity', value: severityLabel },
        { label: 'Service', value: data.service, isCode: true },
        { label: 'Organization', value: data.organizationName },
      ])}
      ${data.matchedFields && Object.keys(data.matchedFields).length > 0 ?
        codeBlock(JSON.stringify(data.matchedFields, null, 2))
        : ''
      }
      ${cta('View in Security Dashboard', detectionUrl)}
    `),
    { preheader: `[${severityLabel}] Sigma detection: ${data.ruleTitle}` }
  );

  const text = `
SIGMA DETECTION: ${data.ruleTitle}
${'='.repeat(50)}
Severity: ${severityLabel.toUpperCase()}

${data.ruleDescription || ''}

DETAILS
-------
Service: ${data.service}
Organization: ${data.organizationName}
${data.matchedFields ? `Matched: ${JSON.stringify(data.matchedFields)}` : ''}

Detected: ${formatEmailDate()}

View details: ${detectionUrl}

--
Sent by LogTide
Manage notifications: ${frontendUrl}/dashboard/settings/channels
`.trim();

  return { html, text };
}

// ============================================================================
// INVITATION EMAIL
// ============================================================================

export interface InvitationEmailData {
  email: string;
  token: string;
  organizationName: string;
  inviterName: string;
  role: string;
}

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

export function generateInvitationEmail(data: InvitationEmailData): { html: string; text: string } {
  const frontendUrl = getFrontendUrl();
  const inviteUrl = `${frontendUrl}/invite/${data.token}`;
  const roleLabel = roleLabels[data.role] || data.role;

  const html = baseTemplate(
    card(`
      ${header(`Join ${data.organizationName}`, { text: 'Invitation', color: colors.info })}
      ${divider()}
      ${subtitle(`${data.inviterName} has invited you to join their organization on LogTide.`)}
      ${alertBox(`You've been invited as <strong>${roleLabel}</strong>. This invitation expires in 7 days.`, 'info')}
      ${infoBox([
        { label: 'Organization', value: data.organizationName },
        { label: 'Invited By', value: data.inviterName },
        { label: 'Role', value: roleLabel },
        { label: 'Email', value: data.email },
      ])}
      ${cta('Accept Invitation', inviteUrl)}
    `),
    { preheader: `${data.inviterName} invited you to join ${data.organizationName}` }
  );

  const text = `
INVITATION: Join ${data.organizationName}
${'='.repeat(50)}

${data.inviterName} has invited you to join ${data.organizationName} on LogTide as a ${roleLabel}.

DETAILS
-------
Organization: ${data.organizationName}
Invited By: ${data.inviterName}
Role: ${roleLabel}
Email: ${data.email}

This invitation expires in 7 days.

Accept invitation: ${inviteUrl}

--
Sent by LogTide
`.trim();

  return { html, text };
}
