import { expect, type Page, type TestInfo } from '@playwright/test';
import { BuildRunPage } from './BuildRunPage';
import { DeveloperOptionsPanel } from './DeveloperOptionsPanel';

export class ProjectStoryBoardPage {
  private readonly developerOptionsPanel: DeveloperOptionsPanel;
  private readonly buildRunPage: BuildRunPage;

  constructor(private readonly page: Page) {
    this.developerOptionsPanel = new DeveloperOptionsPanel(page);
    this.buildRunPage = new BuildRunPage(page);
  }

  get homeButton() {
    return this.page.getByRole('button', { name: 'Home' });
  }

  async waitForLoaded(timeout = 5 * 60 * 1000): Promise<void> {
    await this.page.waitForURL(/\/dashboard\/projects\?appId=[0-9a-fA-F-]+$/, { timeout });
    await expect(this.homeButton).toBeVisible();
  }

  async waitForAppDefinitionAvailable(timeout?: number): Promise<void> {
    await this.developerOptionsPanel.waitForAppDefinitionAvailable(timeout);
  }

  async downloadAppDefinition(testInfo: TestInfo): Promise<string> {
    return await this.developerOptionsPanel.downloadAppDefinition(testInfo);
  }

  async openBuildMenu(): Promise<void> {
    await this.developerOptionsPanel.openBuildMenu();
  }

  async buildAndRunApp(): Promise<Page> {
    await this.openBuildMenu();
    return await this.buildRunPage.buildAndRunApp();
  }
}
