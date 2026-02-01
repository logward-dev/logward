/**
 * Script to send test emails to MailHog for preview
 *
 * Usage: npx tsx src/scripts/send-test-emails.ts
 *
 * Make sure MailHog is running (docker compose up mailhog)
 * Then view emails at http://localhost:8025
 */

import nodemailer from 'nodemailer';
import {
  generateAlertEmail,
  generateErrorEmail,
  generateIncidentEmail,
  generateSigmaDetectionEmail,
} from '../lib/email-templates.js';

// MailHog SMTP config
const transporter = nodemailer.createTransport({
  host: 'localhost',
  port: 1025,
  secure: false,
});

async function sendTestEmails() {
  const recipient = 'test@example.com';

  console.log('📧 Sending test emails to MailHog...\n');

  // 1. Alert Email
  console.log('1. Sending Alert email...');
  const alertEmail = generateAlertEmail({
    ruleName: 'High Error Rate - Production API',
    logCount: 156,
    threshold: 100,
    timeWindow: 5,
    service: 'api-gateway',
    levels: ['error', 'critical'],
    organizationName: 'Acme Corporation',
    projectName: 'Production Backend',
  });

  await transporter.sendMail({
    from: 'LogTide <alerts@logtide.dev>',
    to: recipient,
    subject: '[Alert Triggered] High Error Rate - Production API',
    html: alertEmail.html,
    text: alertEmail.text,
  });
  console.log('   ✅ Alert email sent\n');

  // 2. Error Email (New Error)
  console.log('2. Sending New Error email...');
  const newErrorEmail = generateErrorEmail({
    exceptionType: 'TypeError',
    exceptionMessage: "Cannot read properties of undefined (reading 'map'). This error occurred while processing user data in the authentication middleware. The user object was expected to have a 'roles' property but it was undefined.",
    language: 'nodejs',
    service: 'auth-service',
    isNewErrorGroup: true,
    errorGroupId: 'err-abc123',
    organizationName: 'Acme Corporation',
    projectName: 'Auth Microservice',
    fingerprint: 'fp-xyz789',
  });

  await transporter.sendMail({
    from: 'LogTide <errors@logtide.dev>',
    to: recipient,
    subject: '[New Error] TypeError in auth-service',
    html: newErrorEmail.html,
    text: newErrorEmail.text,
  });
  console.log('   ✅ New Error email sent\n');

  // 3. Error Email (Existing Error)
  console.log('3. Sending Existing Error email...');
  const existingErrorEmail = generateErrorEmail({
    exceptionType: 'NullPointerException',
    exceptionMessage: 'Attempt to invoke virtual method on a null object reference at com.example.UserService.getProfile(UserService.java:142)',
    language: 'java',
    service: 'user-service',
    isNewErrorGroup: false,
    errorGroupId: 'err-def456',
    organizationName: 'Acme Corporation',
    projectName: 'Java Backend',
  });

  await transporter.sendMail({
    from: 'LogTide <errors@logtide.dev>',
    to: recipient,
    subject: '[Error] NullPointerException in user-service',
    html: existingErrorEmail.html,
    text: existingErrorEmail.text,
  });
  console.log('   ✅ Existing Error email sent\n');

  // 4. Critical Incident Email
  console.log('4. Sending Critical Incident email...');
  const criticalIncidentEmail = generateIncidentEmail({
    incidentId: 'inc-critical-001',
    title: 'Potential Data Breach Detected',
    description: 'Multiple failed login attempts from suspicious IP addresses detected. Possible brute force attack in progress targeting admin accounts.',
    severity: 'critical',
    affectedServices: ['auth-service', 'user-service', 'admin-portal'],
    organizationName: 'Acme Corporation',
  });

  await transporter.sendMail({
    from: 'LogTide <security@logtide.dev>',
    to: recipient,
    subject: '[Critical] Security Incident: Potential Data Breach Detected',
    html: criticalIncidentEmail.html,
    text: criticalIncidentEmail.text,
  });
  console.log('   ✅ Critical Incident email sent\n');

  // 5. High Severity Incident Email
  console.log('5. Sending High Severity Incident email...');
  const highIncidentEmail = generateIncidentEmail({
    incidentId: 'inc-high-002',
    title: 'SQL Injection Attempt Blocked',
    description: 'Automated security rules detected and blocked SQL injection attempts targeting the search API endpoint.',
    severity: 'high',
    affectedServices: ['search-api'],
    organizationName: 'Acme Corporation',
  });

  await transporter.sendMail({
    from: 'LogTide <security@logtide.dev>',
    to: recipient,
    subject: '[High] Security Incident: SQL Injection Attempt Blocked',
    html: highIncidentEmail.html,
    text: highIncidentEmail.text,
  });
  console.log('   ✅ High Severity Incident email sent\n');

  // 6. Medium Severity Incident Email
  console.log('6. Sending Medium Severity Incident email...');
  const mediumIncidentEmail = generateIncidentEmail({
    incidentId: 'inc-medium-003',
    title: 'Unusual API Traffic Pattern',
    description: 'Detected unusual traffic pattern from a single IP address. May indicate automated scraping or reconnaissance activity.',
    severity: 'medium',
    affectedServices: ['api-gateway', 'rate-limiter'],
    organizationName: 'Acme Corporation',
  });

  await transporter.sendMail({
    from: 'LogTide <security@logtide.dev>',
    to: recipient,
    subject: '[Medium] Security Incident: Unusual API Traffic Pattern',
    html: mediumIncidentEmail.html,
    text: mediumIncidentEmail.text,
  });
  console.log('   ✅ Medium Severity Incident email sent\n');

  // 7. Sigma Detection Email (Critical)
  console.log('7. Sending Critical Sigma Detection email...');
  const criticalSigmaEmail = generateSigmaDetectionEmail({
    ruleTitle: 'Mimikatz Credential Dumping',
    ruleDescription: 'Detects the use of Mimikatz tool for credential harvesting. This is a critical indicator of compromise that requires immediate investigation.',
    severity: 'critical',
    service: 'windows-endpoint-agent',
    organizationName: 'Acme Corporation',
    detectionId: 'det-sigma-001',
    matchedFields: {
      'CommandLine': 'mimikatz.exe "privilege::debug" "sekurlsa::logonpasswords"',
      'User': 'SYSTEM',
      'ParentProcess': 'cmd.exe',
      'TargetHost': 'DC01.acme.local',
    },
  });

  await transporter.sendMail({
    from: 'LogTide <security@logtide.dev>',
    to: recipient,
    subject: '[Critical] Sigma Detection: Mimikatz Credential Dumping',
    html: criticalSigmaEmail.html,
    text: criticalSigmaEmail.text,
  });
  console.log('   ✅ Critical Sigma Detection email sent\n');

  // 8. Sigma Detection Email (High)
  console.log('8. Sending High Sigma Detection email...');
  const highSigmaEmail = generateSigmaDetectionEmail({
    ruleTitle: 'Suspicious PowerShell Execution',
    ruleDescription: 'Detects suspicious PowerShell commands commonly used in attacks, including encoded commands and download cradles.',
    severity: 'high',
    service: 'endpoint-protection',
    organizationName: 'Acme Corporation',
    detectionId: 'det-sigma-002',
    matchedFields: {
      'CommandLine': 'powershell.exe -enc JABjAGwAaQBlAG4AdAAgAD0AIABOAGUAdwAtAE8AYgBqAGUAYwB0',
      'User': 'john.doe',
    },
  });

  await transporter.sendMail({
    from: 'LogTide <security@logtide.dev>',
    to: recipient,
    subject: '[High] Sigma Detection: Suspicious PowerShell Execution',
    html: highSigmaEmail.html,
    text: highSigmaEmail.text,
  });
  console.log('   ✅ High Sigma Detection email sent\n');

  // 9. Sigma Detection Email (Medium - minimal data)
  console.log('9. Sending Medium Sigma Detection email (minimal)...');
  const mediumSigmaEmail = generateSigmaDetectionEmail({
    ruleTitle: 'Outbound Connection to Suspicious Port',
    severity: 'medium',
    service: 'network-monitor',
    organizationName: 'Acme Corporation',
    detectionId: 'det-sigma-003',
  });

  await transporter.sendMail({
    from: 'LogTide <security@logtide.dev>',
    to: recipient,
    subject: '[Medium] Sigma Detection: Outbound Connection to Suspicious Port',
    html: mediumSigmaEmail.html,
    text: mediumSigmaEmail.text,
  });
  console.log('   ✅ Medium Sigma Detection email sent\n');

  console.log('═'.repeat(50));
  console.log('✅ All test emails sent successfully!');
  console.log('');
  console.log('📬 View emails at: http://localhost:8025');
  console.log('═'.repeat(50));
}

sendTestEmails().catch(console.error);
