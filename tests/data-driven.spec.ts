import { test, expect, type Locator, type Page } from './fixtures/app-fixtures';
import fs from 'node:fs';
import path from 'node:path';
import { AppCreationFlows } from '../workflows/AppCreationFlows';
import type { AppSource } from './configs/scenarioDefinitions';

const dataPath = path.resolve(__dirname, '../test-data/symplr_pages.json');
const rawTestData = JSON.parse(fs.readFileSync(dataPath, 'utf-8')) as unknown;
const testData = resolveReusableValidations(resolveTokens(rawTestData)) as TestData;

type LocatorConfig = {
  strategy:
    | 'id'
    | 'role'
    | 'text'
    | 'label'
    | 'placeholder'
    | 'altText'
    | 'title'
    | 'testId'
    | 'css'
    | 'xpath'
    | 'locator'
    | 'custom';
  id?: string;
  selector?: string;
  text?: string;
  role?: string;
  name?: string;
  exact?: boolean;
  level?: number;
  testId?: string;
  hasText?: string;
  nth?: number;
  first?: boolean;
  last?: boolean;
  locator?: string;
  value?: string;
  engine?: 'css' | 'xpath' | 'playwright';
};

type ActionConfig = {
  type: 'click' | 'fill' | 'check' | 'uncheck' | 'hover' | 'press' | 'selectOption';
  value?: string | number | boolean;
  locator?: LocatorConfig;
  validations?: ValidationConfig[];
  pageActions?: ActionConfig[];
};

type AssertionConfig = {
  type:
    | 'visible'
    | 'hidden'
    | 'attached'
    | 'enabled'
    | 'disabled'
    | 'editable'
    | 'checked'
    | 'unchecked'
    | 'empty'
    | 'textEquals'
    | 'textContains'
    | 'valueEquals'
    | 'attributeEquals'
    | 'countEquals'
    | 'countGreaterThan'
    | 'classContains'
    | 'cssEquals'
    | 'titleEquals'
    | 'titleContains'
    | 'urlEquals'
    | 'urlContains';
  expected?: string | number | boolean;
  expectedRegex?: string;
  flags?: string;
  attributeName?: string;
  cssName?: string;
  soft?: boolean;
  timeout?: number;
};

type ValidationConfig = {
  name: string;
  locator: LocatorConfig;
  actions?: ActionConfig[];
  assertions: AssertionConfig[];
};

type ValidationRef = {
  $ref: string;
};

type ValidationTemplateRef = {
  $template: string;
  params?: Record<string, unknown>;
};

type ValidationListItem = ValidationConfig | ValidationRef | ValidationTemplateRef;

type ValidationTemplateDefinition =
  | ValidationConfig
  | ValidationConfig[]
  | {
      defaults?: Record<string, unknown>;
      template: ValidationConfig | ValidationConfig[];
    };

type PageCase = {
  name: string;
  scenario?: string; // Possible values: "prompt", "template", "figma", "existingApp".
  scenarioConfig?: AppSource; // Configuration for the scenario.
  enabled?: boolean;
  baseUrl?: string;
  path?: string;
  url?: string;
  navigationTimeout?: number;
  softAssertions?: boolean;
  beforeValidateActions?: ActionConfig[];
  pageActions?: ActionConfig[];
  pageAssertions?: AssertionConfig[];
  validations: ValidationConfig[];
};

type TestData = {
  defaults?: {
    baseUrl?: string;
    navigationTimeout?: number;
    softAssertions?: boolean;
  };
  tokens?: Record<string, string>;
  validationSets?: Record<string, ValidationConfig | ValidationConfig[]>;
  validationTemplates?: Record<string, ValidationTemplateDefinition>;
  testCases: PageCase[];
};

function resolveTokens(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const root = value as Record<string, unknown>;
  const tokens = Object.entries(root.tokens ?? {}).reduce<Record<string, string>>((acc, [key, tokenValue]) => {
    if (typeof tokenValue === 'string') {
      acc[key] = tokenValue;
    }
    return acc;
  }, {});

  return resolveTokenPlaceholders(value, tokens);
}

function resolveTokenPlaceholders(value: unknown, tokens: Record<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveTokenPlaceholders(item, tokens));
  }

  if (typeof value === 'string') {
    return value.replace(/\$\{tokens\.([a-zA-Z0-9_]+)\}/g, (_, tokenKey) => {
      if (!(tokenKey in tokens)) {
        throw new Error(`Token not found: ${tokenKey}`);
      }
      return tokens[tokenKey];
    });
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, resolveTokenPlaceholders(item, tokens)])
    );
  }

  return value;
}

