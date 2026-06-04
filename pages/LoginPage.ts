import { expect, type Locator, type Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  private get signInButton() {
    return this.page.getByRole('button', { name: /sign in/i });
  }

  private get continueWithText() {
    return this.page.getByText(/continue with/i);
  }

  private get googleSignInButton() {
    return this.page.getByRole('button', { name: /google/i });
  }

  async open(appUrl: string): Promise<void> {
    await this.page.goto(appUrl);
  }

  async signInWithGoogle(email: string, password: string): Promise<void> {
    await expect(this.signInButton).toBeVisible();
    await this.signInButton.click();

    await expect(this.continueWithText).toBeVisible();
    await this.googleSignInButton.click();

    const emailInput = await this.waitForFirstVisibleLocator([
      this.page.getByRole('textbox', { name: /email|phone/i }),
      this.page.locator('input[type="email"], input[type="text"]').first(),
    ]);
    await emailInput.fill(email);
    await this.getNextButton().click();

    const passwordInput = await this.waitForFirstVisibleLocator([
      this.page.getByRole('textbox', { name: /password/i }),
      this.page.locator('input[type="password"]').first(),
    ], 60_000);
    await passwordInput.fill(password);
    await this.getNextButton().click();
  }

  private getNextButton(): Locator {
    return this.page.getByRole('button', { name: /^next$/i });
  }

  private async waitForFirstVisibleLocator(locators: Locator[], timeoutMs = 30_000): Promise<Locator> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      for (const locator of locators) {
        if (await locator.isVisible().catch(() => false)) {
          return locator;
        }
      }
      await this.page.waitForTimeout(500);
    }

    throw new Error('Could not find any expected Google authentication field before timeout.');
  }
}
