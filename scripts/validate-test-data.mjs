#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const filePath = process.argv[2] ?? 'test-data/symplr_pages.json';
const absolutePath = path.resolve(process.cwd(), filePath);
const rawData = loadConfigWithImports(absolutePath);

const errors = [];
let data = rawData;
try {
  data = resolveReusableValidations(resolveTokens(rawData));
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

function loadConfigWithImports(entryPath) {
  return loadConfigFile(path.resolve(entryPath), new Set());
}

function loadConfigFile(filePath, stack) {
  const normalizedPath = path.resolve(filePath);
  if (stack.has(normalizedPath)) {
    throw new Error(`Circular test-data import detected: ${normalizedPath}`);
  }

  stack.add(normalizedPath);

  const parsed = JSON.parse(
    fs.readFileSync(normalizedPath, 'utf-8').replace(/^\uFEFF/, '')
  );

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Test data file must contain a JSON object: ${normalizedPath}`);
  }

  let merged = {};

  if (parsed.imports !== undefined) {
    if (!Array.isArray(parsed.imports)) {
      throw new Error(`Property "imports" must be an array in ${normalizedPath}`);
    }

    for (const importPath of parsed.imports) {
      if (typeof importPath !== 'string') {
        throw new Error(`All import entries must be strings in ${normalizedPath}`);
      }

      const childPath = path.resolve(path.dirname(normalizedPath), importPath);
      merged = mergeConfigObjects(merged, loadConfigFile(childPath, stack));
    }
  }

  const { imports: _imports, ...currentConfig } = parsed;
  merged = mergeConfigObjects(merged, currentConfig);

  stack.delete(normalizedPath);
  return merged;
}

function mergeConfigObjects(base, incoming) {
  const result = cloneConfig(base);

  for (const [key, incomingValue] of Object.entries(incoming)) {
    if (key === 'imports') continue;

    if (key === 'testCases' || key === 'pages') {
      const baseItems = Array.isArray(result[key]) ? result[key] : [];
      const incomingItems = Array.isArray(incomingValue) ? incomingValue : [];
      result[key] = [...baseItems, ...cloneConfig(incomingItems)];
      continue;
    }

    const existingValue = result[key];
    if (isPlainObject(existingValue) && isPlainObject(incomingValue)) {
      result[key] = deepMergeObjects(existingValue, incomingValue);
    } else {
      result[key] = cloneConfig(incomingValue);
    }
  }

  return result;
}

function deepMergeObjects(base, incoming) {
  const result = cloneConfig(base);

  for (const [key, incomingValue] of Object.entries(incoming)) {
    const existingValue = result[key];
    if (isPlainObject(existingValue) && isPlainObject(incomingValue)) {
      result[key] = deepMergeObjects(existingValue, incomingValue);
    } else {
      result[key] = cloneConfig(incomingValue);
    }
  }

  return result;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneConfig(value) {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

const authSessionModes = new Set(['authenticated', 'none']);

const locatorStrategies = new Set([
  'id',
  'role',
  'text',
  'label',
  'img',
  'placeholder',
  'altText',
  'title',
  'testId',
  'css',
  'xpath',
  'locator',
  'custom',
]);
const actions = new Set([
  'click',
  'fill',
  'check',
  'uncheck',
  'hover',
  'press',
  'selectOption',
  'download',
  'downloadAppDefinition',
  'downloadCodeFromEmail',
  'connectToGitHub',
  'fillEmailCodeAndSubmit',
  'buildAndRunApp',
  'waitForBuildComplete',
  'openRunOnDeviceModal',
  'waitForQrCodeGenerated',
  'switchToMainPage',
  'switchToRunPage',
]);
const includeSections = new Set([
  'beforeValidateActions',
  'pageAssertions',
  'validations',
  'pageActions',
  'includeTestCases',
]);
const pageAssertions = new Set([
  'titleEquals',
  'titleContains',
  'urlEquals',
  'urlContains',
]);
const locatorAssertions = new Set([
  'visible',
  'hidden',
  'attached',
  'enabled',
  'disabled',
  'editable',
  'checked',
  'unchecked',
  'empty',
  'textEquals',
  'textContains',
  'valueEquals',
  'attributeEquals',
  'countEquals',
  'countGreaterThan',
  'classContains',
  'cssEquals',
]);
const needsExpected = new Set([
  'titleEquals',
  'titleContains',
  'urlEquals',
  'urlContains',
  'textEquals',
  'textContains',
  'valueEquals',
  'attributeEquals',
  'countEquals',
  'countGreaterThan',
  'classContains',
  'cssEquals',
]);

const testCases = Array.isArray(data.testCases) ? data.testCases : data.pages;
if (!Array.isArray(testCases) || testCases.length === 0) {
  errors.push('Root property "testCases" must be a non-empty array.');
}

const testCaseNameCounts = new Map();
for (const pageCase of testCases ?? []) {
  if (!pageCase?.name) continue;
  testCaseNameCounts.set(pageCase.name, (testCaseNameCounts.get(pageCase.name) ?? 0) + 1);
}
for (const [name, count] of testCaseNameCounts.entries()) {
  if (count > 1) errors.push(`Duplicate test case name: ${name}`);
}
const testCaseNames = new Set(testCaseNameCounts.keys());


const scenarioDefinitions = data.scenarioDefinitions ?? {};
if (scenarioDefinitions !== undefined && (scenarioDefinitions === null || typeof scenarioDefinitions !== 'object' || Array.isArray(scenarioDefinitions))) {
  errors.push('Root property "scenarioDefinitions" must be an object when provided.');
}

for (const [scenarioName, scenarioDefinition] of Object.entries(scenarioDefinitions)) {
  validateScenarioDefinition(`scenarioDefinitions.${scenarioName}`, scenarioDefinition);
}

for (const [pageIndex, pageCase] of (testCases ?? []).entries()) {
  const prefix = `testCases[${pageIndex}] (${pageCase?.name ?? 'unnamed'})`;
  if (!pageCase?.name) errors.push(`${prefix}: missing name.`);
  const usesUnauthenticatedPage = pageCase?.auth?.session === 'none';
  if (!pageCase?.path && !pageCase?.url && !pageCase?.scenario && !usesUnauthenticatedPage) {
    errors.push(`${prefix}: provide path, url, scenario, or auth.session="none".`);
  }
  if (pageCase?.auth !== undefined) {
    validateAuthOptions(`${prefix}.auth`, pageCase.auth);
  }
  if (pageCase?.scenario && !scenarioDefinitions[pageCase.scenario]) {
    errors.push(`${prefix}: scenario definition not found for "${pageCase.scenario}".`);
  }
  if (pageCase?.scenarioConfig !== undefined && (pageCase.scenarioConfig === null || typeof pageCase.scenarioConfig !== 'object' || Array.isArray(pageCase.scenarioConfig))) {
    errors.push(`${prefix}: scenarioConfig must be an object when provided.`);
  }
  if (pageCase?.scenario && scenarioDefinitions[pageCase.scenario]) {
    const requiredScenarioConfigKeys = collectScenarioConfigPlaceholders(scenarioDefinitions[pageCase.scenario]);
    for (const key of requiredScenarioConfigKeys) {
      if (!hasNestedProperty(pageCase.scenarioConfig ?? {}, key)) {
        errors.push(
          `${prefix}: scenario "${pageCase.scenario}" requires scenarioConfig.${key} because scenarioDefinitions.${pageCase.scenario} references "${'${'}scenarioConfig.${key}}".`
        );
      }
    }
  }

  const hasExecutableContent =
    hasItems(pageCase?.beforeValidateActions) ||
    hasItems(pageCase?.pageAssertions) ||
    hasItems(pageCase?.validations) ||
    hasItems(pageCase?.pageActions) ||
    hasItems(pageCase?.includeTestCases) ||
    hasItems(pageCase?.prerequisiteTestCases);

  if (!hasExecutableContent) {
    errors.push(
      `${prefix}: provide at least one of validations, pageActions, pageAssertions, beforeValidateActions, includeTestCases, or prerequisiteTestCases.`
    );
  }

  for (const [actionIndex, action] of (pageCase?.beforeValidateActions ?? []).entries()) {
    validateAction(`${prefix}.beforeValidateActions[${actionIndex}]`, action);
  }

  for (const [assertionIndex, assertion] of (pageCase?.pageAssertions ?? []).entries()) {
    validateAssertion(`${prefix}.pageAssertions[${assertionIndex}]`, assertion, pageAssertions);
  }

  for (const [validationIndex, validation] of (pageCase?.validations ?? []).entries()) {
    validateValidation(`${prefix}.validations[${validationIndex}]`, validation);
  }

  for (const [actionIndex, action] of (pageCase?.pageActions ?? []).entries()) {
    validateAction(`${prefix}.pageActions[${actionIndex}]`, action);
  }

  for (const [includeIndex, include] of (pageCase?.includeTestCases ?? []).entries()) {
    validateTestCaseInclude(`${prefix}.includeTestCases[${includeIndex}]`, include, pageCase.name, []);
  }

  for (const [prerequisiteIndex, prerequisite] of (pageCase?.prerequisiteTestCases ?? []).entries()) {
    validateTestCaseInclude(`${prefix}.prerequisiteTestCases[${prerequisiteIndex}]`, prerequisite, pageCase.name, []);
  }
}

validateIncludeCycles(testCases ?? []);
validatePrerequisiteCycles(testCases ?? []);

if (errors.length > 0) {
  console.error('Invalid test data:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Test data looks valid: ${absolutePath}`);

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function collectScenarioConfigPlaceholders(value, found = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectScenarioConfigPlaceholders(item, found);
    return found;
  }

  if (typeof value === 'string') {
    for (const match of value.matchAll(/\$\{scenarioConfig\.([a-zA-Z0-9_.]+)\}/g)) {
      found.add(match[1]);
    }
    return found;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectScenarioConfigPlaceholders(item, found);
  }

  return found;
}

