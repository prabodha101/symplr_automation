import path from 'node:path';
import constants from '../../shared/framework-constants.json' with { type: 'json' };

const authSessionModes = new Set(constants.authSessionModes);
const locatorStrategies = new Set(constants.locatorStrategies);
const actions = new Set(constants.actionTypes);
const conditionalAssertions = new Set(constants.conditionalAssertions);
const includeSections = new Set(constants.includeSections);
const pageAssertions = new Set(constants.pageAssertions);
const locatorAssertions = new Set(constants.locatorAssertions);
const needsExpected = new Set(constants.assertionsNeedingExpected);

export function validateTestData(data) {
  const errors = [];
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
    const usesUnauthenticatedPage = pageCase?.auth?.session === 'none';
    const hasConfiguredSteps =
      hasItems(pageCase?.beforeValidateActions) ||
      hasItems(pageCase?.pageAssertions) ||
      hasItems(pageCase?.validations) ||
      hasItems(pageCase?.pageActions) ||
      hasItems(pageCase?.includeTestCases) ||
      hasItems(pageCase?.prerequisiteTestCases);
    if (!pageCase?.path && !pageCase?.url && !usesUnauthenticatedPage && !hasConfiguredSteps) {
      errors.push(`${prefix}: provide path, url, auth.session="none", or executable configured steps.`);
    }
    if (pageCase?.auth !== undefined) {
      validateAuthOptions(errors, `${prefix}.auth`, pageCase.auth);
    }

    const hasExecutableContent = hasConfiguredSteps;
    if (!hasExecutableContent) {
      errors.push(`${prefix}: provide at least one of validations, pageActions, pageAssertions, beforeValidateActions, includeTestCases, or prerequisiteTestCases.`);
    }

    for (const [actionIndex, action] of (pageCase?.beforeValidateActions ?? []).entries()) {
      validateAction(errors, `${prefix}.beforeValidateActions[${actionIndex}]`, action, testCaseNames);
    }
    for (const [assertionIndex, assertion] of (pageCase?.pageAssertions ?? []).entries()) {
      validateAssertion(errors, `${prefix}.pageAssertions[${assertionIndex}]`, assertion, pageAssertions);
    }
    for (const [validationIndex, validation] of (pageCase?.validations ?? []).entries()) {
      validateValidation(errors, `${prefix}.validations[${validationIndex}]`, validation, testCaseNames);
    }
    for (const [actionIndex, action] of (pageCase?.pageActions ?? []).entries()) {
      validateAction(errors, `${prefix}.pageActions[${actionIndex}]`, action, testCaseNames);
    }
    validateTestCaseIncludes(errors, `${prefix}.includeTestCases`, pageCase?.includeTestCases, testCaseNames);
    validateTestCaseIncludes(errors, `${prefix}.prerequisiteTestCases`, pageCase?.prerequisiteTestCases, testCaseNames);
  }

  return errors;
}

function hasItems(value) { return Array.isArray(value) && value.length > 0; }

function validateAuthOptions(errors, prefix, auth) {
  if (auth === null || typeof auth !== 'object' || Array.isArray(auth)) {
    errors.push(`${prefix}: auth must be an object.`); return;
  }
  if (auth.session !== undefined && !authSessionModes.has(auth.session)) {
    errors.push(`${prefix}.session: expected one of ${Array.from(authSessionModes).join(', ')}.`);
  }
}

function validateLocator(errors, prefix, locator) {
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) {
    errors.push(`${prefix}: locator must be an object.`); return;
  }
  if (!locatorStrategies.has(locator.strategy)) {
    errors.push(`${prefix}.strategy: unsupported locator strategy "${locator.strategy}".`);
  }
}

