#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const filePath = process.argv[2] ?? 'test-data/symplr_pages.json';
const absolutePath = path.resolve(process.cwd(), filePath);
const rawData = JSON.parse(
  fs.readFileSync(absolutePath, 'utf-8').replace(/^\uFEFF/, '')
);

const errors = [];
let data = rawData;
try {
  data = resolveReusableValidations(resolveTokens(rawData));
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

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

for (const [pageIndex, pageCase] of (testCases ?? []).entries()) {
  const prefix = `testCases[${pageIndex}] (${pageCase?.name ?? 'unnamed'})`;
  if (!pageCase?.name) errors.push(`${prefix}: missing name.`);
  if (!pageCase?.path && !pageCase?.url && !pageCase?.scenario) {
    errors.push(`${prefix}: provide path, url, or scenario.`);
  }
  if (pageCase?.scenario && !pageCase.scenarioConfig) {
    errors.push(`${prefix}: scenario is defined but scenarioConfig is missing.`);
  }

  const hasExecutableContent =
    hasItems(pageCase?.beforeValidateActions) ||
    hasItems(pageCase?.pageAssertions) ||
    hasItems(pageCase?.validations) ||
    hasItems(pageCase?.pageActions) ||
    hasItems(pageCase?.includeTestCases);

  if (!hasExecutableContent) {
    errors.push(
      `${prefix}: provide at least one of validations, pageActions, pageAssertions, beforeValidateActions, or includeTestCases.`
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
}

validateIncludeCycles(testCases ?? []);

if (errors.length > 0) {
  console.error('Invalid test data:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Test data looks valid: ${absolutePath}`);

function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
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

  for (const [validationIndex, validation] of (action.validations ?? []).entries()) {
    validateValidation(`${prefix}.validations[${validationIndex}]`, validation);
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
  return {
    ...value,
    testCases: cases.map((pageCase) => resolvePageCaseReusableItems(pageCase, validationSets, validationTemplates)),
  };
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