function hasNestedProperty(value, key) {
  const pathParts = key.split('.');
  let current = value;

  for (const part of pathParts) {
    if (current === null || typeof current !== 'object' || !(part in current)) {
      return false;
    }
    current = current[part];
  }

  return true;
}


function validateAuthOptions(prefix, auth) {
  if (!auth || typeof auth !== 'object' || Array.isArray(auth)) {
    errors.push(`${prefix}: auth must be an object when provided.`);
    return;
  }

  if (auth.session !== undefined && !authSessionModes.has(auth.session)) {
    errors.push(`${prefix}.session: must be one of authenticated or none.`);
  }
  if (auth.clearStorageState !== undefined && typeof auth.clearStorageState !== 'boolean') {
    errors.push(`${prefix}.clearStorageState: must be true or false.`);
  }
  if (auth.storageStatePath !== undefined && typeof auth.storageStatePath !== 'string') {
    errors.push(`${prefix}.storageStatePath: must be a string path.`);
  }
  if (auth.appUrlEnv !== undefined && typeof auth.appUrlEnv !== 'string') {
    errors.push(`${prefix}.appUrlEnv: must be a string environment variable name.`);
  }
  if (auth.navigateToApp !== undefined && typeof auth.navigateToApp !== 'boolean') {
    errors.push(`${prefix}.navigateToApp: must be true or false.`);
  }
}

