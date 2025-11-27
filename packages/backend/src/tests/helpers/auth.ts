import { db } from '../../database/index.js';
import crypto from 'crypto';

/**
 * Create a test session for a user
 */
export async function createTestSession(userId: string) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session = await db
        .insertInto('sessions')
        .values({
            id: sessionId,
            user_id: userId,
            token,
            expires_at: expiresAt,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

    return session;
}

/**
 * Get authentication headers for API key
 */
export function getApiKeyHeaders(apiKey: string) {
    return {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
    };
}

/**
 * Get authentication headers for session
 */
export function getSessionHeaders(sessionId: string) {
    return {
        Cookie: `session_id=${sessionId}`,
        'Content-Type': 'application/json',
    };
}

/**
 * Delete a session (simulate logout)
 */
export async function deleteTestSession(sessionId: string) {
    await db.deleteFrom('sessions').where('id', '=', sessionId).execute();
}
