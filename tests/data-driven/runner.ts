import fs from 'node:fs';
import path from 'node:path';
import { downloadZipFromEmailLink } from '../../integrations/email/GmailDownloadLink';
import { waitForGmailEmail, type ReceivedGmailEmail } from '../../integrations/email/GmailInbox';
import { AppRunPage } from '../../pages/AppRunPage';
import { ProjectStoryBoardPage } from '../../pages/ProjectStoryBoardPage';
import { expect, test, type Locator, type Page } from '../fixtures/app-fixtures';
import { defaultIncludeSections, hasIncludedSection, normalizeTestCaseInclude, testCaseLookup, testData } from './config';
import { buildLocator, containsPattern, escapeRegExp } from './locator-utils';
import type {
  ActionConditionConfig,
  ActionConfig,
  AssertionConfig,
  IncludeSection,
  PageCase,
  RunContext,
  ValidationConfig,
} from './models';

export function createRunContext(page: Page): RunContext {
  return { mainPage: page, activePage: page };
}

function getAppRunPage(context: RunContext): AppRunPage {
  const targetPage = context.runPage ?? context.activePage;
  if (!context.appRunPage || targetPage !== context.runPage) {
    context.appRunPage = new AppRunPage(targetPage);
  }
  return context.appRunPage;
}

export async function runPrerequisiteTestCases(
  context: RunContext,
  pageCase: PageCase,
  testInfo: import('@playwright/test').TestInfo,
  includeStack: string[],
): Promise<void> {
  for (const prerequisite of pageCase.prerequisiteTestCases ?? []) {
    const normalizedPrerequisite = normalizeTestCaseInclude(prerequisite);
    const prerequisiteTestCase = testCaseLookup.get(normalizedPrerequisite.name);

    if (!prerequisiteTestCase) {
      throw new Error(`Prerequisite test case not found: ${normalizedPrerequisite.name}. Referenced from: ${pageCase.name}`);
    }

    if (includeStack.includes(prerequisiteTestCase.name)) {
      throw new Error(`Circular prerequisiteTestCases reference detected: ${[...includeStack, prerequisiteTestCase.name].join(' -> ')}`);
    }

    await test.step(` >> prerequisite test case: ${prerequisiteTestCase.name}`, async () => {
      await runFullConfiguredTestCaseFlow(
        context,
        prerequisiteTestCase,
        testInfo,
        [...includeStack, prerequisiteTestCase.name],
        normalizedPrerequisite.sections,
      );
    });
  }
}

async function runFullConfiguredTestCaseFlow(
  context: RunContext,
  pageCase: PageCase,
  testInfo: import('@playwright/test').TestInfo,
  includeStack: string[],
  sections: IncludeSection[] = defaultIncludeSections,
): Promise<void> {
  await runPrerequisiteTestCases(context, pageCase, testInfo, includeStack);

  if (pageCase.path || pageCase.url) {
    const targetUrl = buildTargetUrl(pageCase);
    await context.activePage.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: pageCase.navigationTimeout ?? testData.defaults?.navigationTimeout ?? 15_000,
    });
  }

  await runConfiguredTestCaseSections(context, pageCase, testInfo, includeStack, sections);
}

export async function runConfiguredTestCaseSections(
  context: RunContext,
  pageCase: PageCase,
  testInfo: import('@playwright/test').TestInfo,
  includeStack: string[],
  sections: IncludeSection[] = defaultIncludeSections,
): Promise<void> {
  if (hasIncludedSection(sections, 'beforeValidateActions')) {
    for (const action of pageCase.beforeValidateActions ?? []) {
      await test.step(` >> before validation action: ${action.name ?? action.type}`, async () => {
        await runAction(context, action, undefined, testInfo, pageCase);
      });
    }
  }

  if (hasIncludedSection(sections, 'pageAssertions')) {
    for (const assertion of pageCase.pageAssertions ?? []) {
      console.log(`Running page assertion: ${assertion.type}`);
      await test.step(` >> page assertion: ${assertion.type}`, async () => {
        await runPageAssertion(context.activePage, pageCase, assertion);
      });
    }
  }

  if (hasIncludedSection(sections, 'validations')) {
    await runValidations(context, pageCase, pageCase.validations ?? [], testInfo);
  }

  if (hasIncludedSection(sections, 'pageActions')) {
    await runPageActions(context, pageCase, pageCase.pageActions ?? [], testInfo);
  }

  if (hasIncludedSection(sections, 'includeTestCases')) {
    await runIncludedTestCases(context, pageCase, testInfo, includeStack);
  }
}

