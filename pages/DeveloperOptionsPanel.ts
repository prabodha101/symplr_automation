import { expect, type Download, type Page, type TestInfo } from '@playwright/test';
import { APP_DEFINITION_TIMEOUT_MS } from './timeouts';

export class DeveloperOptionsPanel {
  constructor(private readonly page: Page) {}

  get downloadAppDefinitionButton() {
    return this.page.getByLabel('Download App Definition').getByRole('button', { name: 'Button' });
  }

  async waitForAppDefinitionAvailable(timeout = APP_DEFINITION_TIMEOUT_MS): Promise<void> {
    await expect(this.downloadAppDefinitionButton).toBeVisible({ timeout });
    await expect(this.downloadAppDefinitionButton).toBeEnabled({ timeout });
  }

  async downloadAppDefinition(testInfo: TestInfo): Promise<string> {
    await this.waitForAppDefinitionAvailable();

    const downloadPromise = this.page.waitForEvent('download');
    await this.downloadAppDefinitionButton.click();
    const download: Download = await downloadPromise;

    const downloadedFilePath = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(downloadedFilePath);
    return downloadedFilePath;
  }

  async openBuildMenu(): Promise<void> {
    await this.waitForAppDefinitionAvailable();

    const parentContainer = this.downloadAppDefinitionButton.locator('..').locator('..');
    const buildMenuButton = parentContainer.locator(':scope > button').nth(1);

    await expect(buildMenuButton).toBeVisible();
    await buildMenuButton.click();
    await expect(this.page.getByText('Build & Run App')).toBeVisible();
  }
}
