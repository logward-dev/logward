-- ============================================================================
-- Migration 017: Notification Channels
-- ============================================================================
-- Adds reusable notification channels (email, webhook) that can be shared
-- across alert rules, sigma rules, incidents, and error groups.
-- ============================================================================

-- Notification channels table (organization-level, reusable)
CREATE TABLE IF NOT EXISTS notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('email', 'webhook')),
  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Type-specific configuration stored as JSONB
  -- Email: { "recipients": ["a@example.com", "b@example.com"] }
  -- Webhook: { "url": "https://...", "headers": {...}, "method": "POST" }
  config JSONB NOT NULL,

  description TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Channel names must be unique per organization
  UNIQUE(organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_notification_channels_org ON notification_channels(organization_id);
CREATE INDEX IF NOT EXISTS idx_notification_channels_enabled ON notification_channels(organization_id, enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_notification_channels_type ON notification_channels(organization_id, type);

-- Junction table: Alert Rules <-> Notification Channels (many-to-many)
CREATE TABLE IF NOT EXISTS alert_rule_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_rule_id UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(alert_rule_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_rule_channels_rule ON alert_rule_channels(alert_rule_id);
CREATE INDEX IF NOT EXISTS idx_alert_rule_channels_channel ON alert_rule_channels(channel_id);

-- Junction table: Sigma Rules <-> Notification Channels (many-to-many)
CREATE TABLE IF NOT EXISTS sigma_rule_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sigma_rule_id UUID NOT NULL REFERENCES sigma_rules(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sigma_rule_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_sigma_rule_channels_rule ON sigma_rule_channels(sigma_rule_id);
CREATE INDEX IF NOT EXISTS idx_sigma_rule_channels_channel ON sigma_rule_channels(channel_id);

-- Junction table: Incidents <-> Notification Channels (many-to-many)
CREATE TABLE IF NOT EXISTS incident_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(incident_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_incident_channels_incident ON incident_channels(incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_channels_channel ON incident_channels(channel_id);

-- Junction table: Error Groups <-> Notification Channels (many-to-many)
CREATE TABLE IF NOT EXISTS error_group_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_group_id UUID NOT NULL REFERENCES error_groups(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(error_group_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_error_group_channels_group ON error_group_channels(error_group_id);
CREATE INDEX IF NOT EXISTS idx_error_group_channels_channel ON error_group_channels(channel_id);

-- Organization-level default channels for automatic notifications
-- (incidents, errors get sent to these by default if no specific channels are set)
CREATE TABLE IF NOT EXISTS organization_default_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('incident', 'error', 'sigma', 'alert')),
  channel_id UUID NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, event_type, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_org_default_channels_org ON organization_default_channels(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_default_channels_event ON organization_default_channels(organization_id, event_type);

-- ============================================================================
-- Add comments to mark old fields as deprecated (backward compatibility)
-- ============================================================================
COMMENT ON COLUMN alert_rules.email_recipients IS 'DEPRECATED: Use notification_channels via alert_rule_channels table instead. Will be removed in v2.0';
COMMENT ON COLUMN alert_rules.webhook_url IS 'DEPRECATED: Use notification_channels via alert_rule_channels table instead. Will be removed in v2.0';
COMMENT ON COLUMN sigma_rules.email_recipients IS 'DEPRECATED: Use notification_channels via sigma_rule_channels table instead. Will be removed in v2.0';
COMMENT ON COLUMN sigma_rules.webhook_url IS 'DEPRECATED: Use notification_channels via sigma_rule_channels table instead. Will be removed in v2.0';
