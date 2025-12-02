-- ============================================================================
-- Migration 005: Add User Onboarding Table
-- ============================================================================
-- Stores onboarding/tutorial progress per user.
-- This allows tutorial state to persist across devices and sessions.
-- ============================================================================

-- User onboarding state table
CREATE TABLE IF NOT EXISTS user_onboarding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Checklist items state (JSON object with item_id -> completed boolean)
  checklist_items JSONB NOT NULL DEFAULT '{}',

  -- UI state
  checklist_collapsed BOOLEAN NOT NULL DEFAULT true,
  checklist_dismissed BOOLEAN NOT NULL DEFAULT false,

  -- Tutorial state
  tutorial_completed BOOLEAN NOT NULL DEFAULT false,
  tutorial_step INTEGER NOT NULL DEFAULT 0,
  tutorial_skipped BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One record per user
  UNIQUE(user_id)
);

-- Index for quick user lookup
CREATE INDEX IF NOT EXISTS idx_user_onboarding_user_id ON user_onboarding (user_id);

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- This migration adds:
-- - user_onboarding table for storing tutorial/checklist progress
-- - Supports checklist items, collapsed/dismissed state
-- - Supports tutorial progress tracking
-- - One record per user with cascade delete
-- ============================================================================
