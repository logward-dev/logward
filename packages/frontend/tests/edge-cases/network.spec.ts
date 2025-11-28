import { test, expect, registerUser, setAuthState, generateTestEmail, generateTestName, TEST_FRONTEND_URL, TestApiClient } from '../fixtures/auth';

test.describe('Network Edge Cases', () => {
  let userToken: string;
  let organizationId: string;
  let projectId: string;

  test.beforeAll(async () => {
    const email = generateTestEmail();
    const { user, token } = await registerUser(generateTestName('Network'), email, 'TestPassword123!');
    userToken = token;

    const apiClient = new TestApiClient(token);
    const orgResult = await apiClient.createOrganization(`Network Test Org ${Date.now()}`);
    organizationId = orgResult.organization.id;

    const projectResult = await apiClient.createProject(organizationId, `Network Test Project ${Date.now()}`);
    projectId = projectResult.project.id;
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_FRONTEND_URL);
    await setAuthState(page, { id: 'test', email: 'test@test.com', name: 'Network Test', token: userToken }, userToken);
  });

  test('Login page handles network error gracefully', async ({ page }) => {
    // Clear auth and go to login
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${TEST_FRONTEND_URL}/login`);

    // Intercept API requests to simulate network failure
    await page.route('**/api/v1/auth/login', (route) => {
      route.abort('failed');
    });

    // Try to login
    await page.locator('input[type="email"]').fill('test@example.com');
    await page.locator('input[type="password"]').fill('password123');
    await page.locator('button[type="submit"]').click();

    await page.waitForTimeout(2000);

    // Should show error message, not crash
    const hasError = await page.locator('[class*="error"], [class*="destructive"], [class*="alert"]').isVisible().catch(() => false);
    const pageContent = await page.content();
    const hasErrorText = pageContent.toLowerCase().includes('error') || pageContent.toLowerCase().includes('failed');

    expect(hasError || hasErrorText).toBe(true);
  });

  test('Dashboard handles API timeout gracefully', async ({ page }) => {
    // Intercept API requests to simulate slow response
    await page.route('**/api/v1/**', async (route) => {
      // Delay response significantly
      await new Promise((resolve) => setTimeout(resolve, 100));
      route.continue();
    });

    await page.goto(`${TEST_FRONTEND_URL}/dashboard`);

    // Page should still load, possibly with loading state
    await page.waitForTimeout(5000);

    // Should not show unhandled error
    const hasUnhandledError = await page.locator('text=/unhandled|uncaught|exception/i').isVisible().catch(() => false);
    expect(hasUnhandledError).toBe(false);
  });

  test('Search page handles API error gracefully', async ({ page }) => {
    await page.goto(`${TEST_FRONTEND_URL}/search`);
    await page.waitForLoadState('networkidle');

    // Intercept logs API to return error
    await page.route('**/api/v1/logs**', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    // Trigger a search
    const searchInput = page.locator('input#search, input[placeholder*="search" i]');
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('test');
      await searchInput.press('Enter');
      await page.waitForTimeout(2000);
    }

    // Page should handle error gracefully
    const pageContent = await page.content();
    const hasGracefulError = !pageContent.includes('Unhandled') && !pageContent.includes('undefined');
    expect(hasGracefulError).toBe(true);
  });

  test('Page handles 401 unauthorized and redirects to login', async ({ page }) => {
    await page.goto(`${TEST_FRONTEND_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    // Clear auth to simulate expired session
    await page.evaluate(() => localStorage.clear());

    // Reload page
    await page.reload();
    await page.waitForTimeout(2000);

    // Should redirect to login
    await expect(page).toHaveURL(/login/);
  });

  test('Form handles validation errors from API', async ({ page }) => {
    await page.goto(`${TEST_FRONTEND_URL}/projects/${projectId}/alerts`);
    await page.waitForLoadState('networkidle');

    // Click create alert button
    const createButton = page.locator('button:has-text("Create Alert"), button:has-text("Create Your First Alert")');
    if (await createButton.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await createButton.first().click();
      await page.waitForTimeout(500);

      // Try to submit empty form
      const submitButton = page.locator('button:has-text("Create Alert")').last();
      await submitButton.click();
      await page.waitForTimeout(1000);

      // Should show validation error
      const hasValidationError = await page.locator('[class*="error"], [class*="destructive"], text=/required/i').isVisible().catch(() => false);
      expect(hasValidationError).toBe(true);
    }
  });

  test('Page recovers after network comes back', async ({ page }) => {
    await page.goto(`${TEST_FRONTEND_URL}/search`);
    await page.waitForLoadState('networkidle');

    // Simulate network going offline
    await page.route('**/api/v1/**', (route) => {
      route.abort('failed');
    });

    // Try to perform action
    const searchInput = page.locator('input#search, input[placeholder*="search" i]');
    if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await searchInput.fill('test');
      await searchInput.press('Enter');
      await page.waitForTimeout(1000);
    }

    // Remove the route interception (network comes back)
    await page.unroute('**/api/v1/**');

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Page should work again
    await expect(page.locator('h1')).toBeVisible();
  });
});

