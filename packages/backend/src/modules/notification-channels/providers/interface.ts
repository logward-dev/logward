/**
 * Notification Provider Interface
 * All channel types (email, webhook, etc.) implement this interface
 */

import type {
  NotificationChannelType,
  NotificationContext,
  DeliveryResult,
  ChannelConfig,
} from '@logtide/shared';

export interface NotificationProvider {
  /**
   * Unique identifier for the provider type
   */
  readonly type: NotificationChannelType;

  /**
   * Send notification via this provider
   */
  send(context: NotificationContext, config: ChannelConfig): Promise<DeliveryResult>;

  /**
   * Validate channel configuration
   */
  validateConfig(config: unknown): config is ChannelConfig;

  /**
   * Test channel connectivity (for "Test Channel" button)
   */
  test(config: ChannelConfig): Promise<DeliveryResult>;
}

// Re-export types for convenience
export type { NotificationContext, DeliveryResult, ChannelConfig };
