import { Page } from '@playwright/test';
import { DashboardHomePage } from '../pages/DashboardHomePage';
import { ProjectStoryBoardPage } from '../pages/ProjectStoryBoardPage';
import { AppSource } from '../tests/configs/scenarioDefinitions';

export class AppCreationFlows {
  private readonly dashboardHomePage: DashboardHomePage;
  private readonly projectStoryboardPage: ProjectStoryBoardPage;

  constructor(private readonly page: Page) {
    this.dashboardHomePage = new DashboardHomePage(page);
    this.projectStoryboardPage = new ProjectStoryBoardPage(page);
  }

  /*async openDashboard(appUrl: string): Promise<void> {
    await this.dashboardHomePage.open(appUrl);
    await this.dashboardHomePage.waitForLoaded();
  }*/

  async createOrLoadApp(source: AppSource): Promise<void> {
    //await this.openDashboard(appUrl);
    process.env.IS_PROMPT_SCENARIO = 'false';

    switch (source.type) {
      case 'prompt':
        await this.dashboardHomePage.buildAppFromPrompt(source.prompt);
        await this.projectStoryboardPage.waitForLoaded();
        process.env.IS_PROMPT_SCENARIO = 'true';
        break;
      case 'template':
        await this.dashboardHomePage.createAppFromTemplate(source.templateName);
        await this.projectStoryboardPage.waitForLoaded();
        break;
      case 'figma':
        await this.dashboardHomePage.createAppFromFigma(source.figmaUrl, source.figmaAppName);
        await this.projectStoryboardPage.waitForLoaded();
        break;
      case 'existingApp':
        await this.dashboardHomePage.openExistingApp(source.appName);
        await this.projectStoryboardPage.waitForLoaded();
        break;
      default:
        throw new Error(`Unsupported app source: ${(source as { type?: string }).type}`);
    }
  }
}