function resolveReusableValidations(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  const root = value as Record<string, unknown>;
  const validationSets = (root.validationSets ?? {}) as Record<string, unknown>;
  const validationTemplates = (root.validationTemplates ?? {}) as Record<string, unknown>;
  const cases = Array.isArray(root.testCases) ? root.testCases : root.pages;

  if (!Array.isArray(cases)) {
    return value;
  }

  const resolvedTestCases = cases.map((page) => resolvePageCaseReusableItems(page, validationSets, validationTemplates));

  return {
    ...root,
    testCases: resolvedTestCases
  };
}

function resolvePageCaseReusableItems(
  page: unknown,
  validationSets: Record<string, unknown>,
  validationTemplates: Record<string, unknown>
): unknown {
  if (page === null || typeof page !== 'object') return page;

  const pageObj = { ...(page as Record<string, unknown>) };

  if (Array.isArray(pageObj.beforeValidateActions)) {
    pageObj.beforeValidateActions = pageObj.beforeValidateActions.map((action) =>
      resolveActionReusableItems(action, validationSets, validationTemplates)
    );
  }

  if (Array.isArray(pageObj.pageActions)) {
    pageObj.pageActions = pageObj.pageActions.map((action) =>
      resolveActionReusableItems(action, validationSets, validationTemplates)
    );
  }

  if (Array.isArray(pageObj.validations)) {
    pageObj.validations = resolveValidationItems(pageObj.validations, validationSets, validationTemplates);
  }

  return pageObj;
}

function resolveActionReusableItems(
  action: unknown,
  validationSets: Record<string, unknown>,
  validationTemplates: Record<string, unknown>
): unknown {
  if (action === null || typeof action !== 'object') return action;

  const actionObj = { ...(action as Record<string, unknown>) };

  if (Array.isArray(actionObj.validations)) {
    actionObj.validations = resolveValidationItems(actionObj.validations, validationSets, validationTemplates);
  }

  if (Array.isArray(actionObj.pageActions)) {
    actionObj.pageActions = actionObj.pageActions.map((nestedAction) =>
      resolveActionReusableItems(nestedAction, validationSets, validationTemplates)
    );
  }

  return actionObj;
}

function resolveValidationItems(
  validations: unknown[],
  validationSets: Record<string, unknown>,
  validationTemplates: Record<string, unknown>
): unknown[] {
  return validations.flatMap((item) => resolveValidationItem(item, validationSets, validationTemplates));
}

function resolveValidationItem(
  item: unknown,
  validationSets: Record<string, unknown>,
  validationTemplates: Record<string, unknown>
): unknown[] {
  if (isValidationRef(item)) {
    return resolveValidationRef(item.$ref, validationSets).flatMap((resolvedItem) =>
      resolveValidationItem(resolvedItem, validationSets, validationTemplates)
    );
  }

  if (isValidationTemplateRef(item)) {
    return resolveValidationTemplate(item.$template, item.params ?? {}, validationTemplates).flatMap((resolvedItem) =>
      resolveValidationItem(resolvedItem, validationSets, validationTemplates)
    );
  }

  if (item !== null && typeof item === 'object') {
    return [resolveValidationNestedReusableItems(item, validationSets, validationTemplates)];
  }

  return [item];
}

function resolveValidationNestedReusableItems(
  validation: unknown,
  validationSets: Record<string, unknown>,
  validationTemplates: Record<string, unknown>
): unknown {
  if (validation === null || typeof validation !== 'object') return validation;

  const validationObj = { ...(validation as Record<string, unknown>) };

  if (Array.isArray(validationObj.actions)) {
    validationObj.actions = validationObj.actions.map((action) =>
      resolveActionReusableItems(action, validationSets, validationTemplates)
    );
  }

  return validationObj;
}

function isValidationRef(value: unknown): value is ValidationRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$ref' in value &&
    typeof (value as Record<string, unknown>)['$ref'] === 'string'
  );
}

function isValidationTemplateRef(value: unknown): value is ValidationTemplateRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$template' in value &&
    typeof (value as Record<string, unknown>)['$template'] === 'string'
  );
}

function resolveValidationRef(ref: string, validationSets: Record<string, unknown>): unknown[] {
  const key = ref.startsWith('validationSets.') ? ref.slice('validationSets.'.length) : ref;
  const setValue = validationSets[key];

  if (setValue === undefined) {
    throw new Error(`Validation set not found: ${ref}`);
  }

  return Array.isArray(setValue) ? deepClone(setValue) : [deepClone(setValue)];
}

