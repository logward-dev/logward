-- ============================================================================
-- Migration 019: Continuous Aggregates for Dashboard Performance
-- ============================================================================
-- Create pre-computed aggregates for fast dashboard queries across:
-- 1. Spans - Performance metrics (P50/P95/P99 duration, error rate)
-- 2. Detection Events - SIEM dashboard stats (timeline, severity, services)
--
-- Expected Performance Improvements:
-- - Dashboard queries: 10-50x faster (from seconds to milliseconds)
-- - Trace viewer metrics: <50ms latency
-- - SIEM dashboard: <100ms for all widgets
--
-- Version: 1.0.0
-- Date: 2025-02-04
-- Related Issue: Database Performance Monitoring
-- ============================================================================

-- ============================================================================
-- PART 1: SPANS CONTINUOUS AGGREGATES
-- ============================================================================

-- ============================================================================
-- 1.1 HOURLY SPANS STATISTICS
-- ============================================================================
-- Pre-compute performance metrics per service per hour:
-- - Span count
-- - Duration percentiles (P50, P95, P99)
-- - Error rate (ERROR status_code / total)

DROP MATERIALIZED VIEW IF EXISTS spans_hourly_stats CASCADE;

CREATE MATERIALIZED VIEW spans_hourly_stats
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  project_id,
  service_name,

  -- Span count
  COUNT(*) AS span_count,

  -- Duration percentiles (in milliseconds)
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) AS duration_p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS duration_p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms) AS duration_p99_ms,

  -- Duration statistics
  MIN(duration_ms) AS duration_min_ms,
  MAX(duration_ms) AS duration_max_ms,
  AVG(duration_ms)::DOUBLE PRECISION AS duration_avg_ms,

  -- Error rate (fraction: 0.0 to 1.0)
  CAST(
    SUM(CASE WHEN status_code = 'ERROR' THEN 1 ELSE 0 END)
    AS DOUBLE PRECISION
  ) / NULLIF(COUNT(*), 0) AS error_rate,

  -- Error count for convenience
  SUM(CASE WHEN status_code = 'ERROR' THEN 1 ELSE 0 END)::INTEGER AS error_count

FROM spans
GROUP BY bucket, project_id, service_name
WITH NO DATA;

-- Refresh policy: every hour, 3h lookback, 1h buffer
SELECT add_continuous_aggregate_policy('spans_hourly_stats',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- ============================================================================
-- 1.2 INDEXES FOR HOURLY SPANS STATS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_spans_hourly_stats_project_bucket
  ON spans_hourly_stats (project_id, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_spans_hourly_stats_project_service_bucket
  ON spans_hourly_stats (project_id, service_name, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_spans_hourly_stats_bucket
  ON spans_hourly_stats (bucket DESC);

-- ============================================================================
-- 1.3 DAILY SPANS STATISTICS
-- ============================================================================
-- For longer-term trend analysis (30d+ views)

DROP MATERIALIZED VIEW IF EXISTS spans_daily_stats CASCADE;

CREATE MATERIALIZED VIEW spans_daily_stats
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time) AS bucket,
  project_id,
  service_name,

  -- Span count
  COUNT(*) AS span_count,

  -- Duration percentiles
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) AS duration_p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) AS duration_p95_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms) AS duration_p99_ms,

  -- Duration statistics
  MIN(duration_ms) AS duration_min_ms,
  MAX(duration_ms) AS duration_max_ms,
  AVG(duration_ms)::DOUBLE PRECISION AS duration_avg_ms,

  -- Error rate and count
  CAST(
    SUM(CASE WHEN status_code = 'ERROR' THEN 1 ELSE 0 END)
    AS DOUBLE PRECISION
  ) / NULLIF(COUNT(*), 0) AS error_rate,

  SUM(CASE WHEN status_code = 'ERROR' THEN 1 ELSE 0 END)::INTEGER AS error_count

FROM spans
GROUP BY bucket, project_id, service_name
WITH NO DATA;