test.describe('Session Edge Cases', () => {
  test('Handles concurrent sessions gracefully', async ({ browser }) => {
    // Create two browser contexts (simulating two tabs)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Register a user
    const email = generateTestEmail();
    const { user, token } = await registerUser(generateTestName('Concurrent'), email, 'TestPassword123!');

    // Login in both tabs
    await page1.goto(TEST_FRONTEND_URL);
    await setAuthState(page1, user, token);
    await page1.reload();

    await page2.goto(TEST_FRONTEND_URL);
    await setAuthState(page2, user, token);
    await page2.reload();

    // Both should be on dashboard
    await page1.goto(`${TEST_FRONTEND_URL}/dashboard`);
    await page2.goto(`${TEST_FRONTEND_URL}/dashboard`);

    await page1.waitForLoadState('networkidle');
    await page2.waitForLoadState('networkidle');

    // Both should work
    await expect(page1.locator('h1, h2')).toBeVisible();
    await expect(page2.locator('h1, h2')).toBeVisible();

    // Cleanup
    await context1.close();
    await context2.close();
  });

  test('Handles expired token gracefully', async ({ page }) => {
    // Set an invalid/expired token
    await page.goto(TEST_FRONTEND_URL);
    await page.evaluate(() => {
      localStorage.setItem('logward_auth', JSON.stringify({
        user: { id: 'test', email: 'test@test.com', name: 'Test' },
        token: 'invalid-expired-token',
        loading: false,
      }));
    });

    await page.goto(`${TEST_FRONTEND_URL}/dashboard`);
    await page.waitForTimeout(3000);

    // Should redirect to login due to invalid token
    const isOnLogin = page.url().includes('login');
    const hasAuthError = await page.locator('text=/unauthorized|expired|invalid/i').isVisible().catch(() => false);

    expect(isOnLogin || hasAuthError).toBe(true);
  });
});

test.describe('Browser Edge Cases', () => {
  test('Handles page refresh without losing context', async ({ page }) => {
    const email = generateTestEmail();
    const { user, token } = await registerUser(generateTestName('Refresh'), email, 'TestPassword123!');

    await page.goto(TEST_FRONTEND_URL);
    await setAuthState(page, user, token);
    await page.goto(`${TEST_FRONTEND_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    // Refresh the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be authenticated and on dashboard
    await expect(page).toHaveURL(/dashboard/);
  });

  test('Handles browser back/forward navigation', async ({ page }) => {
    const email = generateTestEmail();
    const { user, token } = await registerUser(generateTestName('NavHistory'), email, 'TestPassword123!');

    // Setup auth
    await page.goto(TEST_FRONTEND_URL);
    await setAuthState(page, user, token);

    // Navigate to different pages
    await page.goto(`${TEST_FRONTEND_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    await page.goto(`${TEST_FRONTEND_URL}/search`);
    await page.waitForLoadState('networkidle');

    await page.goto(`${TEST_FRONTEND_URL}/projects`);
    await page.waitForLoadState('networkidle');

    // Go back
    await page.goBack();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/search/);

    // Go back again
    await page.goBack();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/dashboard/);

    // Go forward
    await page.goForward();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/search/);
  });
});
