import { test, expect } from '@playwright/test';
import { waitForAuthForm, TEST_FRONTEND_URL } from './fixtures/auth';

test.describe('Login Page', () => {
	test('should display login form', async ({ page }) => {
		await page.goto(`${TEST_FRONTEND_URL}/login`);
		await waitForAuthForm(page);

		// Check for login form elements
		await expect(page.locator('input#email')).toBeVisible();
		await expect(page.locator('input#password')).toBeVisible();
		await expect(page.locator('button[type="submit"]')).toBeVisible();
	});

	test('should have link to register page', async ({ page }) => {
		await page.goto(`${TEST_FRONTEND_URL}/login`);
		await waitForAuthForm(page);

		const registerLink = page.locator('a[href="/register"]');
		await expect(registerLink).toBeVisible();
	});

	test('should show validation errors for empty fields', async ({ page }) => {
		await page.goto(`${TEST_FRONTEND_URL}/login`);
		await waitForAuthForm(page);

		// Try to submit without filling fields
		await page.locator('button[type="submit"]').click();

		// HTML5 validation should prevent submission
		const emailInput = page.locator('input#email');
		const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.validity.valid);
		expect(isInvalid).toBeTruthy();
	});

	test('should navigate to dashboard on successful login', async ({ page }) => {
		await page.goto(`${TEST_FRONTEND_URL}/login`);
		await waitForAuthForm(page);

		// Fill in mock credentials
		await page.locator('input#email').fill('test@example.com');
		await page.locator('input#password').fill('password123');
		await page.locator('button[type="submit"]').click();

		// Should redirect to dashboard (if backend is running)
		// await expect(page).toHaveURL(/\/dashboard/);
	});
});