function resolveValidationTemplate(
  templateName: string,
  params: Record<string, unknown>,
  validationTemplates: Record<string, unknown>
): unknown[] {
  const key = templateName.startsWith('validationTemplates.')
    ? templateName.slice('validationTemplates.'.length)
    : templateName;
  const definition = validationTemplates[key];

  if (definition === undefined) {
    throw new Error(`Validation template not found: ${templateName}`);
  }

  let templateValue: unknown = definition;
  let defaults: Record<string, unknown> = {};

  if (
    definition !== null &&
    typeof definition === 'object' &&
    !Array.isArray(definition) &&
    'template' in definition
  ) {
    const definitionObj = definition as Record<string, unknown>;
    templateValue = definitionObj.template;
    defaults = (definitionObj.defaults ?? {}) as Record<string, unknown>;
  }

  const mergedParams = { ...defaults, ...params };
  const resolvedTemplate = resolveParamPlaceholders(deepClone(templateValue), mergedParams);

  return Array.isArray(resolvedTemplate) ? resolvedTemplate : [resolvedTemplate];
}

function resolveParamPlaceholders(value: unknown, params: Record<string, unknown>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveParamPlaceholders(item, params));
  }

  if (typeof value === 'string') {
    const exactMatch = value.match(/^\$\{params?\.([a-zA-Z0-9_.]+)\}$/);
    if (exactMatch) {
      return getTemplateParam(params, exactMatch[1]);
    }

    return value.replace(/\$\{params?\.([a-zA-Z0-9_.]+)\}/g, (_, paramKey) => String(getTemplateParam(params, paramKey)));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, resolveParamPlaceholders(item, params)])
    );
  }

  return value;
}

