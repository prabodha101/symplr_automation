import { expect, type Page } from '@playwright/test';
import { BUILD_PREVIEW_TIMEOUT_MS } from './timeouts';

export class BuildRunPage {
  constructor(private readonly page: Page) {}

  get buildButton() {
    return this.page.getByRole('button', { name: 'Build' });
  }

  async buildAndRunApp(timeout = BUILD_PREVIEW_TIMEOUT_MS): Promise<Page> {
    await expect(this.buildButton).toBeVisible();

    const [previewPage] = await Promise.all([
      this.page.waitForEvent('popup'),
      this.buildButton.click(),
    ]);

    await previewPage.waitForLoadState('domcontentloaded');

    const expectedOrigin = new URL(process.env.APP_URL ?? 'https://101studio.co').origin;

    await expect
      .poll(
        () => {
          const currentUrl = previewPage.url();
          try {
            const url = new URL(currentUrl);
            const appId = url.searchParams.get('appId');
            return (
              url.origin === expectedOrigin &&
              url.pathname === '/dashboard/preview' &&
              /^[0-9a-fA-F-]{36}$/.test(appId ?? '') &&
              url.searchParams.get('action') === 'build'
            );
          } catch {
            return false;
          }
        },
        {
          timeout,
          intervals: [1000, 2000, 5000],
        },
      )
      .toBe(true);

    return previewPage;
  }
}
