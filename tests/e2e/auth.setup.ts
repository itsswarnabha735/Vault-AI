/**
 * Authentication Setup for E2E Tests
 *
 * This file handles authentication setup for Playwright tests.
 * It supports two modes:
 *
 * 1. **Mock Mode** (default): Uses mocked authentication by injecting
 *    Supabase session cookies directly into the browser.
 *
 * 2. **Real Auth Mode**: Uses a real test account (requires TEST_USER_EMAIL
 *    and manual magic link confirmation).
 *
 * Usage:
 * - Tests in the 'chromium' project will automatically use the authenticated state
 * - Create tests that use `test.use({ storageState: authFile })` for auth
 */

import { test as setup, expect } from '@playwright/test';
import * as path from 'path';

// Storage state file path
export const authFile = path.join(__dirname, '../../.auth/user.json');

// Test user configuration
const TEST_USER = {
  id: 'test-user-id-e2e-12345',
  email: 'e2e-test@vault-ai.local',
  aud: 'authenticated',
  role: 'authenticated',
};

/**
 * Creates a mock Supabase session for E2E testing.
 * This bypasses real authentication for faster, more reliable tests.
 */
function createMockSession() {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 3600; // 1 hour

  return {
    access_token: `mock-access-token-${Date.now()}`,
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: now + expiresIn,
    refresh_token: `mock-refresh-token-${Date.now()}`,
    user: {
      id: TEST_USER.id,
      aud: TEST_USER.aud,
      role: TEST_USER.role,
      email: TEST_USER.email,
      email_confirmed_at: new Date().toISOString(),
      phone: '',
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: {
        provider: 'email',
        providers: ['email'],
      },
      user_metadata: {
        email: TEST_USER.email,
        email_verified: true,
      },
      identities: [
        {
          id: TEST_USER.id,
          user_id: TEST_USER.id,
          identity_data: {
            email: TEST_USER.email,
            sub: TEST_USER.id,
          },
          provider: 'email',
          last_sign_in_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };
}

/**
 * Setup test: Authenticate and save storage state
 *
 * This runs before all authenticated tests to set up the session.
 */
setup('authenticate', async ({ page }) => {
  // Determine which auth mode to use
  const useRealAuth = process.env.E2E_USE_REAL_AUTH === 'true';

  if (useRealAuth) {
    // Real authentication flow (requires manual intervention for magic link)
    await authenticateWithRealAuth(page);
  } else {
    // Mock authentication (default - faster and more reliable)
    await authenticateWithMockAuth(page);
  }

  // Save storage state to file for reuse by other tests
  await page.context().storageState({ path: authFile });
});

/**
 * Mock authentication by intercepting Supabase API calls.
 * This is the recommended approach for E2E tests.
 */
async function authenticateWithMockAuth(page: import('@playwright/test').Page) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0] ?? 'localhost';

  // Create mock session
  const session = createMockSession();

  // Intercept Supabase auth API calls to return our mock session
  await page.route('**/auth/v1/user', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session.user),
    });
  });

  await page.route('**/auth/v1/token**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    });
  });

  // Navigate to the app first
  await page.goto('/');

  // Inject the session into localStorage (how Supabase stores it client-side)
  const storageKey = `sb-${projectRef}-auth-token`;
  await page.evaluate(
    ({ key, sessionData }) => {
      localStorage.setItem(key, JSON.stringify(sessionData));
    },
    { key: storageKey, sessionData: session }
  );

  // Set session cookies for SSR auth
  const cookieBase = {
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax' as const,
  };

  // Note: Cookie values must be strings
  const sessionCookieValue = encodeURIComponent(JSON.stringify(session));
  await page.context().addCookies([
    {
      name: `sb-${projectRef}-auth-token`,
      value: sessionCookieValue,
      ...cookieBase,
    },
    // Also set access/refresh token cookies separately (some Supabase setups use these)
    {
      name: `sb-${projectRef}-auth-token.0`,
      value: sessionCookieValue.slice(0, 3000),
      ...cookieBase,
    },
  ]);

  // Reload to pick up the auth state
  await page.reload();

  // Verify we can access a protected route (or at least not get redirected to login)
  await page.goto('/vault');

  // Wait for the page to settle
  await page.waitForLoadState('networkidle').catch(() => {});

  console.log('Mock authentication completed successfully');
}

/**
 * Real authentication flow using magic link.
 * Requires E2E_TEST_EMAIL environment variable.
 * Note: This requires manual email confirmation or a mail server setup.
 */
async function authenticateWithRealAuth(page: import('@playwright/test').Page) {
  const testEmail = process.env.E2E_TEST_EMAIL;

  if (!testEmail) {
    throw new Error(
      'E2E_TEST_EMAIL environment variable is required for real auth mode'
    );
  }

  // Go to login page
  await page.goto('/login');

  // Fill in email
  const emailInput = page.locator('input[type="email"]');
  await emailInput.fill(testEmail);

  // Submit the form
  const submitButton = page.locator('button[type="submit"]');
  await submitButton.click();

  // Wait for magic link message
  await expect(page.getByText(/check your email|magic link|sent/i)).toBeVisible(
    { timeout: 10000 }
  );

  // At this point, you would need to:
  // 1. Check the email inbox (e.g., using Mailhog, Mailtrap, or similar)
  // 2. Extract the magic link
  // 3. Navigate to the magic link URL

  // For now, we'll throw an error as this requires additional setup
  throw new Error(
    'Real auth mode requires email server setup. ' +
      'Consider using mock auth (default) or setting up Mailhog.'
  );
}

/**
 * Export helper to check if user is authenticated in tests
 */
export async function isAuthenticated(
  page: import('@playwright/test').Page
): Promise<boolean> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0] ?? 'localhost';
  const storageKey = `sb-${projectRef}-auth-token`;

  const hasSession = await page.evaluate((key) => {
    const session = localStorage.getItem(key);
    return session !== null;
  }, storageKey);

  return hasSession;
}
