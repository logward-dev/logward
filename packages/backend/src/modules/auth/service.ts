import crypto from 'crypto';
import { db } from '../../database/index.js';

export class AuthService {
  /**
   * Hash an API key using SHA-256
   */
  /**
   * Hash an API key using SHA-256.
   * Note: SHA-256 is appropriate for API keys (high-entropy random values)
   * unlike passwords which require bcrypt/argon2. This is intentional.
   */
  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Generate a new API key
   */
  generateApiKey(): string {
    return `lp_${crypto.randomBytes(32).toString('hex')}`;
  }

  /**
   * Create a new API key
   * @deprecated Use apiKeysService.createApiKey instead
   */
  async createApiKey(name: string, projectId: string): Promise<{ id: string; apiKey: string }> {
    const apiKey = this.generateApiKey();
    const keyHash = this.hashApiKey(apiKey);

    const result = await db
      .insertInto('api_keys')
      .values({
        project_id: projectId,
        name,
        key_hash: keyHash,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    return {
      id: result.id,
      apiKey, // Return plain key only once
    };
  }

  /**
   * Verify an API key
   */
  async verifyApiKey(apiKey: string): Promise<boolean> {
    const keyHash = this.hashApiKey(apiKey);

    const result = await db
      .selectFrom('api_keys')
      .select(['id'])
      .where('key_hash', '=', keyHash)
      .where('revoked', '=', false)
      .executeTakeFirst();

    if (!result) {
      return false;
    }

    // Update last_used timestamp
    await db
      .updateTable('api_keys')
      .set({ last_used: new Date() })
      .where('id', '=', result.id)
      .execute();

    return true;
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(id: string): Promise<void> {
    await db
      .updateTable('api_keys')
      .set({ revoked: true })
      .where('id', '=', id)
      .execute();
  }

  /**
   * List all API keys
   */
  async listApiKeys() {
    return db
      .selectFrom('api_keys')
      .select(['id', 'name', 'created_at', 'last_used', 'revoked'])
      .orderBy('created_at', 'desc')
      .execute();
  }
}

export const authService = new AuthService();
