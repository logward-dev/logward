/**
 * Seed script for generating massive test data (30M+ records)
 * Uses PostgreSQL generate_series for maximum performance
 *
 * Usage: npx tsx src/scripts/seed-massive-data.ts
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root BEFORE importing db
const envPath = resolve(__dirname, '../../../../.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });
console.log('DATABASE_URL:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':****@'));

// Dynamic import AFTER dotenv.config to ensure env vars are loaded
const { db } = await import('../database/index.js');
const { sql } = await import('kysely');

const BATCH_SIZE = 500_000; // Insert 500k at a time (indexes disabled)
const TOTAL_LOGS = 30_000_000;
const TOTAL_SPANS = 1_000_000;
const TOTAL_DETECTION_EVENTS = 100_000;

// Target organization ID (hardcoded for performance testing)
const TARGET_ORG_ID = '8d735a5e-61f9-47cb-b3cc-7ffc70a57c5b';

async function getTestProjectId(): Promise<{ projectId: string; organizationId: string }> {
  const org = await db
    .selectFrom('organizations')
    .select(['id'])
    .where('id', '=', TARGET_ORG_ID)
    .executeTakeFirst();

  if (!org) {
    throw new Error(`Organization ${TARGET_ORG_ID} not found.`);
  }

  const project = await db
    .selectFrom('projects')
    .select(['id'])
    .where('organization_id', '=', org.id)
    .executeTakeFirst();

  if (!project) {
    throw new Error(`No project found for organization ${TARGET_ORG_ID}.`);
  }

  return { projectId: project.id, organizationId: org.id };
}

async function seedLogs(projectId: string, totalLogs: number) {
  console.log(`\nSeeding ${totalLogs.toLocaleString()} logs...`);

  // Disable statement timeout for bulk inserts
  await sql`SET statement_timeout = 0`.execute(db);

  let inserted = 0;
  const startTime = Date.now();

  while (inserted < totalLogs) {
    const batchSize = Math.min(BATCH_SIZE, totalLogs - inserted);
    const batchStart = Date.now();

    // Use generate_series for fast bulk insert
    // Distributes logs over the last 30 days
    await sql`
      INSERT INTO logs (time, project_id, service, level, message, metadata, trace_id)
      SELECT
        NOW() - (random() * INTERVAL '30 days') AS time,
        ${projectId}::uuid AS project_id,
        (ARRAY['api-gateway', 'auth-service', 'user-service', 'payment-service', 'notification-service', 'scheduler', 'worker', 'cache-service'])[floor(random()*8+1)] AS service,
        (CASE
          WHEN random() < 0.10 THEN 'debug'
          WHEN random() < 0.70 THEN 'info'
          WHEN random() < 0.90 THEN 'warn'
          WHEN random() < 0.98 THEN 'error'
          ELSE 'critical'
        END)::text AS level,
        'Log message #' || i || ' - ' || md5(random()::text) AS message,
        jsonb_build_object(
          'request_id', md5(random()::text),
          'user_id', floor(random()*10000)::int,
          'duration_ms', floor(random()*1000)::int
        ) AS metadata,
        CASE WHEN random() < 0.3 THEN md5(random()::text) ELSE NULL END AS trace_id
      FROM generate_series(1, ${batchSize}) AS i
    `.execute(db);

    inserted += batchSize;
    const batchTime = (Date.now() - batchStart) / 1000;
    const totalTime = (Date.now() - startTime) / 1000;
    const rate = inserted / totalTime;
    const eta = (totalLogs - inserted) / rate;

    console.log(`  ✓ ${inserted.toLocaleString()}/${totalLogs.toLocaleString()} logs (${batchTime.toFixed(1)}s batch, ${rate.toFixed(0)} logs/sec, ETA: ${eta.toFixed(0)}s)`);
  }

  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`Logs seeded in ${totalTime.toFixed(1)}s (${(totalLogs/totalTime).toFixed(0)} logs/sec)`);
}

async function seedSpans(projectId: string, organizationId: string, totalSpans: number) {
  console.log(`\nSeeding ${totalSpans.toLocaleString()} spans...`);

  const startTime = Date.now();
  let inserted = 0;
  const batchSize = 100_000;

  while (inserted < totalSpans) {
    const currentBatch = Math.min(batchSize, totalSpans - inserted);
    const batchStart = Date.now();

    await sql`
      INSERT INTO spans (time, span_id, trace_id, parent_span_id, organization_id, project_id,
                        service_name, operation_name, start_time, end_time, duration_ms,
                        kind, status_code, status_message)
      SELECT
        start_ts AS time,
        md5(random()::text || i::text) AS span_id,
        md5(floor(random()*${currentBatch/10})::text) AS trace_id,
        CASE WHEN random() < 0.7 THEN md5(random()::text) ELSE NULL END AS parent_span_id,
        ${organizationId}::uuid AS organization_id,
        ${projectId}::uuid AS project_id,
        (ARRAY['api-gateway', 'auth-service', 'user-service', 'payment-service', 'worker'])[floor(random()*5+1)] AS service_name,
        (ARRAY['GET /api/users', 'POST /api/orders', 'GET /api/products', 'POST /api/auth/login', 'processJob'])[floor(random()*5+1)] AS operation_name,
        start_ts AS start_time,
        start_ts + (random() * INTERVAL '500 milliseconds') AS end_time,
        floor(random()*500)::int AS duration_ms,
        (ARRAY['SPAN_KIND_SERVER', 'SPAN_KIND_CLIENT', 'SPAN_KIND_INTERNAL'])[floor(random()*3+1)] AS kind,
        CASE WHEN random() < 0.95 THEN 'OK' ELSE 'ERROR' END AS status_code,
        NULL AS status_message
      FROM (
        SELECT i, NOW() - (random() * INTERVAL '30 days') AS start_ts
        FROM generate_series(1, ${currentBatch}) AS i
      ) AS s
    `.execute(db);

    inserted += currentBatch;
    const batchTime = (Date.now() - batchStart) / 1000;
    console.log(`  ✓ ${inserted.toLocaleString()}/${totalSpans.toLocaleString()} spans (${batchTime.toFixed(1)}s)`);
  }

  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`Spans seeded in ${totalTime.toFixed(1)}s`);
}

async function seedDetectionEvents(projectId: string, organizationId: string, totalEvents: number) {
  console.log(`\nSeeding ${totalEvents.toLocaleString()} detection events...`);

  const startTime = Date.now();

  // First, ensure we have some sigma rules
  const sigmaRule = await db
    .selectFrom('sigma_rules')
    .select(['id', 'title'])
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();

  let ruleId: string;
  let ruleTitle: string;

  if (!sigmaRule) {
    // Create a test sigma rule
    const newRule = await db
      .insertInto('sigma_rules')
      .values({
        organization_id: organizationId,
        project_id: projectId,
        sigma_id: 'test-rule-001',
        title: 'Test Detection Rule - Suspicious Activity',
        description: 'Detects suspicious activity patterns',
        level: 'high',
        status: 'stable',
        logsource: { category: 'application', product: 'logtide' },
        detection: { selection: { level: ['error', 'critical'] }, condition: 'selection' },
        email_recipients: [],
        enabled: true,
        tags: ['attack.execution', 'attack.t1059'],
        mitre_tactics: ['execution', 'persistence'],
        mitre_techniques: ['T1059', 'T1053'],
      })
      .returning(['id', 'title'])
      .executeTakeFirstOrThrow();

    ruleId = newRule.id;
    ruleTitle = newRule.title;
    console.log(`  ✓ Created test sigma rule: ${ruleTitle}`);
  } else {
    ruleId = sigmaRule.id;
    ruleTitle = sigmaRule.title;
  }

  // Get some log IDs for detection events
  const sampleLogs = await db
    .selectFrom('logs')
    .select(['id', 'service', 'level', 'message'])
    .where('project_id', '=', projectId)
    .where('level', 'in', ['error', 'critical'])
    .limit(1000)
    .execute();

  if (sampleLogs.length === 0) {
    console.log('  No error/critical logs found, skipping detection events');
    return;
  }

  await sql`
    INSERT INTO detection_events (time, organization_id, project_id, sigma_rule_id, log_id,
                                  severity, rule_title, rule_description, mitre_tactics, mitre_techniques,
                                  service, log_level, log_message)
    SELECT
      NOW() - (random() * INTERVAL '30 days') AS time,
      ${organizationId}::uuid AS organization_id,
      ${projectId}::uuid AS project_id,
      ${ruleId}::uuid AS sigma_rule_id,
      (SELECT id FROM logs WHERE project_id = ${projectId}::uuid ORDER BY random() LIMIT 1) AS log_id,
      (ARRAY['critical', 'high', 'medium', 'low', 'informational'])[floor(random()*5+1)]::text AS severity,
      ${ruleTitle} AS rule_title,
      'Suspicious activity detected' AS rule_description,
      ARRAY['execution', 'persistence', 'defense-evasion'] AS mitre_tactics,
      ARRAY['T1059', 'T1053', 'T1070'] AS mitre_techniques,
      (ARRAY['api-gateway', 'auth-service', 'user-service', 'payment-service'])[floor(random()*4+1)] AS service,
      (ARRAY['error', 'critical'])[floor(random()*2+1)] AS log_level,
      'Suspicious activity in service' AS log_message
    FROM generate_series(1, ${totalEvents}) AS i
  `.execute(db);

  const totalTime = (Date.now() - startTime) / 1000;
  console.log(`Detection events seeded in ${totalTime.toFixed(1)}s`);
}

async function refreshAggregates() {
  console.log('\nRefreshing continuous aggregates...');

  const aggregates = [
    'logs_hourly_stats',
    'logs_daily_stats',
  ];

  for (const agg of aggregates) {
    try {
      console.log(`  Refreshing ${agg}...`);
      await sql`CALL refresh_continuous_aggregate(${agg}::regclass, NULL, NOW())`.execute(db);
      console.log(`  ✓ ${agg} refreshed`);
    } catch (e) {
      console.log(`  ${agg} refresh skipped (may not exist yet)`);
    }
  }
}

async function showStats() {
  console.log('\nFinal statistics:');

  const logsCount = await db
    .selectFrom('logs')
    .select(sql<number>`COUNT(*)::int`.as('count'))
    .executeTakeFirst();

  const spansCount = await db
    .selectFrom('spans')
    .select(sql<number>`COUNT(*)::int`.as('count'))
    .executeTakeFirst();

  const detectionCount = await db
    .selectFrom('detection_events')
    .select(sql<number>`COUNT(*)::int`.as('count'))
    .executeTakeFirst();

  console.log(`  Logs: ${logsCount?.count?.toLocaleString() || 0}`);
  console.log(`  Spans: ${spansCount?.count?.toLocaleString() || 0}`);
  console.log(`  Detection Events: ${detectionCount?.count?.toLocaleString() || 0}`);
}

async function main() {
  console.log('Starting massive data seed...');
  console.log(`   Target: ${TOTAL_LOGS.toLocaleString()} logs, ${TOTAL_SPANS.toLocaleString()} spans, ${TOTAL_DETECTION_EVENTS.toLocaleString()} detection events`);

  try {
    const { projectId, organizationId } = await getTestProjectId();
    console.log(`\nUsing project: ${projectId}`);
    console.log(`   Organization: ${organizationId}`);

    await seedLogs(projectId, TOTAL_LOGS);
    await seedSpans(projectId, organizationId, TOTAL_SPANS);
    await seedDetectionEvents(projectId, organizationId, TOTAL_DETECTION_EVENTS);
    await refreshAggregates();
    await showStats();

    console.log('\nMassive data seed complete!');
  } catch (error) {
    console.error('\nError:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
