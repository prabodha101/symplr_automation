import { expect, Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  private get signInButton() {
    return this.page.getByRole('button', { name: 'Sign in' });
  }

  private get continueWithText() {
    return this.page.getByText('Continue with');
  }

  private get googleSignInButton() {
    return this.page.getByRole('button', { name: 'Sign in with Google' });
  }

  private get emailInput() {
    return this.page.getByRole('textbox', { name: 'Email or phone' });
  }

  private get nextButton() {
    return this.page.getByRole('button', { name: 'Next' });
  }

  private get welcomeHeading() {
    return this.page.getByRole('heading', { name: 'Welcome' }).locator('span');
  }

  private get passwordInput() {
    return this.page.getByRole('textbox', { name: 'Enter your password' });
  }

  async open(appUrl: string): Promise<void> {
    await this.page.goto(appUrl);
  }

  async signInWithGoogle(email: string, password: string): Promise<void> {
    await expect(this.signInButton).toBeVisible();
    await this.signInButton.click();

    await expect(this.continueWithText).toBeVisible();
    await this.googleSignInButton.click();

    await expect(this.page.getByText('Sign in', { exact: true })).toBeVisible();
    await this.emailInput.fill(email);
    await this.nextButton.click();

    await expect(this.welcomeHeading).toBeVisible({ timeout: 30000 });
    await this.passwordInput.fill(password);
    await this.nextButton.click();
  }
}