function validateScenarioDefinition(prefix, scenarioDefinition) {
  if (!scenarioDefinition || typeof scenarioDefinition !== 'object' || Array.isArray(scenarioDefinition)) {
    errors.push(`${prefix}: scenario definition must be an object.`);
    return;
  }

  if (scenarioDefinition.description !== undefined && typeof scenarioDefinition.description !== 'string') {
    errors.push(`${prefix}.description: must be a string.`);
  }

  for (const [actionIndex, action] of (scenarioDefinition.beforeValidateActions ?? []).entries()) {
    validateAction(`${prefix}.beforeValidateActions[${actionIndex}]`, action);
  }

  for (const [assertionIndex, assertion] of (scenarioDefinition.pageAssertions ?? []).entries()) {
    validateAssertion(`${prefix}.pageAssertions[${assertionIndex}]`, assertion, pageAssertions);
  }

  for (const [validationIndex, validation] of (scenarioDefinition.validations ?? []).entries()) {
    validateValidation(`${prefix}.validations[${validationIndex}]`, validation);
  }

  for (const [actionIndex, action] of (scenarioDefinition.pageActions ?? []).entries()) {
    validateAction(`${prefix}.pageActions[${actionIndex}]`, action);
  }
}

function validateTestCaseInclude(prefix, include, ownerName) {
  let includeName;
  let sections;

  if (typeof include === 'string') {
    includeName = include;
  } else if (include && typeof include === 'object') {
    includeName = include.name;
    sections = include.sections;
  } else {
    errors.push(`${prefix}: include must be a test case name string or an object with name.`);
    return;
  }

  if (!includeName || typeof includeName !== 'string') {
    errors.push(`${prefix}: include name must be a non-empty string.`);
    return;
  }
  if (!testCaseNames.has(includeName)) {
    errors.push(`${prefix}: included test case not found: ${includeName}.`);
  }
  if (includeName === ownerName) {
    errors.push(`${prefix}: test case cannot include itself.`);
  }

  if (sections !== undefined) {
    if (!Array.isArray(sections) || sections.length === 0) {
      errors.push(`${prefix}.sections: must be a non-empty array when provided.`);
    } else {
      for (const [sectionIndex, section] of sections.entries()) {
        if (!includeSections.has(section)) {
          errors.push(`${prefix}.sections[${sectionIndex}]: unsupported section "${section}".`);
        }
      }
    }
  }
}