async function runIncludedTestCases(
  context: RunContext,
  pageCase: PageCase,
  testInfo: import('@playwright/test').TestInfo,
  includeStack: string[],
): Promise<void> {
  for (const include of pageCase.includeTestCases ?? []) {
    const normalizedInclude = normalizeTestCaseInclude(include);
    const includedTestCase = testCaseLookup.get(normalizedInclude.name);

    if (!includedTestCase) {
      throw new Error(`Included test case not found: ${normalizedInclude.name}. Referenced from: ${pageCase.name}`);
    }

    if (includeStack.includes(includedTestCase.name)) {
      throw new Error(`Circular includeTestCases reference detected: ${[...includeStack, includedTestCase.name].join(' -> ')}`);
    }

    await test.step(` >> included test case: ${includedTestCase.name}`, async () => {
      await runConfiguredTestCaseSections(
        context,
        includedTestCase,
        testInfo,
        [...includeStack, includedTestCase.name],
        normalizedInclude.sections,
      );
    });
  }
}

export async function runValidations(
  context: RunContext,
  pageCase: PageCase,
  validations: ValidationConfig[],
  testInfo: import('@playwright/test').TestInfo,
): Promise<void> {
  for (const validation of validations) {
    console.log(` >> Running validation: ${validation.name}`);

    await test.step(validation.name, async () => {
      const locator = buildLocator(context.activePage, validation.locator);

      for (const action of validation.actions ?? []) {
        await runAction(context, action, locator, testInfo, pageCase);
      }

      for (const assertion of validation.assertions) {
        await runLocatorAssertion(locator, pageCase, validation, assertion);
      }
    });
  }
}

export async function runPageActions(
  context: RunContext,
  pageCase: PageCase,
  actions: ActionConfig[],
  testInfo: import('@playwright/test').TestInfo,
): Promise<void> {
  for (const action of actions) {
    const postActionValidations = [...(action.validations ?? []), ...(action.postValidations ?? [])];
    const actionLabel = action.name ?? action.type ?? 'validation-only action';

    if (action.retryOnValidationFailure && postActionValidations.length > 0) {
      await test.step(` >> Page action with validation retry: ${actionLabel}`, async () => {
        await runActionWithValidationRetry(context, pageCase, action, postActionValidations, testInfo);
      });
    } else {
      await test.step(` >> Page action: ${actionLabel}`, async () => {
        await runAction(context, action, undefined, testInfo, pageCase);
      });

      await runValidations(context, pageCase, postActionValidations, testInfo);
    }

    await runPageActions(context, pageCase, action.pageActions ?? [], testInfo);
  }
}

