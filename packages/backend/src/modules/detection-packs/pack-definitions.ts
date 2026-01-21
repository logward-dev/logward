import type { DetectionPack } from './types.js';

/**
 * Startup Reliability Pack
 * Essential monitoring for production web applications
 */
const startupReliabilityPack: DetectionPack = {
  id: 'startup-reliability',
  name: 'Startup Reliability Pack',
  description: 'Essential alerts for production web applications. Monitors error rates, performance degradation, and infrastructure health.',
  category: 'reliability',
  icon: 'rocket',
  rules: [
    {
      id: 'high-error-rate',
      name: 'High Error Rate',
      description: 'Detects sudden spikes in application errors. Triggers when error count exceeds threshold.',
      service: null,
      level: ['error', 'critical'],
      threshold: 50,
      timeWindow: 5,
    },
    {
      id: 'critical-errors',
      name: 'Critical Errors',
      description: 'Alerts on any critical-level errors that require immediate attention.',
      service: null,
      level: ['critical'],
      threshold: 5,
      timeWindow: 5,
    },
    {
      id: 'oom-crashes',
      name: 'Out of Memory Crashes',
      description: 'Detects out-of-memory errors and memory exhaustion patterns.',
      service: null,
      level: ['error', 'critical'],
      threshold: 3,
      timeWindow: 10,
    },
    {
      id: 'db-connection-errors',
      name: 'Database Connection Errors',
      description: 'Monitors database connection failures and pool exhaustion.',
      service: null,
      level: ['error', 'critical'],
      threshold: 10,
      timeWindow: 5,
    },
    {
      id: 'queue-processing-delays',
      name: 'Queue Processing Delays',
      description: 'Alerts when background job processing encounters errors.',
      service: null,
      level: ['error', 'warn'],
      threshold: 20,
      timeWindow: 10,
    },
  ],
};

/**
 * Auth & Security Pack
 * Security-focused alerts for authentication and access control
 */
const authSecurityPack: DetectionPack = {
  id: 'auth-security',
  name: 'Auth & Security Pack',
  description: 'Security monitoring for authentication systems. Detects brute force attempts, suspicious patterns, and access anomalies.',
  category: 'security',
  icon: 'shield',
  rules: [
    {
      id: 'failed-login-spike',
      name: 'Failed Login Spike',
      description: 'Detects potential brute force attacks via sudden increase in failed logins.',
      service: null,
      level: ['warn', 'error'],
      threshold: 50,
      timeWindow: 5,
    },
    {
      id: 'auth-errors',
      name: 'Authentication Errors',
      description: 'Monitors authentication-related errors and failures.',
      service: null,
      level: ['error'],
      threshold: 20,
      timeWindow: 5,
    },
    {
      id: 'rate-limit-triggers',
      name: 'Rate Limit Triggers',
      description: 'Alerts when rate limiting is being triggered frequently.',
      service: null,
      level: ['warn'],
      threshold: 100,
      timeWindow: 10,
    },
    {
      id: 'session-anomalies',
      name: 'Session Anomalies',
      description: 'Detects unusual session patterns like rapid session creation/destruction.',
      service: null,
      level: ['warn', 'error'],
      threshold: 30,
      timeWindow: 5,
    },
    {
      id: 'privilege-escalation',
      name: 'Privilege Escalation Attempts',
      description: 'Monitors for unauthorized access attempts to admin or elevated resources.',
      service: null,
      level: ['error', 'critical'],
      threshold: 5,
      timeWindow: 10,
    },
  ],
};

/**
 * Database Health Pack
 * Database performance and reliability monitoring
 */
const databaseHealthPack: DetectionPack = {
  id: 'database-health',
  name: 'Database Health Pack',
  description: 'Database monitoring for query performance, connection health, and data integrity issues.',
  category: 'database',
  icon: 'database',
  rules: [
    {
      id: 'slow-queries-warning',
      name: 'Slow Queries (Warning)',
      description: 'Detects queries taking longer than 1 second.',
      service: null,
      level: ['warn'],
      threshold: 20,
      timeWindow: 5,
    },
    {
      id: 'slow-queries-critical',
      name: 'Slow Queries (Critical)',
      description: 'Alerts on queries taking longer than 5 seconds.',
      service: null,
      level: ['error'],
      threshold: 5,
      timeWindow: 5,
    },
    {
      id: 'connection-pool-warnings',
      name: 'Connection Pool Warnings',
      description: 'Monitors connection pool exhaustion and timeout warnings.',
      service: null,
      level: ['warn', 'error'],
      threshold: 10,
      timeWindow: 5,
    },
    {
      id: 'deadlock-detection',
      name: 'Deadlock Detection',
      description: 'Alerts on database deadlock occurrences.',
      service: null,
      level: ['error', 'critical'],
      threshold: 3,
      timeWindow: 10,
    },
    {
      id: 'replication-lag',
      name: 'Replication Lag',
      description: 'Monitors database replication lag warnings.',
      service: null,
      level: ['warn', 'error'],
      threshold: 5,
      timeWindow: 5,
    },
  ],
};

/**
 * Payment & Billing Pack
 * Payment gateway and financial transaction monitoring
 */
const paymentBillingPack: DetectionPack = {
  id: 'payment-billing',
  name: 'Payment & Billing Pack',
  description: 'Payment system monitoring for transaction errors, webhook failures, and billing anomalies.',
  category: 'business',
  icon: 'credit-card',
  rules: [
    {
      id: 'payment-errors',
      name: 'Payment Errors',
      description: 'Monitors payment processing failures and transaction errors.',
      service: null,
      level: ['error', 'critical'],
      threshold: 5,
      timeWindow: 5,
    },
    {
      id: 'webhook-failures',
      name: 'Webhook Delivery Failures',
      description: 'Detects failed webhook deliveries from payment providers.',
      service: null,
      level: ['error'],
      threshold: 10,
      timeWindow: 10,
    },
    {
      id: 'transaction-timeouts',
      name: 'Transaction Timeouts',
      description: 'Alerts on payment transactions timing out.',
      service: null,
      level: ['error', 'warn'],
      threshold: 5,
      timeWindow: 5,
    },
    {
      id: 'refund-chargeback-spike',
      name: 'Refund/Chargeback Spike',
      description: 'Monitors unusual increases in refunds or chargebacks.',
      service: null,
      level: ['warn', 'error'],
      threshold: 10,
      timeWindow: 30,
    },
    {
      id: 'billing-anomalies',
      name: 'Billing Anomalies',
      description: 'Detects unusual billing-related errors or patterns.',
      service: null,
      level: ['warn', 'error'],
      threshold: 15,
      timeWindow: 15,
    },
  ],
};

/**
 * All available detection packs
 */
export const DETECTION_PACKS: DetectionPack[] = [
  startupReliabilityPack,
  authSecurityPack,
  databaseHealthPack,
  paymentBillingPack,
];

/**
 * Get pack by ID
 */
export function getPackById(packId: string): DetectionPack | undefined {
  return DETECTION_PACKS.find((p) => p.id === packId);
}

/**
 * Get all pack IDs
 */
export function getPackIds(): string[] {
  return DETECTION_PACKS.map((p) => p.id);
}
