import { test as base, expect, type Locator, type Page} from '@playwright/test';
import {
  getAuthenticatedPage,
  saveAuthenticatedSession,
  type AuthSessionMode,
} from '../utils/auth-session';

type AppFixtures = {
  isPromptScenario: boolean;
  /**
   * Default is "reuse", which preserves the current login-session behavior.
   * Use "fresh" for tests such as first-time user onboarding where the login
   * flow must run before the test body starts.
   */
  authSessionMode: AuthSessionMode;
  /**
   * Save browser storage state after the test body finishes.
   * Keep false by default so existing tests behave exactly as before.
   */
  saveAuthSessionAfterTest: boolean;
};

export const test = base.extend<AppFixtures>({
  // Default value is false
  // isPromptScenario: [false, { option: true }],
  authSessionMode: ['reuse', { option: true }],
  saveAuthSessionAfterTest: [false, { option: true }],

  page: [async ({ browser, authSessionMode, saveAuthSessionAfterTest }, use) => {
    const { context, page } = await getAuthenticatedPage(browser, {
      session: authSessionMode,
    });

    await use(page);

    if (saveAuthSessionAfterTest) {
      await saveAuthenticatedSession(context);
    }

    await context.close();
  }, { scope: 'test', timeout: 10 * 60 * 1000 }],
});

export { expect };
export { Locator, Page };