async function runActionWithValidationRetry(
  context: RunContext,
  pageCase: PageCase,
  action: ActionConfig,
  postActionValidations: ValidationConfig[],
  testInfo: import('@playwright/test').TestInfo,
): Promise<void> {
  const attempts = Math.max(1, Number(action.retryAttempts ?? 3));
  const retryDelayMs = Math.max(0, Number(action.retryDelayMs ?? 1_000));
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      console.log(` >> Action attempt ${attempt}/${attempts}: ${action.name ?? action.type ?? 'validation-only action'}`);
      await runAction(context, action, undefined, testInfo, pageCase);
      await runValidations(context, pageCase, postActionValidations, testInfo);
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Action "${action.name ?? action.type ?? 'validation-only action'}" did not pass its post-action validations after ${attempts} attempt(s). Last error: ${message}`);
      }

      console.log(` >> Action validation failed. Waiting ${retryDelayMs}ms before retry ${attempt + 1}/${attempts}.`);
      await context.activePage.waitForTimeout(retryDelayMs);
    }
  }

  throw lastError;
}

function buildTargetUrl(pageCase: PageCase): string {
  if (pageCase.url) return pageCase.url;

  const baseUrl = process.env.APP_URL ?? pageCase.baseUrl ?? testData.defaults?.baseUrl;
  if (!baseUrl) {
    throw new Error(`Page "${pageCase.name}" must define either url or path, and APP_URL must be set in .env.`);
  }

  return new URL(pageCase.path ?? '/', baseUrl).toString();
}

function resolveActionValue(action: ActionConfig): string | number | boolean | undefined {
  if (action.valueEnv) {
    const value = process.env[action.valueEnv];
    if (value === undefined) {
      throw new Error(`Action "${action.name ?? action.type ?? 'unnamed'}" requires environment variable ${action.valueEnv}, but it is not set.`);
    }
    return value;
  }
  return action.value;
}

async function runClickAndSwitchToPopupAction(context: RunContext, locator: Locator, action: ActionConfig): Promise<void> {
  const timeout = action.timeout ?? 60_000;
  const sourcePage = context.activePage;
  const popupPromise = sourcePage.waitForEvent('popup', { timeout });
  await locator.click();
  const popupPage = await popupPromise;

  await popupPage.waitForLoadState('domcontentloaded', { timeout }).catch(() => {
    // Some OAuth pages keep loading while redirects happen.
  });

  context.popupPage = popupPage;
  context.activePage = popupPage;
  await popupPage.bringToFront();
}

export async function runAction(
  context: RunContext,
  action: ActionConfig,
  defaultLocator?: Locator,
  testInfo?: import('@playwright/test').TestInfo,
  pageCase?: PageCase,
): Promise<void> {
  const locator = action.locator ? buildLocator(context.activePage, action.locator) : defaultLocator;

  if (!action.type) {
    return;
  }

  switch (action.type) {
    case 'click':
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      await locator.click();
      return;
    case 'fill':
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      await locator.fill(String(resolveActionValue(action) ?? ''));
      return;
    case 'check':
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      await locator.check();
      return;
    case 'uncheck':
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      await locator.uncheck();
      return;
    case 'hover':
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      await locator.hover();
      return;
    case 'press': {
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      const pressValue = resolveActionValue(action);
      if (!pressValue) throw new Error('press action requires "value", for example "Enter".');
      await locator.press(String(pressValue));
      return;
    }
    case 'selectOption': {
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      const optionValue = resolveActionValue(action);
      if (optionValue === undefined) throw new Error('selectOption action requires "value".');
      await locator.selectOption(String(optionValue));
      return;
    }
    case 'download':
      if (!locator) throw new Error('download action requires a locator.');
      if (!testInfo) throw new Error('download action requires Playwright testInfo.');
      await runGenericDownloadAction(context.activePage, locator, action, testInfo);
      return;
    case 'clickAndSwitchToPopup':
      if (!locator) throw new Error('clickAndSwitchToPopup action requires a locator.');
      await runClickAndSwitchToPopupAction(context, locator, action);
      return;
    case 'switchToPopupPage':
      if (!context.popupPage || context.popupPage.isClosed()) {
        throw new Error('switchToPopupPage requires a previous "clickAndSwitchToPopup" action and an open popup page.');
      }
      context.activePage = context.popupPage;
      await context.popupPage.bringToFront();
      return;
    case 'waitForTimeout':
      await context.activePage.waitForTimeout(Number(action.timeout ?? action.value ?? 1_000));
      return;
    case 'waitForLoadState': {
      const state = String(action.value ?? 'domcontentloaded') as 'load' | 'domcontentloaded' | 'networkidle';
      await context.activePage.waitForLoadState(state, { timeout: action.timeout ?? 30_000 });
      return;
    }
    case 'downloadAppDefinition':
      if (!testInfo) throw new Error('downloadAppDefinition action requires Playwright testInfo.');
      await runDownloadAppDefinitionAction(context.mainPage, action, testInfo);
      return;
    case 'downloadCodeEmail':
      if (!testInfo) throw new Error('downloadCodeEmail action requires Playwright testInfo.');
      await runDownloadCodeEmailAction(context, action, testInfo);
      return;
    case 'connectToGitHubEmail':
      await runConnectToGitHubEmailAction(action);
      return;
    case 'fillEmailCodeAndSubmit':
      await runFillEmailCodeAndSubmitAction(context, action);
      return;
    case 'conditional':
      if (!testInfo) throw new Error('conditional action requires Playwright testInfo.');
      if (!pageCase) throw new Error('conditional action requires the current test case context.');
      await runConditionalAction(context, pageCase, action, testInfo);
      return;
    case 'buildAndRunApp':
      await runBuildAndRunAppAction(context);
      return;
    case 'waitForBuildComplete':
      await getAppRunPage(context).waitForBuildComplete();
      return;
    case 'openRunOnDeviceModal':
      await getAppRunPage(context).openRunOnDeviceModal();
      return;
    case 'waitForQrCodeGenerated':
      await getAppRunPage(context).waitForQrCodeGenerated();
      return;
    case 'switchToMainPage':
      context.activePage = context.mainPage;
      await context.mainPage.bringToFront();
      return;
    case 'switchToRunPage':
      if (!context.runPage || context.runPage.isClosed()) {
        throw new Error('switchToRunPage requires a previous "buildAndRunApp" action that opened the run page.');
      }
      context.activePage = context.runPage;
      await context.runPage.bringToFront();
      return;
    default: {
      const unknown: never = action.type;
      throw new Error(`Unsupported action type: ${unknown}`);
    }
  }
}

async function runConditionalAction(
  context: RunContext,
  pageCase: PageCase,
  action: ActionConfig,
  testInfo: import('@playwright/test').TestInfo,
): Promise<void> {
  if (!action.condition) {
    throw new Error('conditional action requires "condition".');
  }

  const matched = await evaluateActionCondition(context, action.condition);
  const branchName = matched ? 'then' : 'else';
  console.log(` >> Conditional action "${action.name ?? action.type}" matched ${branchName} branch.`);

  const branchActions = matched ? action.thenActions ?? [] : action.elseActions ?? [];
  const branchValidations = matched ? action.thenValidations ?? [] : action.elseValidations ?? [];

  await test.step(` >> conditional ${branchName} branch: ${action.name ?? action.type}`, async () => {
    await runPageActions(context, pageCase, branchActions, testInfo);
    await runValidations(context, pageCase, branchValidations, testInfo);
  });
}

async function evaluateActionCondition(context: RunContext, condition: ActionConditionConfig): Promise<boolean> {
  const timeout = Number(condition.timeout ?? 5_000);
  const assertion = condition.assertion ?? 'visible';
  const locator = buildLocator(context.activePage, condition.locator);

  try {
    switch (assertion) {
      case 'visible':
        await expect(locator).toBeVisible({ timeout });
        return true;
      case 'hidden':
        await expect(locator).toBeHidden({ timeout });
        return true;
      case 'attached':
        await expect(locator).toBeAttached({ timeout });
        return true;
      default: {
        const unknown: never = assertion;
        throw new Error(`Unsupported conditional assertion: ${unknown}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(` >> Conditional assertion "${assertion}" did not match within ${timeout}ms. Running else branch. Details: ${message.split('\n')[0]}`);
    return false;
  }
}

