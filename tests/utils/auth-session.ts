import fs from 'node:fs/promises';
import path from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { DashboardHomePage } from '../../pages/DashboardHomePage';
import { LoginPage } from '../../pages/LoginPage';

const DEFAULT_AUTH_FILE = path.resolve(process.cwd(), 'playwright/.auth/user.json');

type AuthSessionMode = 'authenticated' | 'none';

export type AuthPageOptions = {
  session?: AuthSessionMode;
  clearStorageState?: boolean;
  storageStatePath?: string;
  appUrlEnv?: string;
  navigateToApp?: boolean;
};

function resolveAuthFile(storageStatePath?: string): string {
  return storageStatePath ? path.resolve(process.cwd(), storageStatePath) : DEFAULT_AUTH_FILE;
}

function resolveAppUrl(options: AuthPageOptions = {}): string {
  const appUrlEnv = options.appUrlEnv ?? 'APP_URL';
  return process.env[appUrlEnv] ?? process.env.APP_URL ?? 'https://101studio.co/';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureAuthDir(authFile: string = DEFAULT_AUTH_FILE): Promise<void> {
  await fs.mkdir(path.dirname(authFile), { recursive: true });
}

async function deleteAuthFileIfExists(authFile: string = DEFAULT_AUTH_FILE): Promise<void> {
  if (await fileExists(authFile)) {
    await fs.rm(authFile, { force: true });
  }
}

async function isSessionValid(page: Page, appUrl: string): Promise<boolean> {
  const dashboardHomePage = new DashboardHomePage(page);
  const signInButton = page.getByRole('button', { name: /sign in/i });

  try {
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' });

    await Promise.race([
      dashboardHomePage.promptInput.waitFor({ state: 'visible', timeout: 15_000 }),
      signInButton.waitFor({ state: 'visible', timeout: 15_000 }),
    ]);

    return await dashboardHomePage.promptInput.isVisible().catch(() => false);
  } catch {
    return false;
  }
}

async function loginAndSaveSession(
  browser: Browser,
  options: AuthPageOptions = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const appUrl = resolveAppUrl(options);
  const authFile = resolveAuthFile(options.storageStatePath);
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

  await ensureAuthDir(authFile);
  await context.storageState({ path: authFile });

  return { context, page };
}

async function getAuthenticatedPage(
  browser: Browser,
  options: AuthPageOptions = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const appUrl = resolveAppUrl(options);
  const authFile = resolveAuthFile(options.storageStatePath);

  if (options.clearStorageState) {
    await deleteAuthFileIfExists(authFile);
  }

  if (await fileExists(authFile)) {
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();

    const valid = await isSessionValid(page, appUrl);
    if (valid) {
      return { context, page };
    }

    await context.close();
    await deleteAuthFileIfExists(authFile);
  }

  return await loginAndSaveSession(browser, options);
}

async function getUnauthenticatedPage(
  browser: Browser,
  options: AuthPageOptions = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const authFile = resolveAuthFile(options.storageStatePath);
  if (options.clearStorageState) {
    await deleteAuthFileIfExists(authFile);
  }

  const context = await browser.newContext();
  const page = await context.newPage();

  if (options.navigateToApp !== false) {
    await page.goto(resolveAppUrl(options), { waitUntil: 'domcontentloaded' });
  }

  return { context, page };
}

export async function getPageForAuthMode(
  browser: Browser,
  options: AuthPageOptions = {},
): Promise<{ context: BrowserContext; page: Page }> {
  if (options.session === 'none') {
    return await getUnauthenticatedPage(browser, options);
  }

  return await getAuthenticatedPage(browser, options);
}
