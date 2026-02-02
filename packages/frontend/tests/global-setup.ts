import type { FullConfig } from '@playwright/test';

const TEST_API_URL = process.env.TEST_API_URL || 'http://localhost:3001';
const TEST_FRONTEND_URL = process.env.TEST_FRONTEND_URL || 'http://localhost:3002';

const MAX_RETRIES = 30;
const RETRY_DELAY = 2000;

async function waitForService(url: string, name: string): Promise<void> {
  console.log(`Waiting for ${name} at ${url}...`);

  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok || response.status === 401 || response.status === 404) {
        console.log(`${name} is ready!`);
        return;
      }
    } catch (error) {
      // Service not ready yet
    }

    console.log(`${name} not ready, retrying in ${RETRY_DELAY / 1000}s... (${i + 1}/${MAX_RETRIES})`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
  }

  throw new Error(`${name} failed to become ready after ${MAX_RETRIES} attempts`);
}

async function ensureLocalAuthProvider(): Promise<void> {
  // Check if local provider exists
  const response = await fetch(`${TEST_API_URL}/api/v1/auth/providers`);
  const data = await response.json();

  const hasLocalProvider = data.providers?.some((p: { type: string }) => p.type === 'local');

  if (!hasLocalProvider) {
    console.log('Local auth provider missing - this may cause login/register forms to not appear.');
    console.log('Please ensure the database migration 010_auth_providers.sql has inserted the local provider.');
    console.log('You can manually run: INSERT INTO auth_providers (type, name, slug, enabled, is_default, display_order, icon, config) VALUES (\'local\', \'Email & Password\', \'local\', true, true, 0, \'mail\', \'{}\'::jsonb) ON CONFLICT (slug) DO NOTHING;');
  } else {
    console.log('Local auth provider verified ✓');
  }
}

async function globalSetup(config: FullConfig): Promise<void> {
  console.log('=== E2E Test Global Setup ===');
  console.log(`API URL: ${TEST_API_URL}`);
  console.log(`Frontend URL: ${TEST_FRONTEND_URL}`);

  // Wait for backend to be ready
  await waitForService(`${TEST_API_URL}/health`, 'Backend API');

  // Wait for frontend to be ready
  await waitForService(TEST_FRONTEND_URL, 'Frontend');

  // Ensure local auth provider exists (required for login/register forms)
  await ensureLocalAuthProvider();

  console.log('=== All services ready! ===');
}

export default globalSetup;
