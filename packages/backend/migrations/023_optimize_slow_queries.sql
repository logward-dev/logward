-- Migration 023: Optimize slow queries
--
-- Performance notes (measured on production with 53M logs, 45GB):
--
-- Key optimizations applied in application code:
-- 1. Removed COUNT(*) from queryLogs() - was causing 12s+ responses (1.4s just for count)
-- 2. Added time filter to getRecentErrors() - prevents full table scan
-- 3. Switched getDistinctServices/getTopServices to use continuous aggregates
-- 4. Reduced default time windows (hostnames: 6h, services: 7d, errors: 24h)
-- 5. Added Redis caching to dashboard methods
--
-- Note: Expression index on metadata->>'hostname' was tested on production
-- but TimescaleDB planner still prefers seq scan for JSONB extraction.
-- The most effective optimization for hostname queries is keeping the time
-- window short (6h default = ~350ms vs 7d = ~3s+).

-- No schema changes needed - optimizations are in application code.
-- Run ANALYZE to ensure planner has up-to-date statistics.
ANALYZE logs;
