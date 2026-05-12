import { expect, Page } from '@playwright/test';

export class ImportFromFigmaPage {
    constructor(private readonly page: Page) {}

    private get importFromFigmaButton() {
        return this.page.getByRole('button', { name: 'Import from Figma' });
    }

    private get figmaUrlInput() {
        return this.page.getByRole('textbox', { name: 'https://www.figma.com/design/' });
    }

    private get importButton() {
        return this.page.getByRole('button', { name: 'Import' });
    }

    async importFromFigma(figmaUrl: string, appName: string): Promise<void> {
        await expect(this.importFromFigmaButton).toBeVisible();
        await this.importFromFigmaButton.click();

        await expect(this.page.getByLabel('', { exact: true }).getByText('Import from Figma')).toBeVisible();

        await this.figmaUrlInput.click();
        await this.figmaUrlInput.fill(figmaUrl);
        await expect(this.importButton).toBeEnabled();
        await this.importButton.click();
        console.log(`  >> Clicked import after filling Figma URL: ${figmaUrl}`);
        
        await expect(this.page.getByText('Setting Up the App, Hang Tight!')).toBeVisible();
        console.log(`  >> App creation from Figma started for app name: ${appName}`);
    }
}