async function runBuildAndRunAppAction(context: RunContext): Promise<void> {
  const storyboardPage = new ProjectStoryBoardPage(context.mainPage);
  const runPage = await storyboardPage.buildAndRunApp();

  context.runPage = runPage;
  context.activePage = runPage;
  context.appRunPage = new AppRunPage(runPage);

  await runPage.bringToFront();
}

async function runGenericDownloadAction(
  page: Page,
  locator: Locator,
  action: ActionConfig,
  testInfo: import('@playwright/test').TestInfo,
): Promise<void> {
  const timeout = action.timeout ?? 30_000;
  const downloadPromise = page.waitForEvent('download', { timeout });
  await locator.click();

  const download = await downloadPromise;
  const suggestedFilename = download.suggestedFilename();
  const downloadedFilePath = testInfo.outputPath(action.saveAs ?? suggestedFilename);
  await download.saveAs(downloadedFilePath);

  validateDownloadedFile(downloadedFilePath, suggestedFilename, action);
}

async function runDownloadAppDefinitionAction(
  page: Page,
  action: ActionConfig,
  testInfo: import('@playwright/test').TestInfo,
): Promise<void> {
  const storyboardPage = new ProjectStoryBoardPage(page);
  const downloadedFilePath = await storyboardPage.downloadAppDefinition(testInfo);
  const suggestedFilename = path.basename(downloadedFilePath);
  validateDownloadedFile(downloadedFilePath, suggestedFilename, action);
}

