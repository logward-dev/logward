-- ============================================================================
-- Migration: 018_optimize_log_identifiers
-- Description: Optimize log_identifiers table for performance
--
-- Problems found:
-- 1. Table is NOT a hypertable (no compression)
-- 2. 10+ GB for 30M rows (~350 bytes/row avg)
-- 3. 5+ GB of indexes, many NEVER used (idx_scan = 0)
--
-- Solutions:
-- 1. Convert to TimescaleDB hypertable (partitioned by log_time)
-- 2. Enable automatic compression
-- 3. Remove unused indexes
--
-- NOTE: Retention policy is managed in application code, not here
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop unused indexes
-- These have idx_scan = 0 in pg_stat_user_indexes
-- ============================================================================

-- idx_log_identifiers_org: 375 MB, 0 scans
-- The organization-level query is rare, project_id is always available
DROP INDEX IF EXISTS idx_log_identifiers_org;

-- Primary key UUID is rarely queried directly, we can use a simpler approach
-- We'll recreate the table without a UUID primary key

-- ============================================================================
-- STEP 2: Create new optimized hypertable
-- ============================================================================

-- Create new table with optimized schema (no UUID primary key needed)
CREATE TABLE IF NOT EXISTS log_identifiers_new (
  -- Use log_time as part of the key (for hypertable partitioning)
  log_time TIMESTAMPTZ NOT NULL,
  log_id UUID NOT NULL,
  project_id UUID NOT NULL,
  organization_id UUID NOT NULL,

  -- Identifier details (keep original column names for code compatibility)
  identifier_type VARCHAR(50) NOT NULL,
  identifier_value TEXT NOT NULL,
  source_field VARCHAR(100) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Convert to hypertable BEFORE adding indexes (more efficient)
SELECT create_hypertable(
  'log_identifiers_new',
  by_range('log_time', INTERVAL '1 day'),
  migrate_data => false,
  if_not_exists => true
);

-- ============================================================================
-- STEP 3: Migrate data (filtering out useless org_id/project_id values)
-- ============================================================================

-- Insert data, but EXCLUDE identifiers that match org_id or project_id
-- These are useless for correlation (appear in every log of that org/project)
-- This saves ~31% of space based on analysis
INSERT INTO log_identifiers_new (
  log_time, log_id, project_id, organization_id,
  identifier_type, identifier_value, source_field, created_at
)
SELECT
  li.log_time, li.log_id, li.project_id, li.organization_id,
  li.identifier_type, li.identifier_value, li.source_field, li.created_at
FROM log_identifiers li
WHERE NOT EXISTS (
  -- Exclude if identifier_value matches any organization_id
  SELECT 1 FROM organizations o WHERE o.id::text = li.identifier_value
)
AND NOT EXISTS (
  -- Exclude if identifier_value matches any project_id
  SELECT 1 FROM projects p WHERE p.id::text = li.identifier_value
);

-- ============================================================================
-- STEP 4: Create optimized indexes on new table
-- ============================================================================

-- Primary lookup: identifier value -> logs (most common query)
CREATE INDEX IF NOT EXISTS idx_log_ident_lookup
  ON log_identifiers_new (project_id, identifier_value, log_time DESC);

-- Reverse lookup: log -> identifiers (for displaying badges)
CREATE INDEX IF NOT EXISTS idx_log_ident_log_id
  ON log_identifiers_new (log_id);

-- Time-based cleanup (for retention policy)
CREATE INDEX IF NOT EXISTS idx_log_ident_time
  ON log_identifiers_new (log_time DESC);

-- ============================================================================
-- STEP 5: Swap tables
-- ============================================================================

-- Rename old table
ALTER TABLE log_identifiers RENAME TO log_identifiers_old;

-- Rename new table
ALTER TABLE log_identifiers_new RENAME TO log_identifiers;

-- Drop old table (can be done later if you want to verify data first)
DROP TABLE log_identifiers_old CASCADE;

-- ============================================================================
-- STEP 6: Enable compression
-- ============================================================================

ALTER TABLE log_identifiers SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'project_id',
  timescaledb.compress_orderby = 'log_time DESC, identifier_value'
);

-- Compress chunks older than 1 day
SELECT add_compression_policy('log_identifiers', INTERVAL '1 day');

-- ============================================================================
-- STEP 7: Compress existing data
-- This will compress all chunks older than 1 day
-- ============================================================================

-- Manually compress old chunks (can take a while)
-- Run compression on chunks older than 1 day
DO $$
DECLARE
  chunk RECORD;
BEGIN
  FOR chunk IN
    SELECT show_chunks('log_identifiers', older_than => INTERVAL '1 day') AS chunk_name
  LOOP
    PERFORM compress_chunk(chunk.chunk_name);
  END LOOP;
END $$;

-- ============================================================================
-- NOTES:
--
-- Expected improvements:
-- - Table size: 10 GB -> ~1-2 GB (80%+ compression)
-- - Index size: 5 GB -> ~500 MB (fewer, optimized indexes)
-- - Query performance: 2-5x faster (hypertable chunk pruning)
--
-- To monitor compression:
--   SELECT * FROM hypertable_compression_stats('log_identifiers');
--
-- To check chunk status:
--   SELECT * FROM timescaledb_information.chunks
--   WHERE hypertable_name = 'log_identifiers';
-- ============================================================================
