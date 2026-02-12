-- PII Masking Rules
-- Org-level defaults + optional project-level overrides
CREATE TABLE IF NOT EXISTS pii_masking_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  pattern_type VARCHAR(20) NOT NULL CHECK (pattern_type IN ('builtin', 'field_name', 'custom')),
  regex_pattern TEXT,
  field_names TEXT[] DEFAULT '{}',
  action VARCHAR(10) NOT NULL CHECK (action IN ('mask', 'redact', 'hash')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, project_id, name)
);

-- Partial unique index for org-wide rules (project_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pii_masking_rules_org_name
  ON pii_masking_rules (organization_id, name)
  WHERE project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pii_masking_rules_org_enabled
  ON pii_masking_rules (organization_id, enabled, priority);

CREATE INDEX IF NOT EXISTS idx_pii_masking_rules_project
  ON pii_masking_rules (project_id, enabled)
  WHERE project_id IS NOT NULL;

-- Per-organization salt for hash-based masking
CREATE TABLE IF NOT EXISTS organization_pii_salts (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
