import { test, expect, type AuthPageOptions, type Locator, type Page } from "./fixtures/app-fixtures";
import type { FrameLocator, TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { ProjectStoryBoardPage } from "../pages/ProjectStoryBoardPage";
import { AppRunPage } from "../pages/AppRunPage";
import { waitForGmailEmail, type ReceivedGmailEmail } from "../integrations/email/GmailInbox";
import { downloadZipFromEmailLink } from "../integrations/email/GmailDownloadLink";

const dataPath = path.resolve(__dirname, "../test-data/symplr_pages.json");
const rawTestData = loadConfigWithImports(dataPath);
const testData = resolveReusableValidations(
  resolveTokens(rawTestData),
) as TestData;

type LocatorConfig = {
  strategy:
  | "id"
  | "role"
  | "text"
  | "label"
  | "img"
  | "placeholder"
  | "altText"
  | "title"
  | "testId"
  | "css"
  | "xpath"
  | "locator"
  | "custom";
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
  engine?: "css" | "xpath" | "playwright";
  /** Optional iframe selector. When provided, the locator is resolved inside that iframe. */
  frameLocator?: string;
};

type ActionConditionConfig = {
  locator: LocatorConfig;
  /** Assertion used to decide which branch runs. Default is visible. */
  assertion?: "visible" | "hidden" | "attached";
  timeout?: number | string;
};

type ActionConfig = {
  /** Optional for validation-only action blocks used inside conditional branches. */
  type?:
  | "click"
  | "fill"
  | "check"
  | "uncheck"
  | "hover"
  | "press"
  | "selectOption"
  | "download"
  | "clickAndSwitchToPopup"
  | "switchToPopupPage"
  | "waitForTimeout"
  | "waitForLoadState"
  | "downloadAppDefinition"
  | "downloadCodeEmail"
  | "connectToGitHubEmail"
  | "fillEmailCodeAndSubmit"
  | "conditional"
  | "buildAndRunApp"
  | "waitForBuildComplete"
  | "openRunOnDeviceModal"
  | "waitForQrCodeGenerated"
  | "switchToMainPage"
  | "switchToRunPage";
  name?: string;
  value?: string | number | boolean;
  /** Optional environment variable name used as the value for fill/press/selectOption. Useful for credentials. */
  valueEnv?: string;
  locator?: LocatorConfig;
  validations?: ValidationConfig[];
  /** Preferred alias for validations that run immediately after this action. */
  postValidations?: ValidationConfig[];
  pageActions?: ActionConfig[];
  expectedExtension?: string;
  expectedFileNameContains?: string;
  validateJson?: boolean;
  minBytes?: number;
  saveAs?: string;
  timeout?: number;
  expectedEmailSubject?: string;
  emailFrom?: string;
  emailTo?: string;
  emailBodyContains?: string;
  pollIntervalMs?: number;
  codePrefix?: string;
  codeRegex?: string;
  codeRegexFlags?: string;
  verifyButtonLocator?: LocatorConfig;
  /** Branching action support. Prefer thenActions/elseActions. thenValidations/elseValidations remain for backward compatibility. */
  condition?: ActionConditionConfig;
  thenActions?: ActionConfig[];
  elseActions?: ActionConfig[];
  thenValidations?: ValidationConfig[];
  elseValidations?: ValidationConfig[];
  /** Retry the action when its action-level validations fail. Useful for UI clicks that sometimes need another click after the app finishes loading. */
  retryOnValidationFailure?: boolean;
  retryAttempts?: number;
  retryDelayMs?: number;
};

type AssertionConfig = {
  type:
  | "visible"
  | "hidden"
  | "attached"
  | "enabled"
  | "disabled"
  | "editable"
  | "checked"
  | "unchecked"
  | "empty"
  | "textEquals"
  | "textContains"
  | "valueEquals"
  | "attributeEquals"
  | "countEquals"
  | "countGreaterThan"
  | "classContains"
  | "cssEquals"
  | "titleEquals"
  | "titleContains"
  | "urlEquals"
  | "urlContains";
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

type ValidationListItem =
  | ValidationConfig
  | ValidationRef
  | ValidationTemplateRef;

type IncludeSection =
  | "beforeValidateActions"
  | "pageAssertions"
  | "validations"
  | "pageActions"
  | "includeTestCases";

type TestCaseInclude =
  | string
  | {
    name: string;
    sections?: IncludeSection[];
  };

type ValidationTemplateDefinition =
  | ValidationConfig
  | ValidationConfig[]
  | {
    defaults?: Record<string, unknown>;
    template: ValidationConfig | ValidationConfig[];
  };

type ScenarioDefinition = {
  description?: string;
  beforeValidateActions?: ActionConfig[];
  pageActions?: ActionConfig[];
  pageAssertions?: AssertionConfig[];
  validations?: ValidationConfig[];
};

type PageCase = {
  name: string;
  scenario?: string; // Possible values: "prompt", "template", "figma", "existingApp".
  scenarioConfig?: Record<string, unknown>; // Parameters passed into the JSON-defined scenario.
  /** Optional per-test authentication/session behavior. */
  auth?: AuthPageOptions;
  enabled?: boolean;
  baseUrl?: string;
  path?: string;
  url?: string;
  navigationTimeout?: number;
  softAssertions?: boolean;
  beforeValidateActions?: ActionConfig[];
  pageActions?: ActionConfig[];
  pageAssertions?: AssertionConfig[];
  validations?: ValidationConfig[];
  includeTestCases?: TestCaseInclude[];
  /**
   * Full test cases that should run before this test case's own scenario/navigation.
   * The current test case controls the browser auth/session; prerequisite auth blocks are
   * not applied because Playwright fixtures are created before the test body starts.
   */
  prerequisiteTestCases?: TestCaseInclude[];
};

type TestData = {
  defaults?: {
    baseUrl?: string;
    navigationTimeout?: number;
    softAssertions?: boolean;
  };
  imports?: string[];
  tokens?: Record<string, string>;
  validationSets?: Record<string, ValidationConfig | ValidationConfig[]>;
  validationTemplates?: Record<string, ValidationTemplateDefinition>;
  scenarioDefinitions?: Record<string, ScenarioDefinition>;
  testCases: PageCase[];
};

function loadConfigWithImports(entryPath: string): unknown {
  return loadConfigFile(path.resolve(entryPath), new Set<string>());
}

function loadConfigFile(absolutePath: string, stack: Set<string>): Record<string, unknown> {
  const normalizedPath = path.resolve(absolutePath);
  if (stack.has(normalizedPath)) {
    throw new Error(`Circular test-data import detected: ${normalizedPath}`);
  }

  stack.add(normalizedPath);

  const parsed = JSON.parse(
    fs.readFileSync(normalizedPath, "utf-8").replace(/^\uFEFF/, ""),
  ) as unknown;

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Test data file must contain a JSON object: ${normalizedPath}`);
  }

  const config = parsed as Record<string, unknown>;
  let merged: Record<string, unknown> = {};

  if (config.imports !== undefined) {
    if (!Array.isArray(config.imports)) {
      throw new Error(`Property "imports" must be an array in ${normalizedPath}`);
    }

    for (const importPath of config.imports) {
      if (typeof importPath !== "string") {
        throw new Error(`All import entries must be strings in ${normalizedPath}`);
      }

      const childPath = path.resolve(path.dirname(normalizedPath), importPath);
      merged = mergeConfigObjects(merged, loadConfigFile(childPath, stack));
    }
  }

  const { imports: _imports, ...currentConfig } = config;
  merged = mergeConfigObjects(merged, currentConfig);

  stack.delete(normalizedPath);
  return merged;
}

function mergeConfigObjects(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const result = cloneConfig(base) as Record<string, unknown>;

  for (const [key, incomingValue] of Object.entries(incoming)) {
    if (key === "imports") continue;

    if (key === "testCases" || key === "pages") {
      const baseItems = Array.isArray(result[key]) ? (result[key] as unknown[]) : [];
      const incomingItems = Array.isArray(incomingValue) ? incomingValue : [];
      result[key] = [...baseItems, ...cloneConfig(incomingItems)];
      continue;
    }

    const existingValue = result[key];
    if (isPlainObject(existingValue) && isPlainObject(incomingValue)) {
      result[key] = deepMergeObjects(
        existingValue as Record<string, unknown>,
        incomingValue as Record<string, unknown>,
      );
    } else {
      result[key] = cloneConfig(incomingValue);
    }
  }

  return result;
}

function deepMergeObjects(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const result = cloneConfig(base) as Record<string, unknown>;

  for (const [key, incomingValue] of Object.entries(incoming)) {
    const existingValue = result[key];
    if (isPlainObject(existingValue) && isPlainObject(incomingValue)) {
      result[key] = deepMergeObjects(
        existingValue as Record<string, unknown>,
        incomingValue as Record<string, unknown>,
      );
    } else {
      result[key] = cloneConfig(incomingValue);
    }
  }

  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneConfig<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

type RunContext = {
  /** Original storyboard/dashboard page created by the fixture. */
  mainPage: Page;
  /** Page currently receiving config-driven locators, validations, and generic actions. */
  activePage: Page;
  /** Last generic popup/new window captured by a config action. */
  popupPage?: Page;
  /** Popup page opened by the Build action. */
  runPage?: Page;
  appRunPage?: AppRunPage;
};

function resolveTokens(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  const root = value as Record<string, unknown>;
  const tokens = Object.entries(root.tokens ?? {}).reduce<
    Record<string, string>
  >((acc, [key, tokenValue]) => {
    if (typeof tokenValue === "string") {
      acc[key] = tokenValue;
    }
    return acc;
  }, {});

  return resolveTokenPlaceholders(value, tokens);
}

function resolveTokenPlaceholders(
  value: unknown,
  tokens: Record<string, string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveTokenPlaceholders(item, tokens));
  }

  if (typeof value === "string") {
    return value.replace(/\$\{tokens\.([a-zA-Z0-9_]+)\}/g, (_, tokenKey) => {
      if (!(tokenKey in tokens)) {
        throw new Error(`Token not found: ${tokenKey}`);
      }
      return tokens[tokenKey];
    });
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        resolveTokenPlaceholders(item, tokens),
      ]),
    );
  }

  return value;
}

function resolveReusableValidations(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  const root = value as Record<string, unknown>;
  const validationSets = (root.validationSets ?? {}) as Record<string, unknown>;
  const validationTemplates = (root.validationTemplates ?? {}) as Record<
    string,
    unknown
  >;
  const cases = Array.isArray(root.testCases) ? root.testCases : root.pages;

  if (!Array.isArray(cases)) {
    return value;
  }

  const resolvedTestCases = cases.map((page) =>
    resolvePageCaseReusableItems(page, validationSets, validationTemplates),
  );

  const scenarioDefinitions = (root.scenarioDefinitions ?? {}) as Record<
    string,
    unknown
  >;
  const resolvedScenarioDefinitions = Object.fromEntries(
    Object.entries(scenarioDefinitions).map(([name, definition]) => [
      name,
      resolveScenarioDefinitionReusableItems(
        definition,
        validationSets,
        validationTemplates,
      ),
    ]),
  );

  return {
    ...root,
    scenarioDefinitions: resolvedScenarioDefinitions,
    testCases: resolvedTestCases,
  };
}

function resolveScenarioDefinitionReusableItems(
  definition: unknown,
  validationSets: Record<string, unknown>,
  validationTemplates: Record<string, unknown>,
): unknown {
  if (definition === null || typeof definition !== "object") return definition;

  const scenarioObj = { ...(definition as Record<string, unknown>) };

  if (Array.isArray(scenarioObj.beforeValidateActions)) {
    scenarioObj.beforeValidateActions = scenarioObj.beforeValidateActions.map(
      (action) =>
        resolveActionReusableItems(action, validationSets, validationTemplates),
    );
  }

  if (Array.isArray(scenarioObj.pageActions)) {
    scenarioObj.pageActions = scenarioObj.pageActions.map((action) =>
      resolveActionReusableItems(action, validationSets, validationTemplates),
    );
  }

  if (Array.isArray(scenarioObj.validations)) {
    scenarioObj.validations = resolveValidationItems(
      scenarioObj.validations,
      validationSets,
      validationTemplates,
    );
  }

  return scenarioObj;
}

function resolvePageCaseReusableItems(
  page: unknown,
  validationSets: Record<string, unknown>,
  validationTemplates: Record<string, unknown>,
): unknown {
  if (page === null || typeof page !== "object") return page;

  const pageObj = { ...(page as Record<string, unknown>) };

  if (Array.isArray(pageObj.beforeValidateActions)) {
    pageObj.beforeValidateActions = pageObj.beforeValidateActions.map(
      (action) =>
        resolveActionReusableItems(action, validationSets, validationTemplates),
    );
  }

  if (Array.isArray(pageObj.pageActions)) {
    pageObj.pageActions = pageObj.pageActions.map((action) =>
      resolveActionReusableItems(action, validationSets, validationTemplates),
    );
  }

  if (Array.isArray(pageObj.validations)) {
    pageObj.validations = resolveValidationItems(
      pageObj.validations,
      validationSets,
      validationTemplates,
    );
  }

  return pageObj;
}

function resolveActionReusableItems(
  action: unknown,
  validationSets: Record<string, unknown>,
  validationTemplates: Record<string, unknown>,
): unknown {
  if (action === null || typeof action !== "object") return action;

  const actionObj = { ...(action as Record<string, unknown>) };

  if (Array.isArray(actionObj.validations)) {
    actionObj.validations = resolveValidationItems(
      actionObj.validations,
      validationSets,
      validationTemplates,
    );
  }

  if (Array.isArray(actionObj.postValidations)) {
    actionObj.postValidations = resolveValidationItems(
      actionObj.postValidations,
      validationSets,
      validationTemplates,
    );
  }

  if (Array.isArray(actionObj.pageActions)) {
    actionObj.pageActions = actionObj.pageActions.map((nestedAction) =>
      resolveActionReusableItems(
        nestedAction,
        validationSets,
        validationTemplates,
      ),
    );
  }

  if (Array.isArray(actionObj.thenActions)) {
    actionObj.thenActions = actionObj.thenActions.map((nestedAction) =>
      resolveActionReusableItems(
        nestedAction,
        validationSets,
        validationTemplates,
      ),
    );
  }

  if (Array.isArray(actionObj.elseActions)) {
    actionObj.elseActions = actionObj.elseActions.map((nestedAction) =>
      resolveActionReusableItems(
        nestedAction,
        validationSets,
        validationTemplates,
      ),
    );
  }

  if (Array.isArray(actionObj.thenValidations)) {
    actionObj.thenValidations = resolveValidationItems(
      actionObj.thenValidations,
      validationSets,
      validationTemplates,
    );
  }

  if (Array.isArray(actionObj.elseValidations)) {
    actionObj.elseValidations = resolveValidationItems(
      actionObj.elseValidations,
      validationSets,
      validationTemplates,
    );
  }

  return actionObj;
}

function resolveValidationItems(
  validations: unknown[],
  validationSets: Record<string, unknown>,
  validationTemplates: Record<string, unknown>,
): unknown[] {
  return validations.flatMap((item) =>
    resolveValidationItem(item, validationSets, validationTemplates),
  );
}

function resolveValidationItem(
  item: unknown,
  validationSets: Record<string, unknown>,
  validationTemplates: Record<string, unknown>,
): unknown[] {
  if (isValidationRef(item)) {
    return resolveValidationRef(item.$ref, validationSets).flatMap(
      (resolvedItem) =>
        resolveValidationItem(
          resolvedItem,
          validationSets,
          validationTemplates,
        ),
    );
  }

  if (isValidationTemplateRef(item)) {
    return resolveValidationTemplate(
      item.$template,
      item.params ?? {},
      validationTemplates,
    ).flatMap((resolvedItem) =>
      resolveValidationItem(resolvedItem, validationSets, validationTemplates),
    );
  }

  if (item !== null && typeof item === "object") {
    return [
      resolveValidationNestedReusableItems(
        item,
        validationSets,
        validationTemplates,
      ),
    ];
  }

  return [item];
}

function resolveValidationNestedReusableItems(
  validation: unknown,
  validationSets: Record<string, unknown>,
  validationTemplates: Record<string, unknown>,
): unknown {
  if (validation === null || typeof validation !== "object") return validation;

  const validationObj = { ...(validation as Record<string, unknown>) };

  if (Array.isArray(validationObj.actions)) {
    validationObj.actions = validationObj.actions.map((action) =>
      resolveActionReusableItems(action, validationSets, validationTemplates),
    );
  }

  return validationObj;
}

function isValidationRef(value: unknown): value is ValidationRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "$ref" in value &&
    typeof (value as Record<string, unknown>)["$ref"] === "string"
  );
}

function isValidationTemplateRef(
  value: unknown,
): value is ValidationTemplateRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "$template" in value &&
    typeof (value as Record<string, unknown>)["$template"] === "string"
  );
}

function resolveValidationRef(
  ref: string,
  validationSets: Record<string, unknown>,
): unknown[] {
  const key = ref.startsWith("validationSets.")
    ? ref.slice("validationSets.".length)
    : ref;
  const setValue = validationSets[key];

  if (setValue === undefined) {
    throw new Error(`Validation set not found: ${ref}`);
  }

  return Array.isArray(setValue) ? deepClone(setValue) : [deepClone(setValue)];
}

function resolveValidationTemplate(
  templateName: string,
  params: Record<string, unknown>,
  validationTemplates: Record<string, unknown>,
): unknown[] {
  const key = templateName.startsWith("validationTemplates.")
    ? templateName.slice("validationTemplates.".length)
    : templateName;
  const definition = validationTemplates[key];

  if (definition === undefined) {
    throw new Error(`Validation template not found: ${templateName}`);
  }

  let templateValue: unknown = definition;
  let defaults: Record<string, unknown> = {};

  if (
    definition !== null &&
    typeof definition === "object" &&
    !Array.isArray(definition) &&
    "template" in definition
  ) {
    const definitionObj = definition as Record<string, unknown>;
    templateValue = definitionObj.template;
    defaults = (definitionObj.defaults ?? {}) as Record<string, unknown>;
  }

  const mergedParams = { ...defaults, ...params };
  const resolvedTemplate = resolveParamPlaceholders(
    deepClone(templateValue),
    mergedParams,
  );

  return Array.isArray(resolvedTemplate)
    ? resolvedTemplate
    : [resolvedTemplate];
}

function resolveParamPlaceholders(
  value: unknown,
  params: Record<string, unknown>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveParamPlaceholders(item, params));
  }

  if (typeof value === "string") {
    const exactMatch = value.match(/^\$\{params?\.([a-zA-Z0-9_.]+)\}$/);
    if (exactMatch) {
      return getTemplateParam(params, exactMatch[1]);
    }

    return value.replace(/\$\{params?\.([a-zA-Z0-9_.]+)\}/g, (_, paramKey) =>
      String(getTemplateParam(params, paramKey)),
    );
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        resolveParamPlaceholders(item, params),
      ]),
    );
  }

  return value;
}

function getTemplateParam(
  params: Record<string, unknown>,
  key: string,
): unknown {
  const pathParts = key.split(".");
  let current: unknown = params;

  for (const part of pathParts) {
    if (current === null || typeof current !== "object" || !(part in current)) {
      throw new Error(`Template parameter not found: ${key}. Please check if the given template parameter '${key}' is correct.`);
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const testCaseLookup = buildTestCaseLookup(testData.testCases);

for (const testCase of testData.testCases.filter(
  (item) => item.enabled !== false,
)) {
  test.describe(testCase.name, () => {
    test.use({ auth: testCase.auth ?? { session: "authenticated" } });

    test(`validates configured checks for test case: '${testCase.name}'`, async ({
      page,
    }, testInfo) => {
      const runContext = createRunContext(page);
      console.log(`>-- Running test case : ${testCase.name}`);

      // Run any full prerequisite test flows first. This is useful for flows
      // such as registering a fresh user before executing a scenario.
      await runPrerequisiteTestCases(
        runContext,
        testCase,
        testInfo,
        [testCase.name],
      );

      // - Execute the scenario from test-data/symplr_pages.json.
      //   The TypeScript runner only knows how to execute generic configured
      //   actions/validations; the actual scenario flow is data-driven.
      if (testCase.scenario) {
        await runConfiguredScenario(runContext, testCase, testInfo);
      }
      // -----------------------------------------------------------------------

      if (testCase.path || testCase.url) {
        const targetUrl = buildTargetUrl(testCase, testData);
        await runContext.activePage.goto(targetUrl, {
          waitUntil: "domcontentloaded",
          timeout:
            testCase.navigationTimeout ??
            testData.defaults?.navigationTimeout ??
            15_000,
        });
      }

      await runConfiguredTestCaseSections(runContext, testCase, testInfo, [
        testCase.name,
      ]);
    });
  });
}

async function runPrerequisiteTestCases(
  context: RunContext,
  pageCase: PageCase,
  testInfo: TestInfo,
  includeStack: string[],
): Promise<void> {
  for (const prerequisite of pageCase.prerequisiteTestCases ?? []) {
    const normalizedPrerequisite = normalizeTestCaseInclude(prerequisite);
    const prerequisiteTestCase = testCaseLookup.get(normalizedPrerequisite.name);

    if (!prerequisiteTestCase) {
      throw new Error(
        `Prerequisite test case not found: ${normalizedPrerequisite.name}. Referenced from: ${pageCase.name}`,
      );
    }

    if (includeStack.includes(prerequisiteTestCase.name)) {
      throw new Error(
        `Circular prerequisiteTestCases reference detected: ${[
          ...includeStack,
          prerequisiteTestCase.name,
        ].join(" -> ")}`,
      );
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

  if (pageCase.scenario) {
    await runConfiguredScenario(context, pageCase, testInfo);
  }

  if (pageCase.path || pageCase.url) {
    const targetUrl = buildTargetUrl(pageCase, testData);
    await context.activePage.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout:
        pageCase.navigationTimeout ??
        testData.defaults?.navigationTimeout ??
        15_000,
    });
  }

  await runConfiguredTestCaseSections(
    context,
    pageCase,
    testInfo,
    includeStack,
    sections,
  );
}

async function runConfiguredScenario(
  context: RunContext,
  pageCase: PageCase,
  testInfo: TestInfo,
): Promise<void> {
  if (!pageCase.scenario) return;

  const scenarioDefinitions = testData.scenarioDefinitions ?? {};
  const rawDefinition = scenarioDefinitions[pageCase.scenario];

  if (!rawDefinition) {
    throw new Error(
      `Scenario definition not found for "${pageCase.scenario}". ` +
      `Add it under scenarioDefinitions in test-data/symplr_pages.json.`,
    );
  }

  const scenarioConfig = pageCase.scenarioConfig ?? {};
  let scenarioDefinition: ScenarioDefinition;
  try {
    scenarioDefinition = resolveScenarioConfigPlaceholders(
      deepClone(rawDefinition),
      scenarioConfig,
    ) as ScenarioDefinition;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to resolve scenario "${pageCase.scenario}" for test case "${pageCase.name}". ${message}`,
    );
  }

  console.log(`  >> Scenario: ${pageCase.scenario}`);

  await test.step(` >> scenario: ${pageCase.scenario}`, async () => {
    await runConfiguredTestCaseSections(
      context,
      {
        ...pageCase,
        beforeValidateActions: scenarioDefinition.beforeValidateActions,
        pageAssertions: scenarioDefinition.pageAssertions,
        validations: scenarioDefinition.validations,
        pageActions: scenarioDefinition.pageActions,
        includeTestCases: [],
      },
      testInfo,
      [pageCase.name, `scenario:${pageCase.scenario}`],
      ["beforeValidateActions", "pageAssertions", "validations", "pageActions"],
    );
  });

  console.log(`  >> Scenario "${pageCase.scenario}" executed successfully.`);
}

