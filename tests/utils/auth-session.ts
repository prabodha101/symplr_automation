import fs from 'node:fs';
import path from 'node:path';
import { Browser, BrowserContext, Page } from '@playwright/test';
import { DashboardHomePage } from '../../pages/DashboardHomePage';
import { LoginPage } from '../../pages/LoginPage';

const AUTH_FILE = path.resolve(process.cwd(), 'playwright/.auth/user.json');

export type AuthSessionMode = 'reuse' | 'fresh';

export type AuthSessionOptions = {
  /**
   * reuse: keep the existing behavior. Reuse playwright/.auth/user.json if it is valid.
   * fresh: always perform the login flow before the test starts.
   */
  session?: AuthSessionMode;
};

function ensureAuthDir(): void {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
}

function deleteAuthFileIfExists(): void {
  if (fs.existsSync(AUTH_FILE)) {
    fs.rmSync(AUTH_FILE, { force: true });
  }
}

export async function saveAuthenticatedSession(context: BrowserContext): Promise<void> {
  ensureAuthDir();
  await context.storageState({ path: AUTH_FILE });
}

async function isSessionValid(page: Page, appUrl: string): Promise<boolean> {
  const dashboardHomePage = new DashboardHomePage(page);
  const signInButton = page.getByRole('button', { name: 'Sign in' });

  try {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

    await Promise.race([
      dashboardHomePage.promptInput.waitFor({ state: 'visible', timeout: 15000 }),
      signInButton.waitFor({ state: 'visible', timeout: 15000 }),
    ]);

    return await dashboardHomePage.promptInput.isVisible().catch(() => false);
  } catch {
    return false;
  }
}

async function loginAndSaveSession(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const appUrl = process.env.APP_URL ?? 'https://101studio.co/';
  const email = process.env.GOOGLE_EMAIL;
  const password = process.env.GOOGLE_PASSWORD;

  if (!email || !password) {
    throw new Error('Missing GOOGLE_EMAIL or GOOGLE_PASSWORD in .env');
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  const loginPage = new LoginPage(page);
  const dashboardHomePage = new DashboardHomePage(page);

  await loginPage.open(appUrl);
  await loginPage.signInWithGoogle(email, password);
  await dashboardHomePage.waitForLoaded(5 * 60 * 1000);

  await saveAuthenticatedSession(context);

  return { context, page };
}

export async function getAuthenticatedPage(
  browser: Browser,
  options: AuthSessionOptions = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const appUrl = process.env.APP_URL ?? 'https://101studio.co/';
  const sessionMode = options.session ?? 'reuse';

  if (sessionMode === 'fresh') {
    deleteAuthFileIfExists();
    return await loginAndSaveSession(browser);
  }

  if (fs.existsSync(AUTH_FILE)) {
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();

    const valid = await isSessionValid(page, appUrl);
    if (valid) {
      return { context, page };
    }

    await context.close();
    deleteAuthFileIfExists();
  }

  return await loginAndSaveSession(browser);
}
