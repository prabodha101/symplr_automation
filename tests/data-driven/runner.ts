import type { Locator, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/app-fixtures';
import { ProjectStoryBoardPage } from '../../pages/ProjectStoryBoardPage';
import { defaultIncludeSections, hasIncludedSection, normalizeTestCaseInclude, testCaseLookup, testData } from './config';
import { buildLocator } from './locator-utils';
import {
  getActivePage,
  getAppRunPage,
  getMainPage,
  setPopupPage,
  setRunPage,
  switchToMainPage,
  switchToPopupPage,
  switchToRunPage,
} from './context';
import { runLocatorAssertion, runPageAssertion } from './assertions';
import { runDownloadAppDefinitionAction, runGenericDownloadAction } from './downloads';
import {
  runConnectToGitHubEmailAction,
  runDownloadCodeEmailAction,
  runFillEmailCodeAndSubmitAction,
} from './email-actions';
import type { ActionConditionConfig, ActionConfig, IncludeSection, PageCase, RunContext, ValidationConfig } from './models';

export { createRunContext } from './context';

export async function runPrerequisiteTestCases(
  context: RunContext,
  pageCase: PageCase,
  testInfo: TestInfo,
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
  testInfo: TestInfo,
  includeStack: string[],
  sections: IncludeSection[] = defaultIncludeSections,
): Promise<void> {
  await runPrerequisiteTestCases(context, pageCase, testInfo, includeStack);

  if (pageCase.path || pageCase.url) {
    const targetUrl = buildTargetUrl(pageCase);
    await getActivePage(context).goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: pageCase.navigationTimeout ?? testData.defaults?.navigationTimeout ?? 15_000,
    });
  }

  await runConfiguredTestCaseSections(context, pageCase, testInfo, includeStack, sections);
}

export async function runConfiguredTestCaseSections(
  context: RunContext,
  pageCase: PageCase,
  testInfo: TestInfo,
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
      await test.step(` >> page assertion: ${assertion.type}`, async () => {
        await runPageAssertion(getActivePage(context), pageCase, assertion);
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
  testInfo: TestInfo,
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
  testInfo: TestInfo,
): Promise<void> {
  for (const validation of validations) {
    await test.step(validation.name, async () => {
      const locator = buildLocator(getActivePage(context), validation.locator);

      for (const action of validation.actions ?? []) {
        await runAction(context, action, locator, testInfo, pageCase);
      }

      for (const assertion of validation.assertions) {
        await runLocatorAssertion(locator, pageCase, validation, assertion);
      }
    });
  }
}

function isValidationOnlyActionBlock(action: ActionConfig): boolean {
  return !action.type;
}

export async function runPageActions(
  context: RunContext,
  pageCase: PageCase,
  actions: ActionConfig[],
  testInfo: TestInfo,
): Promise<void> {
  for (const action of actions) {
    const postActionValidations = [...(action.validations ?? []), ...(action.postValidations ?? [])];
    const actionLabel = action.name ?? action.type ?? 'validation-only action';

    if (isValidationOnlyActionBlock(action)) {
      if (postActionValidations.length === 0 && (action.pageActions?.length ?? 0) === 0) {
        throw new Error(`Action block "${actionLabel}" must define a type or include validations/pageActions.`);
      }

      await test.step(` >> Page action block: ${actionLabel}`, async () => {
        await runValidations(context, pageCase, postActionValidations, testInfo);
      });

      await runPageActions(context, pageCase, action.pageActions ?? [], testInfo);
      continue;
    }

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
  testInfo: TestInfo,
): Promise<void> {
  const attempts = Math.max(1, Number(action.retryAttempts ?? 3));
  const retryDelayMs = Math.max(0, Number(action.retryDelayMs ?? 1_000));
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await runAction(context, action, undefined, testInfo, pageCase);
      await runValidations(context, pageCase, postActionValidations, testInfo);
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Action "${action.name ?? action.type ?? 'validation-only action'}" did not pass its post-action validations after ${attempts} attempt(s). Last error: ${message}`);
      }

      await getActivePage(context).waitForTimeout(retryDelayMs);
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
  const sourcePage = getActivePage(context);
  const popupPromise = sourcePage.waitForEvent('popup', { timeout });
  await locator.click();
  const popupPage = await popupPromise;

  await popupPage.waitForLoadState('domcontentloaded', { timeout }).catch(() => {
    // Some OAuth pages keep loading while redirects happen.
  });

  setPopupPage(context, popupPage);
}

export async function runAction(
  context: RunContext,
  action: ActionConfig,
  defaultLocator?: Locator,
  testInfo?: TestInfo,
  pageCase?: PageCase,
): Promise<void> {
  if (!action.type) {
    throw new Error(`Action "${action.name ?? 'unnamed'}" must define a type.`);
  }

  const locator = action.locator ? buildLocator(getActivePage(context), action.locator) : defaultLocator;

  switch (action.type) {
    case 'click':
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      await locator.click();
      return;
    case 'fill': {
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      const fillValue = resolveActionValue(action);
      if (fillValue === undefined) throw new Error('fill action requires "value".');
      await locator.fill(String(fillValue));
      return;
    }
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
      if (pressValue === undefined) throw new Error('press action requires "value".');
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
      await runGenericDownloadAction(getActivePage(context), locator, action, testInfo);
      return;
    case 'clickAndSwitchToPopup':
      if (!locator) throw new Error('clickAndSwitchToPopup action requires a locator.');
      await runClickAndSwitchToPopupAction(context, locator, action);
      return;
    case 'switchToPopupPage':
      await switchToPopupPage(context);
      return;
    case 'waitForTimeout':
      await getActivePage(context).waitForTimeout(Number(action.timeout ?? action.value ?? 1_000));
      return;
    case 'waitForLoadState': {
      const state = String(action.value ?? 'domcontentloaded') as 'load' | 'domcontentloaded' | 'networkidle';
      await getActivePage(context).waitForLoadState(state, { timeout: action.timeout ?? 30_000 });
      return;
    }
    case 'downloadAppDefinition':
      if (!testInfo) throw new Error('downloadAppDefinition action requires Playwright testInfo.');
      await runDownloadAppDefinitionAction(getMainPage(context), action, testInfo);
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
      await switchToMainPage(context);
      return;
    case 'switchToRunPage':
      await switchToRunPage(context);
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
  testInfo: TestInfo,
): Promise<void> {
  if (!action.condition) {
    throw new Error('conditional action requires "condition".');
  }

  const matched = await evaluateActionCondition(context, action.condition);
  const branchName = matched ? 'then' : 'else';
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
  const locator = buildLocator(getActivePage(context), condition.locator);

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
  } catch {
    return false;
  }
}

async function runBuildAndRunAppAction(context: RunContext): Promise<void> {
  const storyboardPage = new ProjectStoryBoardPage(getMainPage(context));
  const runPage = await storyboardPage.buildAndRunApp();
  setRunPage(context, runPage);
  await runPage.bringToFront();
}