function getTemplateParam(params: Record<string, unknown>, key: string): unknown {
  const pathParts = key.split('.');
  let current: unknown = params;

  for (const part of pathParts) {
    if (current === null || typeof current !== 'object' || !(part in current)) {
      throw new Error(`Template parameter not found: ${key}`);
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

for (const testCase of testData.testCases.filter((item) => item.enabled !== false)) {
  test.describe(testCase.name, () => {
    test(`validates configured checks for ${testCase.name}`, async ({ page }) => {
      console.log(`>-- Running test case : ${testCase.name}`);

      // - Execute the scenario ('Prompt', 'Figma', 'Template', 'Existing App')
      if (testCase.scenario) {
        console.log(`  >> Scenario: ${testCase.scenario}`);
        if (testCase.scenarioConfig) {
          const appCreationFlows = new AppCreationFlows(page);
          await appCreationFlows.createOrLoadApp(testCase.scenarioConfig);
          console.log(`  >> Scenario "${testCase.scenario}" executed successfully. Landed on app page.`);
        } else {
          throw new Error(`Scenario "${testCase.scenario}" is defined but scenarioConfig is missing in test data.`);
        }
      }
      // -----------------------------------------------------------------------

      if (testCase.path || testCase.url) {
        const targetUrl = buildTargetUrl(testCase, testData);
        await page.goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: testCase.navigationTimeout ?? testData.defaults?.navigationTimeout ?? 15_000
        });
      }

      for (const action of testCase.beforeValidateActions ?? []) {
        await test.step(` >> before validation action: ${action.type}`, async () => {
          await runAction(page, action);
        });
      }

      // - Execute page assertions --------------------------------------------
      for (const assertion of testCase.pageAssertions ?? []) {
        console.log(`Running page assertion: ${assertion.type}`);

        await test.step(` >> page assertion: ${assertion.type}`, async () => {
          await runPageAssertion(page, testCase, assertion);
        });
      }
      // ----------------------------------------------------------------------

      await runValidations(page, testCase, testCase.validations ?? []);

      await runPageActions(page, testCase, testCase.pageActions ?? []);
    });
  });
}

async function runValidations(page: Page, pageCase: PageCase, validations: ValidationConfig[]): Promise<void> {
  for (const validation of validations) {
    console.log(` >> Running validation: ${validation.name}`);

    await test.step(validation.name, async () => {
      const locator = buildLocator(page, validation.locator);

      for (const action of validation.actions ?? []) {
        await runAction(page, action, locator);
      }

      for (const assertion of validation.assertions) {
        await runLocatorAssertion(locator, pageCase, validation, assertion);
      }
    });
  }
}

async function runPageActions(page: Page, pageCase: PageCase, actions: ActionConfig[]): Promise<void> {
  for (const action of actions) {
    await test.step(` >> Page action: ${action.type}`, async () => {
      await runAction(page, action);
    });

    await runValidations(page, pageCase, action.validations ?? []);
    await runPageActions(page, pageCase, action.pageActions ?? []);
  }
}

function buildTargetUrl(pageCase: PageCase, data: TestData): string {
  if (pageCase.url) return pageCase.url;

  const baseUrl = pageCase.baseUrl ?? data.defaults?.baseUrl;
  if (!baseUrl) {
    throw new Error(`Page "${pageCase.name}" must define either url or path with defaults.baseUrl.`);
  }

  return new URL(pageCase.path ?? '/', baseUrl).toString();
}

function buildLocator(page: Page, locatorConfig: LocatorConfig): Locator {
  let locator: Locator;

  switch (locatorConfig.strategy) {
    case 'id': {
      if (!locatorConfig.id) throw new Error('id locator requires "id".');
      locator = page.locator(`[id="${escapeCssAttributeValue(locatorConfig.id)}"]`);
      break;
    }
    case 'role': {
      if (!locatorConfig.role) throw new Error('role locator requires "role".');
      locator = page.getByRole(locatorConfig.role as never, {
        name: locatorConfig.name,
        exact: locatorConfig.exact,
        level: locatorConfig.level
      } as never);
      break;
    }
    case 'text': {
      if (!locatorConfig.text) throw new Error('text locator requires "text".');
      if (locatorConfig.role) {
        locator = page.getByRole(locatorConfig.role as never, {
          name: locatorConfig.name ?? locatorConfig.text,
          exact: locatorConfig.exact,
          level: locatorConfig.level
        } as never);
      } else {
        locator = page.getByText(locatorConfig.text, { exact: locatorConfig.exact });
      }
      break;
    }
    case 'label': {
      if (!locatorConfig.text) throw new Error('label locator requires "text".');
      locator = page.getByLabel(locatorConfig.text, { exact: locatorConfig.exact });
      break;
    }
    case 'placeholder': {
      if (!locatorConfig.text) throw new Error('placeholder locator requires "text".');
      locator = page.getByPlaceholder(locatorConfig.text, { exact: locatorConfig.exact });
      break;
    }
    case 'altText': {
      if (!locatorConfig.text) throw new Error('altText locator requires "text".');
      locator = page.getByAltText(locatorConfig.text, { exact: locatorConfig.exact });
      break;
    }
    case 'title': {
      if (!locatorConfig.text) throw new Error('title locator requires "text".');
      locator = page.getByTitle(locatorConfig.text, { exact: locatorConfig.exact });
      break;
    }
    case 'testId': {
      if (!locatorConfig.testId) throw new Error('testId locator requires "testId".');
      locator = page.getByTestId(locatorConfig.testId);
      break;
    }
    case 'css': {
      if (!locatorConfig.selector) throw new Error('css locator requires "selector".');
      locator = page.locator(locatorConfig.selector, { hasText: locatorConfig.hasText });
      break;
    }
    case 'xpath': {
      if (!locatorConfig.selector) throw new Error('xpath locator requires "selector".');
      locator = page.locator(`xpath=${locatorConfig.selector}`);
      break;
    }
    case 'locator': {
      if (!locatorConfig.locator) throw new Error('locator strategy requires "locator".');
      locator = page.locator(locatorConfig.locator);
      break;
    }
    case 'custom': {
      const customLocator = locatorConfig.locator ?? locatorConfig.selector ?? locatorConfig.value;
      if (!customLocator) throw new Error('custom locator strategy requires "locator", "selector", or "value".');
      const selector = locatorConfig.engine === 'xpath' && !customLocator.startsWith('xpath=')
        ? `xpath=${customLocator}`
        : customLocator;
      locator = page.locator(selector);
      break;
    }
    default: {
      const unknown: never = locatorConfig.strategy;
      throw new Error(`Unsupported locator strategy: ${unknown}`);
    }
  }

  if (locatorConfig.first) locator = locator.first();
  if (locatorConfig.last) locator = locator.last();
  if (locatorConfig.nth !== undefined) locator = locator.nth(locatorConfig.nth);

  return locator;
}

async function runAction(page: Page, action: ActionConfig, defaultLocator?: Locator): Promise<void> {
  const locator = action.locator ? buildLocator(page, action.locator) : defaultLocator;
  if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);

  switch (action.type) {
    case 'click':
      await locator.click();
      return;
    case 'fill':
      await locator.fill(String(action.value ?? ''));
      return;
    case 'check':
      await locator.check();
      return;
    case 'uncheck':
      await locator.uncheck();
      return;
    case 'hover':
      await locator.hover();
      return;
    case 'press':
      if (!action.value) throw new Error('press action requires "value", for example "Enter".');
      await locator.press(String(action.value));
      return;
    case 'selectOption':
      if (action.value === undefined) throw new Error('selectOption action requires "value".');
      await locator.selectOption(String(action.value));
      return;
    default: {
      const unknown: never = action.type;
      throw new Error(`Unsupported action type: ${unknown}`);
    }
  }
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
  assertion: AssertionConfig
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

function containsPattern(value: string): RegExp {
  return new RegExp(escapeRegExp(value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeCssAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
