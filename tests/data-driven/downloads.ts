import fs from 'node:fs/promises';
import path from 'node:path';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { expect } from '../fixtures/app-fixtures';
import { ProjectStoryBoardPage } from '../../pages/ProjectStoryBoardPage';
import type { ActionConfig } from './models';

export async function runGenericDownloadAction(
  page: Page,
  locator: Locator,
  action: ActionConfig,
  testInfo: TestInfo,
): Promise<void> {
  const timeout = action.timeout ?? 30_000;
  const downloadPromise = page.waitForEvent('download', { timeout });
  await locator.click();

  const download = await downloadPromise;
  const suggestedFilename = download.suggestedFilename();
  const downloadedFilePath = testInfo.outputPath(action.saveAs ?? suggestedFilename);
  await download.saveAs(downloadedFilePath);

  await validateDownloadedFile(downloadedFilePath, suggestedFilename, action);
}

export async function runDownloadAppDefinitionAction(
  page: Page,
  action: ActionConfig,
  testInfo: TestInfo,
): Promise<void> {
  const storyboardPage = new ProjectStoryBoardPage(page);
  const downloadedFilePath = await storyboardPage.downloadAppDefinition(testInfo);
  const suggestedFilename = path.basename(downloadedFilePath);
  await validateDownloadedFile(downloadedFilePath, suggestedFilename, action);
}

export async function validateDownloadedFile(downloadedFilePath: string, suggestedFilename: string, action: ActionConfig): Promise<void> {
  await expect(async () => await fs.access(downloadedFilePath)).not.toThrow();

  const fileStats = await fs.stat(downloadedFilePath);
  const minBytes = action.minBytes ?? 1;
  expect(fileStats.size, `Downloaded file is at least ${minBytes} byte(s)`).toBeGreaterThanOrEqual(minBytes);

  if (action.expectedExtension) {
    const expectedExtension = normalizeExtension(action.expectedExtension);
    const actualExtension = path.extname(suggestedFilename).toLowerCase();
    expect(actualExtension, `Downloaded file extension for ${suggestedFilename}`).toBe(expectedExtension);
  }

  if (action.expectedFileNameContains) {
    expect(suggestedFilename, `Downloaded file name contains ${action.expectedFileNameContains}`).toContain(action.expectedFileNameContains);
  }

  if (action.validateJson) {
    const rawContent = await fs.readFile(downloadedFilePath, 'utf-8');
    expect(() => JSON.parse(rawContent), `Downloaded file is valid JSON: ${suggestedFilename}`).not.toThrow();
  }
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}
