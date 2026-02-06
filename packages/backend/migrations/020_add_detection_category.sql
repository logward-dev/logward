-- ============================================================================
-- LogTide - Detection Category Routing
-- ============================================================================
-- Migration: 020_add_detection_category.sql
-- Created: 2026-02-06
-- Description: Add category column to sigma_rules and detection_events tables
--              to route detection pack results to appropriate UI sections:
--              security → Security/SIEM, reliability/database → Errors, business → Alerts
-- ============================================================================

-- Add category to sigma_rules
ALTER TABLE sigma_rules
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'security';

-- Add category to detection_events
ALTER TABLE detection_events
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'security';

-- Index for filtering detection_events by category
CREATE INDEX IF NOT EXISTS idx_detection_events_category
  ON detection_events (category, organization_id, time DESC);

-- Update existing sigma_rules generated from detection packs
-- Pack IDs: startup-reliability, auth-security, database-health, payment-billing
UPDATE sigma_rules
SET category = CASE
  WHEN sigma_id LIKE 'pack-startup-reliability-%' THEN 'reliability'
  WHEN sigma_id LIKE 'pack-auth-security-%' THEN 'security'
  WHEN sigma_id LIKE 'pack-database-health-%' THEN 'database'
  WHEN sigma_id LIKE 'pack-payment-billing-%' THEN 'business'
  ELSE 'security'
END
WHERE sigma_id LIKE 'pack-%';

-- Update existing detection_events that came from pack rules
UPDATE detection_events de
SET category = sr.category
FROM sigma_rules sr
WHERE de.sigma_rule_id = sr.id
  AND sr.sigma_id LIKE 'pack-%'
  AND sr.category != 'security';
