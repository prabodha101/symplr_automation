import { expect, Page } from '@playwright/test';

export class AppRunPage {
  constructor(private readonly page: Page) {}

  get runOnDeviceButton() {
    return this.page.getByLabel('Run App on Your Device').locator('button');
  }

  async waitForBuildComplete(): Promise<void> {
    await expect(this.runOnDeviceButton).toBeVisible({ timeout: 60 * 1000 });
    await expect(this.runOnDeviceButton).toBeEnabled({ timeout: 3 * 60 * 1000 });
  }

  async openRunOnDeviceModal(): Promise<void> {
    await this.waitForBuildComplete();
    await this.runOnDeviceButton.click();
  }

  async waitForQrCodeGenerated(): Promise<void> {
    const qrCode = this.page.getByRole('img', { name: 'Connect Expo' });
    await expect(qrCode).toBeVisible({ timeout: 60 * 1000 });
  }
}