async function runDownloadCodeEmailAction(
  context: RunContext,
  action: ActionConfig,
  testInfo: import('@playwright/test').TestInfo,
): Promise<void> {
  const expectedEmailSubject = action.expectedEmailSubject ?? 'Download Code';
  const emailTo = action.emailTo ?? process.env.GOOGLE_EMAIL;
  const emailFrom = action.emailFrom ?? process.env.EMAIL_SENDER;

  if (!emailTo) {
    throw new Error('downloadCodeEmail requires GOOGLE_EMAIL in .env or "emailTo" in the action.');
  }

  const sentAt = new Date(Date.now() - 10_000);

  const email = await waitForGmailEmail({
    from: emailFrom,
    to: emailTo,
    subjectContains: expectedEmailSubject,
    bodyContains: action.emailBodyContains,
    after: sentAt,
    timeoutMs: action.timeout ?? 180_000,
    pollIntervalMs: action.pollIntervalMs ?? 5_000,
  });

  expect(email.subject).toContain(expectedEmailSubject);

  const zipFilePath = testInfo.outputPath(action.saveAs ?? `email-download-${Date.now()}.zip`);
  const { savedFilePath, downloadUrl } = await downloadZipFromEmailLink(email, zipFilePath, {
    request: context.activePage.context().request,
    timeoutMs: action.timeout ?? 180_000,
  });

  validateDownloadedFile(savedFilePath, path.basename(savedFilePath), {
    ...action,
    expectedExtension: action.expectedExtension ?? '.zip',
    minBytes: action.minBytes ?? 1,
  });

  await testInfo.attach('downloaded-code-zip', {
    path: savedFilePath,
    contentType: 'application/zip',
  });

  console.log(`Received download code email with subject: ${email.subject}`);
  console.log(`Downloaded ZIP from email link: ${downloadUrl}`);
  console.log(`Saved ZIP file to: ${savedFilePath}`);
}

async function runConnectToGitHubEmailAction(action: ActionConfig): Promise<void> {
  const expectedEmailSubject = action.expectedEmailSubject ?? 'Push Code Github';
  const emailTo = action.emailTo ?? process.env.GOOGLE_EMAIL;
  const emailFrom = action.emailFrom ?? process.env.EMAIL_SENDER;

  if (!emailTo) {
    throw new Error('connectToGitHubEmail requires GOOGLE_EMAIL in .env or "emailTo" in the action.');
  }

  const sentAt = new Date(Date.now() - 10_000);

  const email = await waitForGmailEmail({
    from: emailFrom,
    to: emailTo,
    subjectContains: expectedEmailSubject,
    bodyContains: action.emailBodyContains,
    after: sentAt,
    timeoutMs: action.timeout ?? 180_000,
    pollIntervalMs: action.pollIntervalMs ?? 5_000,
  });

  expect(email.subject).toContain(expectedEmailSubject);
  console.log(`Received GitHub email with subject: ${email.subject}`);
}