function resolveScenarioConfigPlaceholders(
  value: unknown,
  scenarioConfig: Record<string, unknown>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      resolveScenarioConfigPlaceholders(item, scenarioConfig),
    );
  }

  if (typeof value === "string") {
    const exactMatch = value.match(/^\$\{scenarioConfig\.([a-zA-Z0-9_.]+)\}$/);
    if (exactMatch) {
      return getScenarioConfigParam(scenarioConfig, exactMatch[1]);
    }

    return value.replace(
      /\$\{scenarioConfig\.([a-zA-Z0-9_.]+)\}/g,
      (_, paramKey) => String(getScenarioConfigParam(scenarioConfig, paramKey)),
    );
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        resolveScenarioConfigPlaceholders(item, scenarioConfig),
      ]),
    );
  }

  return value;
}

function getScenarioConfigParam(
  scenarioConfig: Record<string, unknown>,
  key: string,
): unknown {
  const pathParts = key.split(".");
  let current: unknown = scenarioConfig;

  for (const part of pathParts) {
    if (current === null || typeof current !== "object" || !(part in current)) {
      throw new Error(`Scenario config parameter not found: ${key}`);
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function buildTestCaseLookup(testCases: PageCase[]): Map<string, PageCase> {
  const lookup = new Map<string, PageCase>();

  for (const testCase of testCases) {
    if (lookup.has(testCase.name)) {
      throw new Error(
        `Duplicate test case name found in test data: ${testCase.name}`,
      );
    }
    lookup.set(testCase.name, testCase);
  }

  return lookup;
}

const defaultIncludeSections: IncludeSection[] = [
  "beforeValidateActions",
  "pageAssertions",
  "validations",
  "pageActions",
  "includeTestCases",
];

function normalizeTestCaseInclude(include: TestCaseInclude): {
  name: string;
  sections: IncludeSection[];
} {
  if (typeof include === "string") {
    return { name: include, sections: defaultIncludeSections };
  }

  if (!include.name) {
    throw new Error('includeTestCases item requires "name".');
  }

  return {
    name: include.name,
    sections:
      include.sections && include.sections.length > 0
        ? include.sections
        : defaultIncludeSections,
  };
}

function hasIncludedSection(
  sections: IncludeSection[],
  section: IncludeSection,
): boolean {
  return sections.includes(section);
}

async function runConfiguredTestCaseSections(
  context: RunContext,
  pageCase: PageCase,
  testInfo: TestInfo,
  includeStack: string[],
  sections: IncludeSection[] = defaultIncludeSections,
): Promise<void> {
  if (hasIncludedSection(sections, "beforeValidateActions")) {
    for (const action of pageCase.beforeValidateActions ?? []) {
      await test.step(` >> before validation action: ${action.name ?? action.type}`, async () => {
        await runAction(context, action, undefined, testInfo, pageCase);
      });
    }
  }

  if (hasIncludedSection(sections, "pageAssertions")) {
    for (const assertion of pageCase.pageAssertions ?? []) {
      console.log(`Running page assertion: ${assertion.type}`);

      await test.step(` >> page assertion: ${assertion.type}`, async () => {
        await runPageAssertion(context.activePage, pageCase, assertion);
      });
    }
  }

  if (hasIncludedSection(sections, "validations")) {
    await runValidations(
      context,
      pageCase,
      pageCase.validations ?? [],
      testInfo,
    );
  }

  if (hasIncludedSection(sections, "pageActions")) {
    await runPageActions(
      context,
      pageCase,
      pageCase.pageActions ?? [],
      testInfo,
    );
  }

  if (hasIncludedSection(sections, "includeTestCases")) {
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
      throw new Error(
        `Included test case not found: ${normalizedInclude.name}. Referenced from: ${pageCase.name}`,
      );
    }

    if (includeStack.includes(includedTestCase.name)) {
      throw new Error(
        `Circular includeTestCases reference detected: ${[
          ...includeStack,
          includedTestCase.name,
        ].join(" -> ")}`,
      );
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

function createRunContext(page: Page): RunContext {
  return { mainPage: page, activePage: page };
}

function getAppRunPage(context: RunContext): AppRunPage {
  const targetPage = context.runPage ?? context.activePage;
  if (!context.appRunPage || targetPage !== context.runPage) {
    context.appRunPage = new AppRunPage(targetPage);
  }
  return context.appRunPage;
}

async function runValidations(
  context: RunContext,
  pageCase: PageCase,
  validations: ValidationConfig[],
  testInfo: TestInfo,
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

async function runPageActions(
  context: RunContext,
  pageCase: PageCase,
  actions: ActionConfig[],
  testInfo: TestInfo,
): Promise<void> {
  for (const action of actions) {
    const postActionValidations = [
      ...(action.validations ?? []),
      ...(action.postValidations ?? []),
    ];
    const actionLabel = action.name ?? action.type ?? "validation-only action";

    if (action.retryOnValidationFailure && postActionValidations.length > 0) {
      await test.step(` >> Page action with validation retry: ${actionLabel}`, async () => {
        await runActionWithValidationRetry(
          context,
          pageCase,
          action,
          postActionValidations,
          testInfo,
        );
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
      console.log(
        ` >> Action attempt ${attempt}/${attempts}: ${action.name ?? action.type ?? "validation-only action"}`,
      );

      await runAction(context, action, undefined, testInfo, pageCase);
      await runValidations(context, pageCase, postActionValidations, testInfo);
      return;
    } catch (error) {
      lastError = error;

      if (attempt >= attempts) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Action "${action.name ?? action.type ?? "validation-only action"}" did not pass its post-action validations after ${attempts} attempt(s). Last error: ${message}`,
        );
      }

      console.log(
        ` >> Action validation failed. Waiting ${retryDelayMs}ms before retry ${attempt + 1}/${attempts}.`,
      );
      await context.activePage.waitForTimeout(retryDelayMs);
    }
  }

  throw lastError;
}

function buildTargetUrl(pageCase: PageCase, data: TestData): string {
  if (pageCase.url) return pageCase.url;

  const baseUrl =
    process.env.APP_URL ??
    pageCase.baseUrl ??
    data.defaults?.baseUrl;

  if (!baseUrl) {
    throw new Error(
      `Page "${pageCase.name}" must define either url or path, and APP_URL must be set in .env.`,
    );
  }

  return new URL(pageCase.path ?? "/", baseUrl).toString();
}

type LocatorRoot = Page | FrameLocator;

function buildLocator(page: Page, locatorConfig: LocatorConfig): Locator {
  const frameSelector = locatorConfig.frameLocator?.trim();
  const root: LocatorRoot = frameSelector
    ? page.frameLocator(frameSelector)
    : page;

  return buildLocatorFromRoot(root, locatorConfig);
}

function buildLocatorFromRoot(
  root: LocatorRoot,
  locatorConfig: LocatorConfig,
): Locator {
  let locator: Locator;

  switch (locatorConfig.strategy) {
    case "id": {
      if (!locatorConfig.id) throw new Error('id locator requires "id".');
      locator = root.locator(
        `[id="${escapeCssAttributeValue(locatorConfig.id)}"]`,
      );
      break;
    }
    case "role": {
      if (!locatorConfig.role) throw new Error('role locator requires "role".');

      // Convenience alias used by a few external/login pages where users
      // naturally describe an input field as role=input. Playwright does not
      // have an ARIA role named "input", so resolve common HTML input
      // attributes instead of forcing test data authors to write a CSS selector.
      if (locatorConfig.role.toLowerCase() === "input") {
        const inputName = locatorConfig.name ?? locatorConfig.text;
        if (inputName) {
          const escapedInputName = escapeCssAttributeValue(inputName);
          locator = root.locator(
            `input[name="${escapedInputName}"], input[id="${escapedInputName}"], input[aria-label="${escapedInputName}"], input[placeholder="${escapedInputName}"], textarea[name="${escapedInputName}"], textarea[id="${escapedInputName}"], textarea[aria-label="${escapedInputName}"], textarea[placeholder="${escapedInputName}"]`,
          );
        } else {
          locator = root.locator("input, textarea");
        }
        break;
      }

      locator = root.getByRole(
        locatorConfig.role as never,
        {
          name: locatorConfig.name,
          exact: locatorConfig.exact,
          level: locatorConfig.level,
        } as never,
      );
      break;
    }
    case "text": {
      if (!locatorConfig.text) throw new Error('text locator requires "text".');
      if (locatorConfig.role) {
        locator = root.getByRole(
          locatorConfig.role as never,
          {
            name: locatorConfig.name ?? locatorConfig.text,
            exact: locatorConfig.exact,
            level: locatorConfig.level,
          } as never,
        );
      } else {
        locator = root.getByText(locatorConfig.text, {
          exact: locatorConfig.exact,
        });
      }
      break;
    }
    case "label": {
      if (!locatorConfig.text)
        throw new Error('label locator requires "text".');
      locator = root.getByLabel(locatorConfig.text, {
        exact: locatorConfig.exact,
      });
      break;
    }
    case "img": {
      const imgName = locatorConfig.name ?? locatorConfig.text;
      if (!imgName) throw new Error('img locator requires "name" or "text".');
      console.log(`  >> Waiting for img locator with name: ${imgName}`);
      locator = root.getByRole("img", {
        name: imgName,
        exact: locatorConfig.exact,
      });
      break;
    }
    case "placeholder": {
      if (!locatorConfig.text)
        throw new Error('placeholder locator requires "text".');
      locator = root.getByPlaceholder(locatorConfig.text, {
        exact: locatorConfig.exact,
      });
      break;
    }
    case "altText": {
      if (!locatorConfig.text)
        throw new Error('altText locator requires "text".');
      locator = root.getByAltText(locatorConfig.text, {
        exact: locatorConfig.exact,
      });
      break;
    }
    case "title": {
      if (!locatorConfig.text)
        throw new Error('title locator requires "text".');
      locator = root.getByTitle(locatorConfig.text, {
        exact: locatorConfig.exact,
      });
      break;
    }
    case "testId": {
      if (!locatorConfig.testId)
        throw new Error('testId locator requires "testId".');
      locator = root.getByTestId(locatorConfig.testId);
      break;
    }
    case "css": {
      if (!locatorConfig.selector)
        throw new Error('css locator requires "selector".');
      locator = root.locator(locatorConfig.selector, {
        hasText: locatorConfig.hasText,
      });
      break;
    }
    case "xpath": {
      if (!locatorConfig.selector)
        throw new Error('xpath locator requires "selector".');
      locator = root.locator(`xpath=${locatorConfig.selector}`);
      break;
    }
    case "locator": {
      if (!locatorConfig.locator)
        throw new Error('locator strategy requires "locator".');
      locator = root.locator(locatorConfig.locator);
      break;
    }
    case "custom": {
      const customLocator =
        locatorConfig.locator ?? locatorConfig.selector ?? locatorConfig.value;
      if (!customLocator)
        throw new Error(
          'custom locator strategy requires "locator", "selector", or "value".',
        );
      const selector =
        locatorConfig.engine === "xpath" && !customLocator.startsWith("xpath=")
          ? `xpath=${customLocator}`
          : customLocator;
      locator = root.locator(selector);
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

function resolveActionValue(action: ActionConfig): string | number | boolean | undefined {
  if (action.valueEnv) {
    const value = process.env[action.valueEnv];
    if (value === undefined) {
      throw new Error(
        `Action "${action.name ?? action.type ?? "unnamed"}" requires environment variable ${action.valueEnv}, but it is not set.`,
      );
    }
    return value;
  }

  return action.value;
}

async function runClickAndSwitchToPopupAction(
  context: RunContext,
  locator: Locator,
  action: ActionConfig,
): Promise<void> {
  const timeout = action.timeout ?? 60_000;
  const sourcePage = context.activePage;

  const popupPromise = sourcePage.waitForEvent("popup", { timeout });
  await locator.click();
  const popupPage = await popupPromise;

  await popupPage.waitForLoadState("domcontentloaded", { timeout }).catch(() => {
    // Some OAuth pages keep loading while redirects happen. The popup has still
    // been captured and can receive the next configured action.
  });

  context.popupPage = popupPage;
  context.activePage = popupPage;
  await popupPage.bringToFront();
}

async function runAction(
  context: RunContext,
  action: ActionConfig,
  defaultLocator?: Locator,
  testInfo?: TestInfo,
  pageCase?: PageCase,
): Promise<void> {
  const locator = action.locator
    ? buildLocator(context.activePage, action.locator)
    : defaultLocator;

  if (!action.type) {
    // Allows lightweight branch items such as:
    // { "validations": [{ "$ref": "appDefinitionValidation" }] }
    // The validations are executed by runPageActions after this no-op action.
    return;
  }

  switch (action.type) {
    case "click":
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      await locator.click();
      return;
    case "fill":
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      await locator.fill(String(resolveActionValue(action) ?? ""));
      return;
    case "check":
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      await locator.check();
      return;
    case "uncheck":
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      await locator.uncheck();
      return;
    case "hover":
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      await locator.hover();
      return;
    case "press":
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      const pressValue = resolveActionValue(action);
      if (!pressValue)
        throw new Error('press action requires "value", for example "Enter".');
      await locator.press(String(pressValue));
      return;
    case "selectOption":
      if (!locator) throw new Error(`Action "${action.type}" needs a locator.`);
      const optionValue = resolveActionValue(action);
      if (optionValue === undefined)
        throw new Error('selectOption action requires "value".');
      await locator.selectOption(String(optionValue));
      return;
    case "download":
      if (!locator) throw new Error("download action requires a locator.");
      if (!testInfo)
        throw new Error("download action requires Playwright testInfo.");
      await runGenericDownloadAction(
        context.activePage,
        locator,
        action,
        testInfo,
      );
      return;
    case "clickAndSwitchToPopup":
      if (!locator) throw new Error("clickAndSwitchToPopup action requires a locator.");
      await runClickAndSwitchToPopupAction(context, locator, action);
      return;
    case "switchToPopupPage":
      if (!context.popupPage || context.popupPage.isClosed()) {
        throw new Error(
          'switchToPopupPage requires a previous "clickAndSwitchToPopup" action and an open popup page.',
        );
      }
      context.activePage = context.popupPage;
      await context.popupPage.bringToFront();
      return;
    case "waitForTimeout":
      await context.activePage.waitForTimeout(Number(action.timeout ?? action.value ?? 1_000));
      return;
    case "waitForLoadState": {
      const state = String(action.value ?? "domcontentloaded") as "load" | "domcontentloaded" | "networkidle";
      await context.activePage.waitForLoadState(state, { timeout: action.timeout ?? 30_000 });
      return;
    }
    case "downloadAppDefinition":
      if (!testInfo)
        throw new Error(
          "downloadAppDefinition action requires Playwright testInfo.",
        );
      await runDownloadAppDefinitionAction(context.mainPage, action, testInfo);
      return;
    case "downloadCodeEmail":
      if (!testInfo)
        throw new Error(
          "downloadCodeEmail action requires Playwright testInfo.",
        );
      await runDownloadCodeEmailAction(context, action, testInfo);
      return;
    case "connectToGitHubEmail":
      await runConnectToGitHubEmailAction(action);
      return;
    case "fillEmailCodeAndSubmit":
      await runFillEmailCodeAndSubmitAction(context, action);
      return;
    case "conditional":
      if (!testInfo)
        throw new Error("conditional action requires Playwright testInfo.");
      if (!pageCase)
        throw new Error("conditional action requires the current test case context.");
      await runConditionalAction(context, pageCase, action, testInfo);
      return;
    case "buildAndRunApp":
      await runBuildAndRunAppAction(context);
      return;
    case "waitForBuildComplete":
      await getAppRunPage(context).waitForBuildComplete();
      return;
    case "openRunOnDeviceModal":
      await getAppRunPage(context).openRunOnDeviceModal();
      return;
    case "waitForQrCodeGenerated":
      await getAppRunPage(context).waitForQrCodeGenerated();
      return;
    case "switchToMainPage":
      context.activePage = context.mainPage;
      await context.mainPage.bringToFront();
      return;
    case "switchToRunPage":
      if (!context.runPage || context.runPage.isClosed()) {
        throw new Error(
          'switchToRunPage requires a previous "buildAndRunApp" action that opened the run page.',
        );
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
  testInfo: TestInfo,
): Promise<void> {
  if (!action.condition) {
    throw new Error('conditional action requires "condition".');
  }

  const matched = await evaluateActionCondition(context, action.condition);
  const branchName = matched ? "then" : "else";
  console.log(` >> Conditional action "${action.name ?? action.type}" matched ${branchName} branch.`);

  const branchActions = matched ? action.thenActions ?? [] : action.elseActions ?? [];
  const branchValidations = matched
    ? action.thenValidations ?? []
    : action.elseValidations ?? [];

  await test.step(` >> conditional ${branchName} branch: ${action.name ?? action.type}`, async () => {
    await runPageActions(context, pageCase, branchActions, testInfo);
    await runValidations(context, pageCase, branchValidations, testInfo);
  });
}

async function evaluateActionCondition(
  context: RunContext,
  condition: ActionConditionConfig,
): Promise<boolean> {
  const timeout = Number(condition.timeout ?? 5_000);
  const assertion = condition.assertion ?? "visible";
  const locator = buildLocator(context.activePage, condition.locator);

  try {
    switch (assertion) {
      case "visible":
        await expect(locator).toBeVisible({ timeout });
        return true;
      case "hidden":
        await expect(locator).toBeHidden({ timeout });
        return true;
      case "attached":
        await expect(locator).toBeAttached({ timeout });
        return true;
      default: {
        const unknown: never = assertion;
        throw new Error(`Unsupported conditional assertion: ${unknown}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      ` >> Conditional assertion "${assertion}" did not match within ${timeout}ms. Running else branch. Details: ${message.split("\n")[0]}`,
    );
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
  testInfo: TestInfo,
): Promise<void> {
  const timeout = action.timeout ?? 30_000;
  const downloadPromise = page.waitForEvent("download", { timeout });
  await locator.click();

  const download = await downloadPromise;
  const suggestedFilename = download.suggestedFilename();
  const downloadedFilePath = testInfo.outputPath(
    action.saveAs ?? suggestedFilename,
  );
  await download.saveAs(downloadedFilePath);

  validateDownloadedFile(downloadedFilePath, suggestedFilename, action);
}

async function runDownloadAppDefinitionAction(
  page: Page,
  action: ActionConfig,
  testInfo: TestInfo,
): Promise<void> {
  const storyboardPage = new ProjectStoryBoardPage(page);
  const downloadedFilePath =
    await storyboardPage.downloadAppDefinition(testInfo);
  const suggestedFilename = path.basename(downloadedFilePath);

  validateDownloadedFile(downloadedFilePath, suggestedFilename, action);
}

async function runDownloadCodeEmailAction(
  context: RunContext,
  action: ActionConfig,
  testInfo: TestInfo,
): Promise<void> {
  const expectedEmailSubject = action.expectedEmailSubject ?? "Download Code";
  const emailTo = action.emailTo ?? process.env.GOOGLE_EMAIL;
  const emailFrom = action.emailFrom ?? process.env.EMAIL_SENDER;

  if (!emailTo) {
    throw new Error(
      'downloadCodeEmail requires GOOGLE_EMAIL in .env or "emailTo" in the action.',
    );
  }

  // The UI click that triggers the email is configured in JSON before this action.
  // Gmail search uses second-level timestamps, so subtract a few seconds to avoid
  // missing an email that arrives immediately after the previous action.
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

  const zipFilePath = testInfo.outputPath(
    action.saveAs ?? `email-download-${Date.now()}.zip`,
  );

  const { savedFilePath, downloadUrl } = await downloadZipFromEmailLink(
    email,
    zipFilePath,
    {
      request: context.activePage.context().request,
      timeoutMs: action.timeout ?? 180_000,
    },
  );

  validateDownloadedFile(savedFilePath, path.basename(savedFilePath), {
    ...action,
    expectedExtension: action.expectedExtension ?? ".zip",
    minBytes: action.minBytes ?? 1,
  });

  await testInfo.attach("downloaded-code-zip", {
    path: savedFilePath,
    contentType: "application/zip",
  });

  console.log(`Received download code email with subject: ${email.subject}`);
  console.log(`Downloaded ZIP from email link: ${downloadUrl}`);
  console.log(`Saved ZIP file to: ${savedFilePath}`);
}

async function runConnectToGitHubEmailAction(
  action: ActionConfig,
): Promise<void> {
  const expectedEmailSubject = action.expectedEmailSubject ?? "Push Code Github";
  const emailTo = action.emailTo ?? process.env.GOOGLE_EMAIL;
  const emailFrom = action.emailFrom ?? process.env.EMAIL_SENDER;

  if (!emailTo) {
    throw new Error(
      'connectToGitHubEmail requires GOOGLE_EMAIL in .env or "emailTo" in the action.',
    );
  }

  // Gmail search uses second-level timestamps. Subtract a few seconds so we do
  // not miss an email that arrives immediately before this validation action runs.
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


async function runFillEmailCodeAndSubmitAction(
  context: RunContext,
  action: ActionConfig,
): Promise<void> {
  if (!action.locator) {
    throw new Error('fillEmailCodeAndSubmit action requires locator for the verification code input.');
  }
  if (!action.verifyButtonLocator) {
    throw new Error('fillEmailCodeAndSubmit action requires verifyButtonLocator.');
  }

  const expectedEmailSubject =
    action.expectedEmailSubject ?? '[GitHub] Please verify your device';
  const emailTo = action.emailTo ?? process.env.GOOGLE_EMAIL;

  if (!emailTo) {
    throw new Error(
      'fillEmailCodeAndSubmit requires GOOGLE_EMAIL in .env or "emailTo" in the action.',
    );
  }

  // Gmail search uses second-level timestamps. Subtract a few seconds so we do
  // not miss an email that arrives immediately after the previous UI action.
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

  // const verifyButton = buildLocator(context.activePage, action.verifyButtonLocator);
  // await verifyButton.click();
}

function extractVerificationCodeFromEmail(
  email: ReceivedGmailEmail,
  action: ActionConfig,
): string {
  const emailContent = [
    email.bodyText,
    htmlToPlainText(email.bodyHtml),
    email.snippet,
  ]
    .filter(Boolean)
    .join('\n');

  if (action.codeRegex) {
    const regex = new RegExp(action.codeRegex, action.codeRegexFlags ?? 'i');
    const match = regex.exec(emailContent);
    const code = match?.[1] ?? match?.[0];
    if (code?.trim()) return code.trim();

    throw new Error(
      `Could not extract verification code using codeRegex: ${action.codeRegex}`,
    );
  }

  const codePrefix = action.codePrefix ?? 'Verification code:';
  const prefixRegex = new RegExp(`${escapeRegExp(codePrefix)}\\s*([A-Za-z0-9][A-Za-z0-9 _-]{2,30})`, 'i');
  const match = prefixRegex.exec(emailContent);
  const code = match?.[1]?.trim();

  if (!code) {
    throw new Error(
      `Could not find verification code in email body using prefix: ${codePrefix}`,
    );
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

function validateDownloadedFile(
  downloadedFilePath: string,
  suggestedFilename: string,
  action: ActionConfig,
): void {
  expect(
    fs.existsSync(downloadedFilePath),
    `Downloaded file exists: ${downloadedFilePath}`,
  ).toBe(true);

  const fileStats = fs.statSync(downloadedFilePath);
  const minBytes = action.minBytes ?? 1;
  expect(
    fileStats.size,
    `Downloaded file is at least ${minBytes} byte(s)`,
  ).toBeGreaterThanOrEqual(minBytes);

  if (action.expectedExtension) {
    const expectedExtension = normalizeExtension(action.expectedExtension);
    const actualExtension = path.extname(suggestedFilename).toLowerCase();
    expect(
      actualExtension,
      `Downloaded file extension for ${suggestedFilename}`,
    ).toBe(expectedExtension);
  }

  if (action.expectedFileNameContains) {
    expect(
      suggestedFilename,
      `Downloaded file name contains ${action.expectedFileNameContains}`,
    ).toContain(action.expectedFileNameContains);
  }

  if (action.validateJson) {
    const rawContent = fs.readFileSync(downloadedFilePath, "utf-8");
    expect(
      () => JSON.parse(rawContent),
      `Downloaded file is valid JSON: ${suggestedFilename}`,
    ).not.toThrow();
  }
}

function normalizeExtension(extension: string): string {
  const trimmed = extension.trim().toLowerCase();
  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

async function runPageAssertion(
  page: Page,
  pageCase: PageCase,
  assertion: AssertionConfig,
): Promise<void> {
  const assertionExpect = shouldUseSoftAssertion(pageCase, assertion)
    ? expect.soft
    : expect;
  const expected = expectedValue(assertion);
  const message = `[${pageCase.name}] page assertion ${assertion.type}`;

  switch (assertion.type) {
    case "titleEquals":
      await assertionExpect(page, message).toHaveTitle(String(expected));
      return;
    case "titleContains":
      await assertionExpect(page, message).toHaveTitle(
        containsPattern(String(expected)),
      );
      return;
    case "urlEquals":
      await assertionExpect(page, message).toHaveURL(String(expected));
      return;
    case "urlContains":
      await assertionExpect(page, message).toHaveURL(
        containsPattern(String(expected)),
      );
      return;
    default:
      throw new Error(
        `Assertion "${assertion.type}" is not a page-level assertion.`,
      );
  }
}

async function runLocatorAssertion(
  locator: Locator,
  pageCase: PageCase,
  validation: ValidationConfig,
  assertion: AssertionConfig,
): Promise<void> {
  const assertionExpect = shouldUseSoftAssertion(pageCase, assertion)
    ? expect.soft
    : expect;
  const message = `[${pageCase.name}] ${validation.name} -> ${assertion.type}`;

  switch (assertion.type) {
    case "visible":
      await assertionExpect(locator, message).toBeVisible({
        timeout: assertion.timeout ?? 5000,
      });
      return;
    case "hidden":
      await assertionExpect(locator, message).toBeHidden({
        timeout: assertion.timeout ?? 5000,
      });
      return;
    case "attached":
      await assertionExpect(locator, message).toBeAttached({
        timeout: assertion.timeout ?? 5000,
      });
      return;
    case "enabled":
      await assertionExpect(locator, message).toBeEnabled({
        timeout: assertion.timeout ?? 5000,
      });
      return;
    case "disabled":
      await assertionExpect(locator, message).toBeDisabled({
        timeout: assertion.timeout ?? 5000,
      });
      return;
    case "editable":
      await assertionExpect(locator, message).toBeEditable({
        timeout: assertion.timeout ?? 5000,
      });
      return;
    case "checked":
      await assertionExpect(locator, message).toBeChecked({
        timeout: assertion.timeout ?? 5000,
      });
      return;
    case "unchecked":
      await assertionExpect(locator, message).not.toBeChecked({
        timeout: assertion.timeout ?? 5000,
      });
      return;
    case "empty":
      await assertionExpect(locator, message).toBeEmpty({
        timeout: assertion.timeout ?? 5000,
      });
      return;
    case "textEquals": {
      const expected = expectedValue(assertion);
      await assertionExpect(locator, message).toHaveText(
        expected as string | RegExp,
        { timeout: assertion.timeout ?? 5000 },
      );
      return;
    }
    case "textContains": {
      const expected = expectedValue(assertion);
      await assertionExpect(locator, message).toContainText(
        expected as string | RegExp,
        { timeout: assertion.timeout ?? 5000 },
      );
      return;
    }
    case "valueEquals": {
      const expected = expectedValue(assertion);
      await assertionExpect(locator, message).toHaveValue(String(expected), {
        timeout: assertion.timeout ?? 5000,
      });
      return;
    }
    case "attributeEquals": {
      const expected = expectedValue(assertion);
      if (!assertion.attributeName)
        throw new Error('attributeEquals requires "attributeName".');
      await assertionExpect(locator, message).toHaveAttribute(
        assertion.attributeName,
        String(expected),
        { timeout: assertion.timeout ?? 5000 },
      );
      return;
    }
    case "countEquals": {
      const expected = expectedValue(assertion);
      await assertionExpect(locator, message).toHaveCount(Number(expected), {
        timeout: assertion.timeout ?? 5000,
      });
      return;
    }
    case "countGreaterThan": {
      const expected = expectedValue(assertion);
      const actualCount = await locator.count();
      await assertionExpect(actualCount, message).toBeGreaterThan(
        Number(expected),
      );
      return;
    }
    case "classContains": {
      const expected = expectedValue(assertion);
      await assertionExpect(locator, message).toContainClass(String(expected), {
        timeout: assertion.timeout ?? 5000,
      });
      return;
    }
    case "cssEquals": {
      const expected = expectedValue(assertion);
      if (!assertion.cssName) throw new Error('cssEquals requires "cssName".');
      await assertionExpect(locator, message).toHaveCSS(
        assertion.cssName,
        String(expected),
        { timeout: assertion.timeout ?? 5000 },
      );
      return;
    }
    default:
      throw new Error(
        `Assertion "${assertion.type}" is not a locator-level assertion.`,
      );
  }
}

function shouldUseSoftAssertion(
  pageCase: PageCase,
  assertion: AssertionConfig,
): boolean {
  return (
    assertion.soft ??
    pageCase.softAssertions ??
    testData.defaults?.softAssertions ??
    false
  );
}

function expectedValue(
  assertion: AssertionConfig,
): string | number | boolean | RegExp {
  if (assertion.expectedRegex)
    return new RegExp(assertion.expectedRegex, assertion.flags);
  if (assertion.expected === undefined) {
    throw new Error(
      `Assertion "${assertion.type}" requires either "expected" or "expectedRegex".`,
    );
  }
  return assertion.expected;
}

function containsPattern(value: string): RegExp {
  return new RegExp(escapeRegExp(value));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeCssAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
