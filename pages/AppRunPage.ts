import { expect, type Page } from '@playwright/test';
import { BUILD_COMPLETE_TIMEOUT_MS, ELEMENT_VISIBLE_TIMEOUT_MS, QR_CODE_TIMEOUT_MS } from './timeouts';

export class AppRunPage {
  constructor(private readonly page: Page) {}

  get runOnDeviceButton() {
    return this.page.getByLabel('Run App on Your Device').locator('button');
  }

  async waitForBuildComplete(): Promise<void> {
    await expect(this.runOnDeviceButton).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS });
    await expect(this.runOnDeviceButton).toBeEnabled({ timeout: BUILD_COMPLETE_TIMEOUT_MS });
  }

  async openRunOnDeviceModal(): Promise<void> {
    await this.waitForBuildComplete();
    await this.runOnDeviceButton.click();
  }

  async waitForQrCodeGenerated(): Promise<void> {
    const qrCode = this.page.getByRole('img', { name: 'Connect Expo' });
    await expect(qrCode).toBeVisible({ timeout: QR_CODE_TIMEOUT_MS });
  }
}