function validateIncludeCycles(cases) {
  const byName = new Map(cases.filter((item) => item?.name).map((item) => [item.name, item]));

  function visit(caseName, stack) {
    if (stack.includes(caseName)) {
      errors.push(`Circular includeTestCases reference detected: ${[...stack, caseName].join(' -> ')}`);
      return;
    }
    const pageCase = byName.get(caseName);
    if (!pageCase) return;

    for (const include of pageCase.includeTestCases ?? []) {
      const includeName = typeof include === 'string' ? include : include?.name;
      if (includeName) visit(includeName, [...stack, caseName]);
    }
  }

  for (const pageCase of cases) {
    if (pageCase?.name) visit(pageCase.name, []);
  }
}

function validatePrerequisiteCycles(cases) {
  const byName = new Map(cases.filter((item) => item?.name).map((item) => [item.name, item]));

  function visit(caseName, stack) {
    if (stack.includes(caseName)) {
      errors.push(`Circular prerequisiteTestCases reference detected: ${[...stack, caseName].join(' -> ')}`);
      return;
    }
    const pageCase = byName.get(caseName);
    if (!pageCase) return;

    for (const prerequisite of pageCase.prerequisiteTestCases ?? []) {
      const prerequisiteName = typeof prerequisite === 'string' ? prerequisite : prerequisite?.name;
      if (prerequisiteName) visit(prerequisiteName, [...stack, caseName]);
    }
  }

  for (const pageCase of cases) {
    if (pageCase?.name) visit(pageCase.name, []);
  }
}