async function runFillEmailCodeAndSubmitAction(context: RunContext, action: ActionConfig): Promise<void> {
  if (!action.locator) {
    throw new Error('fillEmailCodeAndSubmit action requires locator for the verification code input.');
  }
  if (!action.verifyButtonLocator) {
    throw new Error('fillEmailCodeAndSubmit action requires verifyButtonLocator.');
  }

  const expectedEmailSubject = action.expectedEmailSubject ?? '[GitHub] Please verify your device';
  const emailTo = action.emailTo ?? process.env.GOOGLE_EMAIL;

  if (!emailTo) {
    throw new Error('fillEmailCodeAndSubmit requires GOOGLE_EMAIL in .env or "emailTo" in the action.');
  }

  const sentAt = new Date(Date.now() - 10_000);

  const email = await waitForGmailEmail({
    from: action.emailFrom,
    to: emailTo,
    subjectContains: expectedEmailSubject,
    bodyContains: action.emailBodyContains ?? action.codePrefix ?? 'Verification code:',
    after: sentAt,
    timeoutMs: action.timeout ?? 180_000,
    pollIntervalMs: action.pollIntervalMs ?? 5_000,
  });

  expect(email.subject).toContain(expectedEmailSubject);

  const verificationCode = extractVerificationCodeFromEmail(email, action);
  console.log(`Extracted verification code from email subject "${email.subject}".`);

  const codeInput = buildLocator(context.activePage, action.locator);
  await codeInput.fill(verificationCode);
}

function extractVerificationCodeFromEmail(email: ReceivedGmailEmail, action: ActionConfig): string {
  const emailContent = [email.bodyText, htmlToPlainText(email.bodyHtml), email.snippet].filter(Boolean).join('\n');

  if (action.codeRegex) {
    const regex = new RegExp(action.codeRegex, action.codeRegexFlags ?? 'i');
    const match = regex.exec(emailContent);
    const code = match?.[1] ?? match?.[0];
    if (code?.trim()) return code.trim();

    throw new Error(`Could not extract verification code using codeRegex: ${action.codeRegex}`);
  }

  const codePrefix = action.codePrefix ?? 'Verification code:';
  const prefixRegex = new RegExp(`${escapeRegExp(codePrefix)}\\s*([A-Za-z0-9][A-Za-z0-9 _-]{2,30})`, 'i');
  const match = prefixRegex.exec(emailContent);
  const code = match?.[1]?.trim();

  if (!code) {
    throw new Error(`Could not find verification code in email body using prefix: ${codePrefix}`);
  }

  return code;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function validateDownloadedFile(downloadedFilePath: string, suggestedFilename: string, action: ActionConfig): void {
  expect(fs.existsSync(downloadedFilePath), `Downloaded file exists: ${downloadedFilePath}`).toBe(true);

  const fileStats = fs.statSync(downloadedFilePath);
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
    const rawContent = fs.readFileSync(downloadedFilePath, 'utf-8');
    expect(() => JSON.parse(rawContent), `Downloaded file is valid JSON: ${suggestedFilename}`).not.toThrow();
  }
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}

async function runPageAssertion(page: Page, pageCase: PageCase, assertion: AssertionConfig): Promise<void> {
  const assertionExpect = shouldUseSoftAssertion(pageCase, assertion) ? expect.soft : expect;
  const expected = expectedValue(assertion);
  const message = `[${pageCase.name}] page assertion ${assertion.type}`;

  switch (assertion.type) {
    case 'titleEquals':
      await assertionExpect(page, message).toHaveTitle(String(expected));
      return;
    case 'titleContains':
      await assertionExpect(page, message).toHaveTitle(containsPattern(String(expected)));
      return;
    case 'urlEquals':
      await assertionExpect(page, message).toHaveURL(String(expected));
      return;
    case 'urlContains':
      await assertionExpect(page, message).toHaveURL(containsPattern(String(expected)));
      return;
    default:
      throw new Error(`Assertion "${assertion.type}" is not a page-level assertion.`);
  }
}

