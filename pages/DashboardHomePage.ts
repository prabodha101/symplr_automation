import { expect, Page } from '@playwright/test';

export class DashboardHomePage {
  constructor(private readonly page: Page) {}

  get promptInput() {
    return this.page.getByRole('textbox', { name: 'Write your future app idea' });
  }

  async waitForLoaded(timeoutMs: number = 5 * 60 * 1000): Promise<void> {
    const appUrl = process.env.APP_URL ?? 'https://101studio.co/';
    const host = new URL(appUrl).hostname.replace(/\./g, '\\.');
    const appUrlPattern = new RegExp(host);

    await expect(this.page).toHaveURL(appUrlPattern, { timeout: timeoutMs });
    await expect(this.promptInput).toBeVisible({ timeout: timeoutMs });
  }
}