function validateValidation(prefix, validation) {
  const validationPrefix = `${prefix} (${validation?.name ?? 'unnamed'})`;
  if (!validation?.name) errors.push(`${validationPrefix}: missing name.`);
  validateLocator(`${validationPrefix}.locator`, validation?.locator);

  for (const [actionIndex, action] of (validation?.actions ?? []).entries()) {
    validateAction(`${validationPrefix}.actions[${actionIndex}]`, action);
  }

  if (!Array.isArray(validation?.assertions) || validation.assertions.length === 0) {
    errors.push(`${validationPrefix}: assertions must be a non-empty array.`);
  }

  for (const [assertionIndex, assertion] of (validation?.assertions ?? []).entries()) {
    validateAssertion(`${validationPrefix}.assertions[${assertionIndex}]`, assertion, locatorAssertions);
  }
}

function validateLocator(prefix, locator) {
  if (!locator || typeof locator !== 'object') {
    errors.push(`${prefix}: missing locator object.`);
    return;
  }
  if (!locatorStrategies.has(locator.strategy)) {
    errors.push(`${prefix}: unsupported strategy "${locator.strategy}".`);
    return;
  }
  if (locator.strategy === 'id' && !locator.id) errors.push(`${prefix}: id strategy requires id.`);
  if (locator.strategy === 'role' && !locator.role) errors.push(`${prefix}: role strategy requires role.`);
  if (['text', 'label', 'placeholder', 'altText', 'title'].includes(locator.strategy) && !locator.text) {
    errors.push(`${prefix}: ${locator.strategy} strategy requires text.`);
  }
  if (locator.strategy === 'img' && !locator.name && !locator.text) {
    errors.push(`${prefix}: img strategy requires name or text.`);
  }
  if (locator.strategy === 'testId' && !locator.testId) errors.push(`${prefix}: testId strategy requires testId.`);
  if (['css', 'xpath'].includes(locator.strategy) && !locator.selector) {
    errors.push(`${prefix}: ${locator.strategy} strategy requires selector.`);
  }
  if (locator.strategy === 'locator' && !locator.locator) errors.push(`${prefix}: locator strategy requires locator.`);
  if (locator.strategy === 'custom' && !locator.locator && !locator.selector && !locator.value) {
    errors.push(`${prefix}: custom strategy requires locator, selector, or value.`);
  }
  if (locator.engine && !['css', 'xpath', 'playwright'].includes(locator.engine)) {
    errors.push(`${prefix}: engine must be css, xpath, or playwright.`);
  }
  if (locator.frameLocator !== undefined && typeof locator.frameLocator !== 'string') {
    errors.push(`${prefix}: frameLocator must be a string iframe selector, for example "#emulator-iframe".`);
  }
}

