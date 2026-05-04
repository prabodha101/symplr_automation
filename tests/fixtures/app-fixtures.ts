import { test as base, expect, type Locator, type Page} from '@playwright/test';
import { getAuthenticatedPage } from '../utils/auth-session';

type AppFixtures = {
  isPromptScenario: boolean;
};

export const test = base.extend<AppFixtures>({
  // Default value is false
  // isPromptScenario: [false, { option: true }],

  page: [async ({ browser }, use) => {
    const { context, page } = await getAuthenticatedPage(browser);

    await use(page);

    await context.close();
  }, { scope: 'test', timeout: 10 * 60 * 1000 }],
});

export { expect };
export { Locator, Page };