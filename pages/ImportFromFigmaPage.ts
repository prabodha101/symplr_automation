import { expect, Page } from '@playwright/test';

export class ImportFromFigmaPage {
    constructor(private readonly page: Page) {}

    private get importFromFigmaButton() {
        return this.page.getByRole('button', { name: 'Import from Figma' });
    }

    private get figmaUrlInput() {
        return this.page.getByRole('textbox', { name: 'https://www.figma.com/design/' });
    }

    private get continueButton() {
        return this.page.getByRole('button', { name: 'Continue' });
    }

    async importFromFigma(figmaUrl: string, appName: string): Promise<void> {
        await expect(this.importFromFigmaButton).toBeVisible();
        await this.importFromFigmaButton.click();

        await expect(this.page.getByLabel('', { exact: true }).getByText('Import from Figma')).toBeVisible();

        await this.figmaUrlInput.click();
        await this.figmaUrlInput.fill(figmaUrl);
        await expect(this.continueButton).toBeEnabled();
        await this.continueButton.click();

        await expect(this.page.getByText('Configure App')).toBeVisible();

        await this.page.getByRole('textbox').first().click();
        await this.page.getByRole('textbox').first().fill(appName);
        await expect(this.continueButton).toBeEnabled();
        await this.continueButton.click();
        await expect(this.page.getByText('Setting Up the App, Hang')).toBeVisible();
    }
}