function validateAction(prefix, action) {
  if (!action || !actions.has(action.type)) {
    errors.push(`${prefix}: unsupported action "${action?.type}".`);
    return;
  }
  if (['fill', 'press', 'selectOption'].includes(action.type) && action.value === undefined) {
    errors.push(`${prefix}: action "${action.type}" requires value.`);
  }
  if (action.type === 'download' && !action.locator) {
    errors.push(`${prefix}: download action requires locator.`);
  }
  if (action.locator) validateLocator(`${prefix}.locator`, action.locator);
  if (action.name !== undefined && typeof action.name !== 'string') {
    errors.push(`${prefix}: name must be a string.`);
  }
  if (action.expectedExtension !== undefined && typeof action.expectedExtension !== 'string') {
    errors.push(`${prefix}: expectedExtension must be a string, for example ".json".`);
  }
  if (action.expectedFileNameContains !== undefined && typeof action.expectedFileNameContains !== 'string') {
    errors.push(`${prefix}: expectedFileNameContains must be a string.`);
  }
  if (action.validateJson !== undefined && typeof action.validateJson !== 'boolean') {
    errors.push(`${prefix}: validateJson must be true or false.`);
  }
  if (action.minBytes !== undefined && typeof action.minBytes !== 'number') {
    errors.push(`${prefix}: minBytes must be a number.`);
  }
  if (action.saveAs !== undefined && typeof action.saveAs !== 'string') {
    errors.push(`${prefix}: saveAs must be a string.`);
  }
  if (action.timeout !== undefined && typeof action.timeout !== 'number') {
    errors.push(`${prefix}: timeout must be a number.`);
  }
  if (action.expectedEmailSubject !== undefined && typeof action.expectedEmailSubject !== 'string') {
    errors.push(`${prefix}: expectedEmailSubject must be a string.`);
  }
  if (action.emailFrom !== undefined && typeof action.emailFrom !== 'string') {
    errors.push(`${prefix}: emailFrom must be a string.`);
  }
  if (action.emailTo !== undefined && typeof action.emailTo !== 'string') {
    errors.push(`${prefix}: emailTo must be a string.`);
  }
  if (action.emailBodyContains !== undefined && typeof action.emailBodyContains !== 'string') {
    errors.push(`${prefix}: emailBodyContains must be a string.`);
  }
  if (action.pollIntervalMs !== undefined && typeof action.pollIntervalMs !== 'number') {
    errors.push(`${prefix}: pollIntervalMs must be a number.`);
  }
  if (action.codePrefix !== undefined && typeof action.codePrefix !== 'string') {
    errors.push(`${prefix}: codePrefix must be a string.`);
  }
  if (action.codeRegex !== undefined && typeof action.codeRegex !== 'string') {
    errors.push(`${prefix}: codeRegex must be a string.`);
  }
  if (action.codeRegexFlags !== undefined && typeof action.codeRegexFlags !== 'string') {
    errors.push(`${prefix}: codeRegexFlags must be a string.`);
  }
  if (action.verifyButtonLocator !== undefined) {
    validateLocator(`${prefix}.verifyButtonLocator`, action.verifyButtonLocator);
  }
  if (action.retryOnValidationFailure !== undefined && typeof action.retryOnValidationFailure !== 'boolean') {
    errors.push(`${prefix}: retryOnValidationFailure must be true or false.`);
  }
  if (action.retryAttempts !== undefined && typeof action.retryAttempts !== 'number') {
    errors.push(`${prefix}: retryAttempts must be a number.`);
  }
  if (action.retryDelayMs !== undefined && typeof action.retryDelayMs !== 'number') {
    errors.push(`${prefix}: retryDelayMs must be a number.`);
  }
  if (action.retryOnValidationFailure === true) {
    const actionValidations = [
      ...(action.validations ?? []),
      ...(action.postValidations ?? []),
    ];
    if (actionValidations.length === 0) {
      errors.push(`${prefix}: retryOnValidationFailure requires validations or postValidations to know when the retry succeeded.`);
    }
  }
  if (action.type === 'fillEmailCodeAndSubmit') {
    if (!action.locator) {
      errors.push(`${prefix}: fillEmailCodeAndSubmit action requires locator for the verification code input.`);
    }
    if (!action.verifyButtonLocator) {
      errors.push(`${prefix}: fillEmailCodeAndSubmit action requires verifyButtonLocator.`);
    }
  }

  for (const [validationIndex, validation] of (action.validations ?? []).entries()) {
    validateValidation(`${prefix}.validations[${validationIndex}]`, validation);
  }

  for (const [validationIndex, validation] of (action.postValidations ?? []).entries()) {
    validateValidation(`${prefix}.postValidations[${validationIndex}]`, validation);
  }

  for (const [actionIndex, nestedAction] of (action.pageActions ?? []).entries()) {
    validateAction(`${prefix}.pageActions[${actionIndex}]`, nestedAction);
  }
}

