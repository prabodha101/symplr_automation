import { Download, expect, Page, TestInfo } from '@playwright/test';
import { env } from 'node:process';
import { AppRunPage } from './AppRunPage';

export class ProjectStoryBoardPage {
  constructor(private readonly page: Page) { }

  get homeButton() {
    return this.page.getByRole('button', { name: 'Home' });
  }

  get downloadAppDefinitionButton() {
    return this.page
      .getByLabel('Download App Definition')
      .getByRole('button', { name: 'Button' });
  }

  async waitForLoaded(timeout = 5 * 60 * 1000): Promise<void> {
    console.log('  >> Waiting for Project Storyboard page to load...');
    await this.page.waitForURL(
      /\/dashboard\/projects\?appId=[0-9a-fA-F-]+$/,
      { timeout }
    );
    await expect(this.homeButton).toBeVisible();
  }

  async waitForAppDefinitionAvailable(timeout = 3 * 60 * 1000): Promise<void> {
    console.log('  >> Waiting for app definition to be available...');
    await this.page.waitForTimeout(10000); // Initial wait to allow the app definition generation process to start
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

  async openDeveloperToolsMenu(): Promise<void> {
    await expect(this.downloadAppDefinitionButton).toBeVisible();

    const parent = this.downloadAppDefinitionButton.locator('..');
    const parentContainer = parent.locator('..');
    const developerToolsMenuButton = parentContainer.locator(':scope > button').first();

    await expect(developerToolsMenuButton).toBeVisible();
    await developerToolsMenuButton.click();
    await expect(this.page.getByText('Developer Tools')).toBeVisible();
  }

  async openBuildMenu(): Promise<void> {
    await expect(this.downloadAppDefinitionButton).toBeVisible();

    const parent = this.downloadAppDefinitionButton.locator('..');
    const parentContainer = parent.locator('..');
    const buildMenuButton = parentContainer.locator(':scope > button').nth(1);

    await expect(buildMenuButton).toBeVisible();
    await buildMenuButton.click();
    await expect(this.page.getByText('Build & Run App')).toBeVisible();
  }

  async downloadCode(): Promise<void> {
    //await this.openBlueprint();
    await this.openDeveloperToolsMenu();

    const downloadButton = this.page.getByRole('button', { name: 'Download' });
    await expect(downloadButton).toBeVisible();
    await downloadButton.click();
  }

  async buildAndRunApp(): Promise<Page> {
    //await this.openBlueprint();
    await this.openBuildMenu();

    const buildButton = this.page.getByRole('button', { name: 'Build' });
    await expect(buildButton).toBeVisible();

    const [previewPage] = await Promise.all([
      this.page.waitForEvent('popup'),
      buildButton.click(),
    ]);

    await previewPage.waitForLoadState('domcontentloaded');

    await expect
      .poll(
        () => {
          const currentUrl = previewPage.url();

          try {
            const url = new URL(currentUrl);
            const appBaseUrl = env.APP_URL ?? 'https://101studio.co';
            const expectedOrigin = new URL(appBaseUrl).origin;

            const isCorrectPath =
              url.origin === expectedOrigin &&
              url.pathname === '/dashboard/preview';

            const appId = url.searchParams.get('appId');
            const action = url.searchParams.get('action');

            const hasValidAppId = /^[0-9a-fA-F-]{36}$/.test(appId ?? '');
            const hasCorrectAction = action === 'build';

            return isCorrectPath && hasValidAppId && hasCorrectAction;
          } catch {
            return false;
          }
        },
        {
          timeout: 1 * 60 * 1000, // 1 minute
          intervals: [1000, 2000, 5000],
        }
      )
      .toBe(true);

    const appRunPage = new AppRunPage(previewPage);
    await appRunPage.waitForBuildComplete();
    return previewPage;
  }

  async connectToGithub(): Promise<void> {
    //await this.openBlueprint();
    await this.openDeveloperToolsMenu();

    const pushButton = this.page.getByRole('button', { name: 'Push' });
    await expect(pushButton).toBeVisible();
    await pushButton.click();

    await expect(this.page.getByText('Repository Name')).toBeVisible();
    await this.page.getByRole('button', { name: 'Continue' }).click();
    //await expect(this.page.getByText('Code Push Started')).toBeVisible({ timeout: 2 * 60 * 1000 });
    await this.continueAndWaitForCodePushResult();
  }

  async continueAndWaitForCodePushResult(): Promise<void> {
    const successPopup = this.page.getByText('Code Push Started', { exact: true });
    const failurePopup = this.page.getByText('Code Push Failed', { exact: true });

    const result = await Promise.race([
      successPopup.waitFor({ state: 'visible', timeout: 70_000 }).then(() => 'success' as const),
      failurePopup.waitFor({ state: 'visible', timeout: 70_000 }).then(() => 'failure' as const),
    ]);

    if (result === 'failure') {
      throw new Error('Code push to GitHub failed: "Code Push Failed" popup was displayed.');
    }
  }
}