-- Refresh policy: daily, 3d lookback
SELECT add_continuous_aggregate_policy('spans_daily_stats',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- ============================================================================
-- 1.4 INDEXES FOR DAILY SPANS STATS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_spans_daily_stats_project_bucket
  ON spans_daily_stats (project_id, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_spans_daily_stats_project_service_bucket
  ON spans_daily_stats (project_id, service_name, bucket DESC);

-- ============================================================================
-- PART 2: DETECTION EVENTS CONTINUOUS AGGREGATES
-- ============================================================================

-- ============================================================================
-- 2.1 HOURLY DETECTION EVENTS STATISTICS
-- ============================================================================
-- Pre-computed stats for SIEM dashboard (24h-7d views)
-- Groups by org, project, severity, rule, service

DROP MATERIALIZED VIEW IF EXISTS detection_events_hourly_stats CASCADE;

CREATE MATERIALIZED VIEW detection_events_hourly_stats
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', time) AS bucket,
  organization_id,
  project_id,
  severity,
  sigma_rule_id,
  rule_title,
  service,
  COUNT(*) AS detection_count
FROM detection_events
GROUP BY bucket, organization_id, project_id, severity, sigma_rule_id, rule_title, service
WITH NO DATA;

-- Refresh policy: hourly, 6h lookback (detection events may arrive with delay)
SELECT add_continuous_aggregate_policy('detection_events_hourly_stats',
  start_offset => INTERVAL '6 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- ============================================================================
-- 2.2 INDEXES FOR HOURLY DETECTION EVENTS STATS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_detection_events_hourly_org_project_bucket
  ON detection_events_hourly_stats (organization_id, project_id, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_detection_events_hourly_org_bucket
  ON detection_events_hourly_stats (organization_id, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_detection_events_hourly_bucket
  ON detection_events_hourly_stats (bucket DESC);

CREATE INDEX IF NOT EXISTS idx_detection_events_hourly_severity
  ON detection_events_hourly_stats (organization_id, severity, bucket DESC);

-- ============================================================================
-- 2.3 DAILY DETECTION EVENTS STATISTICS
-- ============================================================================
-- For historical analysis (30d+ views)
-- Simpler grouping (without rule_title and service) for aggregation

DROP MATERIALIZED VIEW IF EXISTS detection_events_daily_stats CASCADE;

CREATE MATERIALIZED VIEW detection_events_daily_stats
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time) AS bucket,
  organization_id,
  project_id,
  severity,
  COUNT(*) AS detection_count
FROM detection_events
GROUP BY bucket, organization_id, project_id, severity
WITH NO DATA;

-- Refresh policy: daily, 7d lookback
SELECT add_continuous_aggregate_policy('detection_events_daily_stats',
  start_offset => INTERVAL '7 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

-- ============================================================================
-- 2.4 INDEXES FOR DAILY DETECTION EVENTS STATS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_detection_events_daily_org_project_bucket
  ON detection_events_daily_stats (organization_id, project_id, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_detection_events_daily_org_bucket
  ON detection_events_daily_stats (organization_id, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_detection_events_daily_severity
  ON detection_events_daily_stats (organization_id, severity, bucket DESC);

-- ============================================================================
-- 2.5 RULE STATS FOR TOP THREATS
-- ============================================================================
-- Pre-computed rule counts by day for "top threats" queries
-- Enables fast retrieval of top 10 rules without scanning raw data

DROP MATERIALIZED VIEW IF EXISTS detection_events_rule_stats CASCADE;

CREATE MATERIALIZED VIEW detection_events_rule_stats
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time) AS date,
  organization_id,
  project_id,
  sigma_rule_id,
  rule_title,
  severity,
  COUNT(*) AS detection_count
FROM detection_events
GROUP BY date, organization_id, project_id, sigma_rule_id, rule_title, severity
WITH NO DATA;

-- Refresh policy: 6 hour, 3d lookback (needs at least 2 day-buckets)
SELECT add_continuous_aggregate_policy('detection_events_rule_stats',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '6 hours',
  if_not_exists => TRUE
);

-- ============================================================================
-- 2.6 INDEXES FOR RULE STATS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_detection_events_rule_stats_org_date
  ON detection_events_rule_stats (organization_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_detection_events_rule_stats_org_project_date
  ON detection_events_rule_stats (organization_id, project_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_detection_events_rule_stats_count
  ON detection_events_rule_stats (organization_id, detection_count DESC);

-- ============================================================================
-- PART 3: INDEXES ON EXISTING LOGS AGGREGATES
-- ============================================================================
-- Add missing indexes for better performance on logs_hourly_stats

CREATE INDEX IF NOT EXISTS idx_logs_hourly_stats_service
  ON logs_hourly_stats (project_id, service, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_logs_hourly_stats_level
  ON logs_hourly_stats (project_id, level, bucket DESC);

-- ============================================================================
-- SUMMARY
-- ============================================================================
--
-- Continuous Aggregates Created:
--
-- SPANS:
--   - spans_hourly_stats: Hourly metrics per service (P50/P95/P99, error rate)
--   - spans_daily_stats: Daily metrics per service (for long-term trends)
--
-- DETECTION EVENTS (SIEM):
--   - detection_events_hourly_stats: Hourly counts by org/project/severity/rule/service
--   - detection_events_daily_stats: Daily counts by org/project/severity
--   - detection_events_rule_stats: Daily rule counts for top threats
--
-- Indexes Created: 15 total
--   - spans_hourly_stats: 3 indexes
--   - spans_daily_stats: 2 indexes
--   - detection_events_hourly_stats: 4 indexes
--   - detection_events_daily_stats: 3 indexes
--   - detection_events_rule_stats: 3 indexes
--
-- Expected Performance:
--   - Dashboard queries: <50ms (from seconds)
--   - Trace viewer metrics: <100ms
--   - SIEM dashboard: <100ms for all widgets
--
-- ============================================================================
