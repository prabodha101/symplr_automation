import { Download, expect, Page, TestInfo } from '@playwright/test';
import { env } from 'node:process';
import { AppRunPage } from './AppRunPage';

export class ProjectStoryBoardPage {
  constructor(private readonly page: Page) {}

  get homeButton() {
    return this.page.getByRole('button', { name: 'Home' });
  }

  get downloadAppDefinitionButton() {
    return this.page
      .getByLabel('Download App Definition')
      .getByRole('button', { name: 'Button' });
  }

  async waitForLoaded(timeout = 5 * 60 * 1000): Promise<void> {
      await this.page.waitForURL(
          /\/dashboard\/projects\?appId=[0-9a-fA-F-]+$/,
          { timeout }
      );
      await expect(this.homeButton).toBeVisible();
  }

  async waitForAppDefinitionAvailable(timeout = 3 * 60 * 1000): Promise<void> {
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

  /*async openDashboardOption(optionName: string): Promise<void> {
    const option = this.page.locator(
      `[data-testid^="nav-item-"][aria-label="${optionName}"]`
    );

    await expect(option).toBeVisible();
    await option.click();
  }

  async openBlueprint(): Promise<void> {
    await this.openDashboardOption('Blueprint');
    // Validates the Start label in the Blueprint screen
    const startLabel = this.page.getByText('Start');
    await expect(startLabel).toBeVisible();

    const startDiv = this.page.locator('div[data-id="start"]');
    await expect(startDiv).toBeVisible();

    // Validate that there is a screen connected to the Start node.
    //const isScreenNext = await this.page.locator('div[data-id="start"] + div[data-id^="screen:"]').isVisible();
    //
    //if (!isScreenNext) {
    //  throw new Error('There are no screens connected to the Start node in the Blueprint.');
    //}
  }

  async openPages(): Promise<void> {
    await this.openDashboardOption('Pages');
    // Validates the Screens label in the Pages screen
    const screensLabel = this.page.locator('p', { hasText: /^Screens$/ });
    await expect(screensLabel).toBeVisible();

    // Validate app sceen count
    const screens = this.page.locator('div.Screens-list-item.MuiBox-root');
    const count = await screens.count();
    await expect(count, 'No screens found in the Pages dashboard!').toBeGreaterThan(0);
    console.log(`Found ${count} screens.`);

    // Validate 'First Screen' text is visible in the Property window
    const firstScreenText = this.page.getByText('First Screen');
    await expect(firstScreenText).toBeVisible();

    // Validate 'Enable Nav Bar' text is visible in the Property window
    const enableNavBarText = this.page.getByText('Enable Nav Bar');
    await expect(enableNavBarText).toBeVisible();

    const mainScreen = this.page.locator('#PreviewScreen-main');
    await expect(mainScreen).toBeVisible();
    await mainScreen.click();

    await expect(this.page.getByText('Width', { exact: true })).toBeVisible();
    await expect(this.page.getByText('Height', { exact: true })).toBeVisible();
  }

  async openThemes(): Promise<void> {
    await this.openDashboardOption('Themes');
    // Validates the Themes label in the Theme screen
    const screensLabel = this.page.locator('p', { hasText: /^Theme$/ });
    await expect(screensLabel).toBeVisible();

    await expect(this.page.getByRole('button', { name: 'Add' })).toBeVisible();

    const nextDiv = screensLabel.locator('xpath=following-sibling::div[1]');
    await expect(nextDiv).toBeVisible();

    await expect(nextDiv.getByText('Tokens')).toBeVisible();
    await expect(nextDiv.getByText('Border')).toBeVisible();
    await expect(nextDiv.getByText('Color')).toBeVisible();
    await expect(nextDiv.getByText('Component')).toBeVisible();
    await expect(nextDiv.getByText('Radius')).toBeVisible();
    await expect(nextDiv.getByText('Space')).toBeVisible();
    await expect(nextDiv.getByText('Typography')).toBeVisible();
    await expect(nextDiv.getByText('Shadow')).toBeVisible();

    await expect(this.page.locator('table.MuiTable-root')).toBeVisible();
  }

  async openVariables(): Promise<void> {
    await this.openDashboardOption('Variables');
    // Validates the Variables label in the Variables screen
    const screensLabel = this.page.locator('p', { hasText: /^Variables$/ });
    await expect(screensLabel).toBeVisible();
  }

  async openSettings(): Promise<void> {
    await this.openDashboardOption('Settings');  

    const appAssetsButton = this.page.getByRole('button', { name: 'App Assets' }).first();
    const appDetailsButton = this.page.getByRole('button', { name: 'App Details' });
    const sequrityButton = this.page.getByRole('button', { name: 'Security' });
    const appBarAndNavBarButton = this.page.getByRole('button', { name: 'App Bar & Nav Bar' });

    await expect(appAssetsButton).toBeVisible();
    await expect(appDetailsButton).toBeVisible();
    await expect(sequrityButton).toBeVisible();
    await expect(appBarAndNavBarButton).toBeVisible();

    await appAssetsButton.click();
    const screensLabel = this.page.locator('p', { hasText: /^App Assets$/ }).first();
    await expect(screensLabel).toBeVisible();

    await expect(this.page.getByText('App Assets').nth(1)).toBeVisible();
    await expect(this.page.getByText('App Launcher Icon')).toBeVisible();

    await appDetailsButton.click();
    await expect(this.page.getByText('App Details').nth(1)).toBeVisible();

    const nameTextbox = this.page.getByRole('textbox', { name: 'name' });
    await expect(nameTextbox).toBeVisible();
    
    if(process.env.IS_PROMPT_SCENARIO === 'false') {
      await expect(nameTextbox).toHaveValue(process.env.FIGMA_APP_NAME);
    }

    await expect(this.page.getByRole('textbox', { name: 'description' })).toBeVisible();
    await expect(this.page.getByText('Advance Settings')).toBeVisible();
    
    const reactNativeVersionCombo = this.page.locator('#react-native-version');
    await expect(reactNativeVersionCombo).toBeVisible();
    //TODO: If this comes from figma, then store the selected nodeVersion on a variable and validate it here.
    await expect(reactNativeVersionCombo).toHaveText('0.81.4');

    sequrityButton.click();
    await expect(this.page.getByText('Security').nth(1)).toBeVisible();
    await expect(this.page.getByText('Simulation Detection', { exact: true })).toBeVisible();
    await expect(this.page.getByText('Simulation Detection helps protect your app by identifying if it’s being run in a simulated or fake environment, reducing the risk of fraud and unauthorized testing.')).toBeVisible();

    await expect(this.page.getByText('Screen Capture Detection', { exact: true })).toBeVisible();
    await expect(this.page.getByText('Screen Capture helps safeguard sensitive content in your app by detecting and preventing screenshots or screen recordings, protecting user privacy and data.')).toBeVisible();

    await expect(this.page.getByText('Root Device Detection', { exact: true })).toBeVisible();
    await expect(this.page.getByText('Root Device Detection helps protect your app by detecting if it’s running on a rooted device, reducing the risk of data breaches and unauthorized access.')).toBeVisible();

    await expect(this.page.getByText('Jailbreak Device Detection', { exact: true })).toBeVisible();
    await expect(this.page.getByText('Jailbreak Device Detection helps protect your app by identifying if it\'s running on a jailbroken device, which can expose it to security threats and unauthorized access.')).toBeVisible();

    await expect(this.page.getByText('Disable Native Console Logging', { exact: true })).toBeVisible();
    await expect(this.page.getByText('Disable Native Console Logging prevents sensitive app information from being logged to the device’s console, helping protect against data leaks and improving overall app security.')).toBeVisible();
  
    await this.validateAllTogglesWorkInSequrityTab();

    appBarAndNavBarButton.click();
    await expect(this.page.getByText('App Bar & Nav Bar').nth(1)).toBeVisible();
  }

  async validateAllTogglesWorkInSequrityTab(): Promise<void> {
    const toggles = this.page.locator('input[type="checkbox"]');
    const count = await toggles.count();

    expect(count).toBe(5);

    for (let i = 0; i < count; i++) {
      const toggle = toggles.nth(i);
      const switchRoot = toggle.locator('xpath=..'); // clickable wrapper

      const initialState = await toggle.isChecked();

      await switchRoot.click();

      if (initialState) {
        await expect(toggle).not.toBeChecked();
      } else {
        await expect(toggle).toBeChecked();
      }

      await switchRoot.click();

      if (initialState) {
        await expect(toggle).toBeChecked();
      } else {
        await expect(toggle).not.toBeChecked();
      }
    }
  }*/

  async connectToGithub(): Promise<void> {
    //await this.openBlueprint();
    await this.openDeveloperToolsMenu();

    const pushButton = this.page.getByRole('button', { name: 'Push' });
    await expect(pushButton).toBeVisible();
    await pushButton.click();

    await expect(this.page.getByText('Push Code to GitHub')).toBeVisible();
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