function validateAction(errors, prefix, action, testCaseNames) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    errors.push(`${prefix}: action must be an object.`); return;
  }
  if (action.type !== undefined && !actions.has(action.type)) {
    errors.push(`${prefix}.type: unsupported action type "${action.type}".`);
  }
  if (action.locator !== undefined) validateLocator(errors, `${prefix}.locator`, action.locator);
  if (action.verifyButtonLocator !== undefined) validateLocator(errors, `${prefix}.verifyButtonLocator`, action.verifyButtonLocator);
  if (action.condition !== undefined) validateActionCondition(errors, `${prefix}.condition`, action.condition);
  for (const [idx, validation] of (action.validations ?? []).entries()) validateValidation(errors, `${prefix}.validations[${idx}]`, validation, testCaseNames);
  for (const [idx, validation] of (action.postValidations ?? []).entries()) validateValidation(errors, `${prefix}.postValidations[${idx}]`, validation, testCaseNames);
  for (const [idx, nestedAction] of (action.pageActions ?? []).entries()) validateAction(errors, `${prefix}.pageActions[${idx}]`, nestedAction, testCaseNames);
  for (const [idx, nestedAction] of (action.thenActions ?? []).entries()) validateAction(errors, `${prefix}.thenActions[${idx}]`, nestedAction, testCaseNames);
  for (const [idx, nestedAction] of (action.elseActions ?? []).entries()) validateAction(errors, `${prefix}.elseActions[${idx}]`, nestedAction, testCaseNames);
  for (const [idx, validation] of (action.thenValidations ?? []).entries()) validateValidation(errors, `${prefix}.thenValidations[${idx}]`, validation, testCaseNames);
  for (const [idx, validation] of (action.elseValidations ?? []).entries()) validateValidation(errors, `${prefix}.elseValidations[${idx}]`, validation, testCaseNames);
}

function validateActionCondition(errors, prefix, condition) {
  if (!condition || typeof condition !== 'object' || Array.isArray(condition)) {
    errors.push(`${prefix}: condition must be an object.`); return;
  }
  validateLocator(errors, `${prefix}.locator`, condition.locator);
  if (condition.assertion !== undefined && !conditionalAssertions.has(condition.assertion)) {
    errors.push(`${prefix}.assertion: expected one of ${Array.from(conditionalAssertions).join(', ')}.`);
  }
}

function validateAssertion(errors, prefix, assertion, allowedAssertions) {
  if (!assertion || typeof assertion !== 'object' || Array.isArray(assertion)) {
    errors.push(`${prefix}: assertion must be an object.`); return;
  }
  if (!allowedAssertions.has(assertion.type)) {
    errors.push(`${prefix}.type: unsupported assertion type "${assertion.type}".`);
  }
  if (needsExpected.has(assertion.type) && assertion.expected === undefined && assertion.expectedRegex === undefined) {
    errors.push(`${prefix}: assertion type "${assertion.type}" requires expected or expectedRegex.`);
  }
}

function validateValidation(errors, prefix, validation, testCaseNames) {
  if (!validation || typeof validation !== 'object' || Array.isArray(validation)) {
    errors.push(`${prefix}: validation must be an object.`); return;
  }
  if (!validation.name) errors.push(`${prefix}: validation requires name.`);
  validateLocator(errors, `${prefix}.locator`, validation.locator);
  if (!Array.isArray(validation.assertions) || validation.assertions.length === 0) {
    errors.push(`${prefix}.assertions: validation requires at least one assertion.`);
  }
  for (const [idx, action] of (validation.actions ?? []).entries()) validateAction(errors, `${prefix}.actions[${idx}]`, action, testCaseNames);
  for (const [idx, assertion] of (validation.assertions ?? []).entries()) validateAssertion(errors, `${prefix}.assertions[${idx}]`, assertion, locatorAssertions);
}

function validateTestCaseIncludes(errors, prefix, includes, testCaseNames) {
  if (includes === undefined) return;
  if (!Array.isArray(includes)) {
    errors.push(`${prefix}: expected an array.`); return;
  }
  for (const [index, include] of includes.entries()) {
    if (typeof include === 'string') {
      if (!testCaseNames.has(include)) errors.push(`${prefix}[${index}]: unknown test case "${include}".`);
      continue;
    }
    if (!include || typeof include !== 'object' || Array.isArray(include)) {
      errors.push(`${prefix}[${index}]: include entry must be a string or object.`); continue;
    }
    if (!include.name || typeof include.name !== 'string') {
      errors.push(`${prefix}[${index}].name: is required.`);
    } else if (!testCaseNames.has(include.name)) {
      errors.push(`${prefix}[${index}].name: unknown test case "${include.name}".`);
    }
    if (include.sections !== undefined) {
      if (!Array.isArray(include.sections)) {
        errors.push(`${prefix}[${index}].sections: expected an array.`);
      } else {
        for (const [sectionIndex, section] of include.sections.entries()) {
          if (!includeSections.has(section)) {
            errors.push(`${prefix}[${index}].sections[${sectionIndex}]: invalid section "${section}".`);
          }
        }
      }
    }
  }
}

export function formatValidationFailure(filePath, errors) {
  return [`Validation failed for ${path.relative(process.cwd(), filePath)}:`, ...errors.map((error) => `- ${error}`)].join('\n');
}