function validateAssertion(prefix, assertion, allowedAssertions) {
  if (!assertion || !allowedAssertions.has(assertion.type)) {
    errors.push(`${prefix}: unsupported assertion "${assertion?.type}".`);
    return;
  }
  if (needsExpected.has(assertion.type) && assertion.expected === undefined && assertion.expectedRegex === undefined) {
    errors.push(`${prefix}: assertion "${assertion.type}" requires expected or expectedRegex.`);
  }
  if (assertion.type === 'attributeEquals' && !assertion.attributeName) {
    errors.push(`${prefix}: attributeEquals requires attributeName.`);
  }
  if (assertion.type === 'cssEquals' && !assertion.cssName) {
    errors.push(`${prefix}: cssEquals requires cssName.`);
  }
}

function resolveTokens(value) {
  if (value === null || typeof value !== 'object') return value;
  const tokens = Object.entries(value.tokens ?? {}).reduce((acc, [key, tokenValue]) => {
    if (typeof tokenValue === 'string') acc[key] = tokenValue;
    return acc;
  }, {});
  return resolveTokenPlaceholders(value, tokens);
}

function resolveTokenPlaceholders(value, tokens) {
  if (Array.isArray(value)) return value.map((item) => resolveTokenPlaceholders(item, tokens));
  if (typeof value === 'string') {
    return value.replace(/\$\{tokens\.([a-zA-Z0-9_]+)\}/g, (_, tokenKey) => {
      if (!(tokenKey in tokens)) throw new Error(`Token not found: ${tokenKey}`);
      return tokens[tokenKey];
    });
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveTokenPlaceholders(item, tokens)]));
  }
  return value;
}

function resolveReusableValidations(value) {
  if (value === null || typeof value !== 'object') return value;
  const validationSets = value.validationSets ?? {};
  const validationTemplates = value.validationTemplates ?? {};
  const cases = Array.isArray(value.testCases) ? value.testCases : value.pages;
  if (!Array.isArray(cases)) return value;

  const scenarioDefinitions = value.scenarioDefinitions ?? {};
  const resolvedScenarioDefinitions = Object.fromEntries(
    Object.entries(scenarioDefinitions).map(([name, definition]) => [
      name,
      resolveScenarioDefinitionReusableItems(definition, validationSets, validationTemplates),
    ])
  );

  return {
    ...value,
    scenarioDefinitions: resolvedScenarioDefinitions,
    testCases: cases.map((pageCase) => resolvePageCaseReusableItems(pageCase, validationSets, validationTemplates)),
  };
}

function resolveScenarioDefinitionReusableItems(definition, validationSets, validationTemplates) {
  if (definition === null || typeof definition !== 'object') return definition;
  const resolvedDefinition = { ...definition };
  if (Array.isArray(resolvedDefinition.beforeValidateActions)) {
    resolvedDefinition.beforeValidateActions = resolvedDefinition.beforeValidateActions.map((action) =>
      resolveActionReusableItems(action, validationSets, validationTemplates)
    );
  }
  if (Array.isArray(resolvedDefinition.pageActions)) {
    resolvedDefinition.pageActions = resolvedDefinition.pageActions.map((action) =>
      resolveActionReusableItems(action, validationSets, validationTemplates)
    );
  }
  if (Array.isArray(resolvedDefinition.validations)) {
    resolvedDefinition.validations = resolveValidationItems(resolvedDefinition.validations, validationSets, validationTemplates);
  }
  return resolvedDefinition;
}

function resolvePageCaseReusableItems(pageCase, validationSets, validationTemplates) {
  if (pageCase === null || typeof pageCase !== 'object') return pageCase;
  const resolvedPageCase = { ...pageCase };
  if (Array.isArray(resolvedPageCase.beforeValidateActions)) {
    resolvedPageCase.beforeValidateActions = resolvedPageCase.beforeValidateActions.map((action) =>
      resolveActionReusableItems(action, validationSets, validationTemplates)
    );
  }
  if (Array.isArray(resolvedPageCase.pageActions)) {
    resolvedPageCase.pageActions = resolvedPageCase.pageActions.map((action) =>
      resolveActionReusableItems(action, validationSets, validationTemplates)
    );
  }
  if (Array.isArray(resolvedPageCase.validations)) {
    resolvedPageCase.validations = resolveValidationItems(resolvedPageCase.validations, validationSets, validationTemplates);
  }
  return resolvedPageCase;
}