async function runLocatorAssertion(
  locator: Locator,
  pageCase: PageCase,
  validation: ValidationConfig,
  assertion: AssertionConfig,
): Promise<void> {
  const assertionExpect = shouldUseSoftAssertion(pageCase, assertion) ? expect.soft : expect;
  const message = `[${pageCase.name}] ${validation.name} -> ${assertion.type}`;

  switch (assertion.type) {
    case 'visible':
      await assertionExpect(locator, message).toBeVisible({ timeout: assertion.timeout ?? 5000 });
      return;
    case 'hidden':
      await assertionExpect(locator, message).toBeHidden({ timeout: assertion.timeout ?? 5000 });
      return;
    case 'attached':
      await assertionExpect(locator, message).toBeAttached({ timeout: assertion.timeout ?? 5000 });
      return;
    case 'enabled':
      await assertionExpect(locator, message).toBeEnabled({ timeout: assertion.timeout ?? 5000 });
      return;
    case 'disabled':
      await assertionExpect(locator, message).toBeDisabled({ timeout: assertion.timeout ?? 5000 });
      return;
    case 'editable':
      await assertionExpect(locator, message).toBeEditable({ timeout: assertion.timeout ?? 5000 });
      return;
    case 'checked':
      await assertionExpect(locator, message).toBeChecked({ timeout: assertion.timeout ?? 5000 });
      return;
    case 'unchecked':
      await assertionExpect(locator, message).not.toBeChecked({ timeout: assertion.timeout ?? 5000 });
      return;
    case 'empty':
      await assertionExpect(locator, message).toBeEmpty({ timeout: assertion.timeout ?? 5000 });
      return;
    case 'textEquals': {
      const expected = expectedValue(assertion);
      await assertionExpect(locator, message).toHaveText(expected as string | RegExp, { timeout: assertion.timeout ?? 5000 });
      return;
    }
    case 'textContains': {
      const expected = expectedValue(assertion);
      await assertionExpect(locator, message).toContainText(expected as string | RegExp, { timeout: assertion.timeout ?? 5000 });
      return;
    }
    case 'valueEquals': {
      const expected = expectedValue(assertion);
      await assertionExpect(locator, message).toHaveValue(String(expected), { timeout: assertion.timeout ?? 5000 });
      return;
    }
    case 'attributeEquals': {
      const expected = expectedValue(assertion);
      if (!assertion.attributeName) throw new Error('attributeEquals requires "attributeName".');
      await assertionExpect(locator, message).toHaveAttribute(assertion.attributeName, String(expected), { timeout: assertion.timeout ?? 5000 });
      return;
    }
    case 'countEquals': {
      const expected = expectedValue(assertion);
      await assertionExpect(locator, message).toHaveCount(Number(expected), { timeout: assertion.timeout ?? 5000 });
      return;
    }
    case 'countGreaterThan': {
      const expected = expectedValue(assertion);
      const actualCount = await locator.count();
      await assertionExpect(actualCount, message).toBeGreaterThan(Number(expected));
      return;
    }
    case 'classContains': {
      const expected = expectedValue(assertion);
      await assertionExpect(locator, message).toContainClass(String(expected), { timeout: assertion.timeout ?? 5000 });
      return;
    }
    case 'cssEquals': {
      const expected = expectedValue(assertion);
      if (!assertion.cssName) throw new Error('cssEquals requires "cssName".');
      await assertionExpect(locator, message).toHaveCSS(assertion.cssName, String(expected), { timeout: assertion.timeout ?? 5000 });
      return;
    }
    default:
      throw new Error(`Assertion "${assertion.type}" is not a locator-level assertion.`);
  }
}

function shouldUseSoftAssertion(pageCase: PageCase, assertion: AssertionConfig): boolean {
  return assertion.soft ?? pageCase.softAssertions ?? testData.defaults?.softAssertions ?? false;
}

function expectedValue(assertion: AssertionConfig): string | number | boolean | RegExp {
  if (assertion.expectedRegex) return new RegExp(assertion.expectedRegex, assertion.flags);
  if (assertion.expected === undefined) {
    throw new Error(`Assertion "${assertion.type}" requires either "expected" or "expectedRegex".`);
  }
  return assertion.expected;
}
