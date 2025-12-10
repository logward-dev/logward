// Runtime configuration for LogWard frontend
// This allows the API URL to be configured at runtime via Docker environment variables

import { browser } from '$app/environment';

// Declare the global window config type
declare global {
  interface Window {
    __LOGWARD_CONFIG__?: {
      apiUrl: string;
    };
  }
}

/**
 * Get the API URL from runtime config or fallback.
 *
 * Priority:
 * 1. Runtime config injected via hooks.server.ts (for Docker deployments)
 * 2. Empty string = same-origin (frontend and backend behind same reverse proxy)
 * 3. Default fallback for development (http://localhost:8080)
 *
 * When deployed behind a reverse proxy (Traefik/nginx), the API URL should be
 * empty or unset, allowing the frontend to use relative URLs (/api/v1/...).
 * This eliminates the need to configure PUBLIC_API_URL in production.
 */
export function getApiUrl(): string {
  if (browser && window.__LOGWARD_CONFIG__?.apiUrl !== undefined) {
    // If explicitly set (even to empty string), use that value
    // Empty string means same-origin (relative URLs)
    return window.__LOGWARD_CONFIG__.apiUrl;
  }

  // Fallback to default for local development without reverse proxy
  return 'http://localhost:8080';
}

/**
 * Get the full API base URL with /api/v1 suffix.
 * When API URL is empty, returns just '/api/v1' for same-origin requests.
 */
export function getApiBaseUrl(): string {
  const baseUrl = getApiUrl();
  return baseUrl ? `${baseUrl}/api/v1` : '/api/v1';
}
