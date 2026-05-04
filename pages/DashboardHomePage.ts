import { expect, Page } from '@playwright/test';
import { ImportFromFigmaPage } from './ImportFromFigmaPage';

export class DashboardHomePage {
  
  constructor(private readonly page: Page) {}

  get promptInput() {
    return this.page.getByRole('textbox', { name: 'Write your future app idea' });
  }

  private get startBuildingButton() {
    return this.page.getByRole('button', { name: 'Start Building' });
  }

  private get searchInput() {
    return this.page.getByRole('textbox', { name: 'Search' });
  }

  async open(appUrl: string): Promise<void> {
    await this.page.goto(appUrl);
  }

  async waitForLoaded(timeoutMs: number = 5 * 60 * 1000): Promise<void> {
    const appUrl = process.env.APP_URL ?? 'https://101studio.co/';
    const host = new URL(appUrl).hostname.replace(/\./g, '\\.');
    const appUrlPattern = new RegExp(host);

    await expect(this.page).toHaveURL(appUrlPattern, { timeout: timeoutMs });
    await expect(this.promptInput).toBeVisible({ timeout: timeoutMs });
  }

  async buildAppFromPrompt(prompt: string): Promise<void> {
    await expect(this.promptInput).toBeVisible();
    await this.promptInput.fill(prompt);
    await this.startBuildingButton.click();
  }

  async openExistingApp(appName: string): Promise<void> {
    await this.searchInput.click();
    await this.searchInput.fill(appName);

    const appResult = this.page.getByText(appName).first();
    await expect(appResult).toBeVisible();
    await appResult.click();
  }

  async createAppFromTemplate(templateName: string): Promise<void> {
    // TODO: Implement the application-specific template selection and app creation flow.
    throw new Error(`TODO: Implement createAppFromTemplate() for template "${templateName}".`);
  }

  async createAppFromFigma(figmaUrl: string, appName: string): Promise<void> {
    const importFromFigmaPage = new ImportFromFigmaPage(this.page);
    await importFromFigmaPage.importFromFigma(figmaUrl, appName);
  }
}
