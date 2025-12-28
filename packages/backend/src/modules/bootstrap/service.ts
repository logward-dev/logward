/**
 * Bootstrap Service
 *
 * Handles automatic setup for auth-free mode:
 * - Uses the selected default user from settings
 * - Provides the user for all auth-free requests
 *
 * This runs at server startup when auth.mode = 'none'
 */

import { db } from '../../database/connection.js';
import { settingsService } from '../settings/service.js';
import type { UserProfile } from '../users/service.js';

// Cache for default user (avoid DB query on every request in auth-free mode)
let cachedDefaultUser: UserProfile | null = null;

export class BootstrapService {
  /**
   * Ensure default setup exists for auth-free mode
   * Called at server startup when auth.mode = 'none'
   */
  async ensureDefaultSetup(): Promise<void> {
    const userId = await settingsService.getDefaultUserId();

    if (!userId) {
      console.log('[Bootstrap] Auth-free mode enabled but no default user selected.');
      console.log('[Bootstrap] Please select a default user in Admin > Settings.');
      return;
    }

    const user = await this.loadUserById(userId);
    if (!user) {
      console.log(`[Bootstrap] Warning: Selected default user (${userId}) not found in database.`);
      console.log('[Bootstrap] Please select a valid user in Admin > Settings.');
      return;
    }

    cachedDefaultUser = user;
    console.log(`[Bootstrap] Auth-free mode active. Default user: ${user.email}`);
  }

  /**
   * Load a user by ID from database
   */
  private async loadUserById(userId: string): Promise<UserProfile | null> {
    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'name', 'is_admin', 'disabled', 'created_at', 'last_login'])
      .where('id', '=', userId)
      .executeTakeFirst();

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      is_admin: user.is_admin,
      disabled: user.disabled,
      createdAt: new Date(user.created_at),
      lastLogin: user.last_login ? new Date(user.last_login) : null,
    };
  }

  /**
   * Get the cached default user (for auth-free mode requests)
   * Returns null if not in auth-free mode or not initialized
   */
  async getDefaultUser(): Promise<UserProfile | null> {
    if (cachedDefaultUser) {
      return cachedDefaultUser;
    }

    // Try to load from database using settings
    const userId = await settingsService.getDefaultUserId();
    if (!userId) {
      return null;
    }

    const user = await this.loadUserById(userId);
    if (user) {
      cachedDefaultUser = user;
    }

    return user;
  }

  /**
   * Clear cached default user (called when settings change)
   */
  clearCache(): void {
    cachedDefaultUser = null;
  }

  /**
   * Check if bootstrap has been initialized
   */
  isInitialized(): boolean {
    return cachedDefaultUser !== null;
  }
}

// Export singleton instance
export const bootstrapService = new BootstrapService();
