import { expect, test as base } from '@playwright/test';
import type { AuthPageOptions } from '../utils/auth-session';
import { getPageForAuthMode } from '../utils/auth-session';

type AppFixtures = {
  auth: AuthPageOptions;
};

export const test = base.extend<AppFixtures>({
  auth: [{ session: 'authenticated' }, { option: true }],

  page: [async ({ browser, auth }, use) => {
    const { context, page } = await getPageForAuthMode(browser, auth);
    await use(page);
    await context.close();
  }, { scope: 'test', timeout: 10 * 60 * 1000 }],
});

export { expect };
