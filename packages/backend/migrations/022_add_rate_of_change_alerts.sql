-- ============================================================================
-- Migration 022: Rate-of-Change Alerts
-- ============================================================================
-- Adds support for baseline-based anomaly detection alerts.
-- Instead of fixed thresholds, these alerts compare current log volume
-- against historical baselines (same time yesterday, rolling 7d avg, etc.)
-- ============================================================================

-- Add rate-of-change columns to alert_rules
ALTER TABLE alert_rules
  ADD COLUMN IF NOT EXISTS alert_type VARCHAR(20) NOT NULL DEFAULT 'threshold',
  ADD COLUMN IF NOT EXISTS baseline_type VARCHAR(30),
  ADD COLUMN IF NOT EXISTS deviation_multiplier DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS min_baseline_value INTEGER,
  ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS sustained_minutes INTEGER;

-- Constraints
ALTER TABLE alert_rules
  ADD CONSTRAINT chk_alert_type CHECK (alert_type IN ('threshold', 'rate_of_change'));

ALTER TABLE alert_rules
  ADD CONSTRAINT chk_baseline_type CHECK (
    baseline_type IS NULL OR baseline_type IN (
      'same_time_yesterday', 'same_day_last_week', 'rolling_7d_avg', 'percentile_p95'
    )
  );

-- Index for fast filtering of enabled rate-of-change rules
CREATE INDEX IF NOT EXISTS idx_alert_rules_type_enabled
  ON alert_rules (alert_type) WHERE enabled = true;

-- Add baseline metadata to alert_history for context when triggered
ALTER TABLE alert_history
  ADD COLUMN IF NOT EXISTS baseline_metadata JSONB;

-- Add indexes on logs_hourly_stats for baseline queries
-- (service filter is common in baseline calculations)
CREATE INDEX IF NOT EXISTS idx_logs_hourly_stats_service
  ON logs_hourly_stats (service, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_logs_hourly_stats_level
  ON logs_hourly_stats (level, bucket DESC);
