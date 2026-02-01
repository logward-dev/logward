// ============================================================================
// Notification Channel Types
// ============================================================================

/**
 * Notification channel type
 */
export type NotificationChannelType = 'email' | 'webhook';

/**
 * Event types that can be associated with notification channels
 */
export type NotificationEventType = 'alert' | 'sigma' | 'incident' | 'error';

/**
 * Email channel configuration
 */
export interface EmailChannelConfig {
  recipients: string[];
}

/**
 * Webhook channel configuration
 */
export interface WebhookChannelConfig {
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  headers?: Record<string, string>;
  auth?: {
    type: 'bearer' | 'basic';
    token?: string;
    username?: string;
    password?: string;
  };
}

/**
 * Union of all channel configs
 */
export type ChannelConfig = EmailChannelConfig | WebhookChannelConfig;

/**
 * Notification channel entity
 */
export interface NotificationChannel {
  id: string;
  organizationId: string;
  name: string;
  type: NotificationChannelType;
  enabled: boolean;
  config: ChannelConfig;
  description: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a notification channel
 */
export interface CreateNotificationChannelInput {
  name: string;
  type: NotificationChannelType;
  config: ChannelConfig;
  description?: string;
}

/**
 * Input for updating a notification channel
 */
export interface UpdateNotificationChannelInput {
  name?: string;
  enabled?: boolean;
  config?: ChannelConfig;
  description?: string | null;
}

/**
 * Context passed to notification providers
 */
export interface NotificationContext {
  organizationId: string;
  organizationName: string;
  eventType: NotificationEventType;
  title: string;
  message: string;
  severity?: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  metadata?: Record<string, unknown>;
  link?: string;
}

/**
 * Result of a notification delivery attempt
 */
export interface DeliveryResult {
  success: boolean;
  error?: string;
  metadata?: Record<string, unknown>;
}