function resolveActionReusableItems(action, validationSets, validationTemplates) {
  if (action === null || typeof action !== 'object') return action;
  const resolvedAction = { ...action };
  if (Array.isArray(resolvedAction.validations)) {
    resolvedAction.validations = resolveValidationItems(resolvedAction.validations, validationSets, validationTemplates);
  }
  if (Array.isArray(resolvedAction.postValidations)) {
    resolvedAction.postValidations = resolveValidationItems(resolvedAction.postValidations, validationSets, validationTemplates);
  }
  if (Array.isArray(resolvedAction.pageActions)) {
    resolvedAction.pageActions = resolvedAction.pageActions.map((nestedAction) =>
      resolveActionReusableItems(nestedAction, validationSets, validationTemplates)
    );
  }
  return resolvedAction;
}

function resolveValidationItems(validations, validationSets, validationTemplates) {
  return validations.flatMap((item) => resolveValidationItem(item, validationSets, validationTemplates));
}

function resolveValidationItem(item, validationSets, validationTemplates) {
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

function resolveValidationNestedReusableItems(validation, validationSets, validationTemplates) {
  if (validation === null || typeof validation !== 'object') return validation;
  const resolvedValidation = { ...validation };
  if (Array.isArray(resolvedValidation.actions)) {
    resolvedValidation.actions = resolvedValidation.actions.map((action) =>
      resolveActionReusableItems(action, validationSets, validationTemplates)
    );
  }
  return resolvedValidation;
}

function isValidationRef(value) {
  return typeof value === 'object' && value !== null && typeof value.$ref === 'string';
}

function isValidationTemplateRef(value) {
  return typeof value === 'object' && value !== null && typeof value.$template === 'string';
}

function resolveValidationRef(ref, validationSets) {
  const key = ref.startsWith('validationSets.') ? ref.slice('validationSets.'.length) : ref;
  const setValue = validationSets[key];
  if (setValue === undefined) throw new Error(`Validation set not found: ${ref}`);
  return Array.isArray(setValue) ? deepClone(setValue) : [deepClone(setValue)];
}

function resolveValidationTemplate(templateName, params, validationTemplates) {
  const key = templateName.startsWith('validationTemplates.') ? templateName.slice('validationTemplates.'.length) : templateName;
  const definition = validationTemplates[key];
  if (definition === undefined) throw new Error(`Validation template not found: ${templateName}`);

  let templateValue = definition;
  let defaults = {};
  if (definition !== null && typeof definition === 'object' && !Array.isArray(definition) && 'template' in definition) {
    templateValue = definition.template;
    defaults = definition.defaults ?? {};
  }

  const resolvedTemplate = resolveParamPlaceholders(deepClone(templateValue), { ...defaults, ...params });
  return Array.isArray(resolvedTemplate) ? resolvedTemplate : [resolvedTemplate];
}

function resolveParamPlaceholders(value, params) {
  if (Array.isArray(value)) return value.map((item) => resolveParamPlaceholders(item, params));
  if (typeof value === 'string') {
    const exactMatch = value.match(/^\$\{params?\.([a-zA-Z0-9_.]+)\}$/);
    if (exactMatch) return getTemplateParam(params, exactMatch[1]);
    return value.replace(/\$\{params?\.([a-zA-Z0-9_.]+)\}/g, (_, paramKey) => String(getTemplateParam(params, paramKey)));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveParamPlaceholders(item, params)]));
  }
  return value;
}

function getTemplateParam(params, key) {
  const pathParts = key.split('.');
  let current = params;

  for (const part of pathParts) {
    if (current === null || typeof current !== 'object' || !(part in current)) {
      throw new Error(`Template parameter not found: ${key}`);
    }
    current = current[part];
  }

  return current;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
