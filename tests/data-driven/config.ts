import fs from 'node:fs';
import path from 'node:path';
import type {
  IncludeSection,
  NormalizedTestCaseInclude,
  PageCase,
  TestCaseInclude,
  TestData,
  ValidationRef,
  ValidationTemplateRef,
} from './models';

const dataPath = path.resolve(__dirname, '../../test-data/symplr_pages.json');
const rawTestData = loadConfigWithImports(dataPath);
export const testData = resolveReusableValidations(resolveTokens(rawTestData)) as TestData;
export const testCaseLookup = buildTestCaseLookup(testData.testCases);

export const defaultIncludeSections: IncludeSection[] = [
  'beforeValidateActions',
  'pageAssertions',
  'validations',
  'pageActions',
  'includeTestCases',
];

export function normalizeTestCaseInclude(include: TestCaseInclude): NormalizedTestCaseInclude {
  if (typeof include === 'string') {
    return { name: include, sections: defaultIncludeSections };
  }

  if (!include.name) {
    throw new Error('includeTestCases item requires "name".');
  }

  return {
    name: include.name,
    sections: include.sections && include.sections.length > 0 ? include.sections : defaultIncludeSections,
  };
}

export function hasIncludedSection(sections: IncludeSection[], section: IncludeSection): boolean {
  return sections.includes(section);
}

function buildTestCaseLookup(testCases: PageCase[]): Map<string, PageCase> {
  const lookup = new Map<string, PageCase>();

  for (const testCase of testCases) {
    if (lookup.has(testCase.name)) {
      throw new Error(`Duplicate test case name found in test data: ${testCase.name}`);
    }
    lookup.set(testCase.name, testCase);
  }

  return lookup;
}

function loadConfigWithImports(entryPath: string): unknown {
  return loadConfigFile(path.resolve(entryPath), new Set<string>());
}

function loadConfigFile(absolutePath: string, stack: Set<string>): Record<string, unknown> {
  const normalizedPath = path.resolve(absolutePath);
  if (stack.has(normalizedPath)) {
    throw new Error(`Circular test-data import detected: ${normalizedPath}`);
  }

  stack.add(normalizedPath);

  const parsed = JSON.parse(fs.readFileSync(normalizedPath, 'utf-8').replace(/^\uFEFF/, '')) as unknown;

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Test data file must contain a JSON object: ${normalizedPath}`);
  }

  const config = parsed as Record<string, unknown>;
  let merged: Record<string, unknown> = {};

  if (config.imports !== undefined) {
    if (!Array.isArray(config.imports)) {
      throw new Error(`Property "imports" must be an array in ${normalizedPath}`);
    }

    for (const importPath of config.imports) {
      if (typeof importPath !== 'string') {
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

function mergeConfigObjects(base: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const result = cloneConfig(base) as Record<string, unknown>;

  for (const [key, incomingValue] of Object.entries(incoming)) {
    if (key === 'imports') continue;

    if (key === 'testCases' || key === 'pages') {
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

function deepMergeObjects(base: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
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
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneConfig<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

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
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, resolveTokenPlaceholders(item, tokens)]),
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
    testCases: resolvedTestCases,
  };
}

function resolvePageCaseReusableItems(
  page: unknown,
  validationSets: Record<string, unknown>,
  validationTemplates: Record<string, unknown>,
): unknown {
  if (page === null || typeof page !== 'object') return page;

  const pageObj = { ...(page as Record<string, unknown>) };

  if (Array.isArray(pageObj.beforeValidateActions)) {
    pageObj.beforeValidateActions = pageObj.beforeValidateActions.map((action) =>
      resolveActionReusableItems(action, validationSets, validationTemplates),
    );
  }

  if (Array.isArray(pageObj.pageActions)) {
    pageObj.pageActions = pageObj.pageActions.map((action) =>
      resolveActionReusableItems(action, validationSets, validationTemplates),
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
  validationTemplates: Record<string, unknown>,
): unknown {
  if (action === null || typeof action !== 'object') return action;

  const actionObj = { ...(action as Record<string, unknown>) };

  if (Array.isArray(actionObj.validations)) {
    actionObj.validations = resolveValidationItems(actionObj.validations, validationSets, validationTemplates);
  }

  if (Array.isArray(actionObj.postValidations)) {
    actionObj.postValidations = resolveValidationItems(actionObj.postValidations, validationSets, validationTemplates);
  }

  if (Array.isArray(actionObj.pageActions)) {
    actionObj.pageActions = actionObj.pageActions.map((nestedAction) =>
      resolveActionReusableItems(nestedAction, validationSets, validationTemplates),
    );
  }

  if (Array.isArray(actionObj.thenActions)) {
    actionObj.thenActions = actionObj.thenActions.map((nestedAction) =>
      resolveActionReusableItems(nestedAction, validationSets, validationTemplates),
    );
  }

  if (Array.isArray(actionObj.elseActions)) {
    actionObj.elseActions = actionObj.elseActions.map((nestedAction) =>
      resolveActionReusableItems(nestedAction, validationSets, validationTemplates),
    );
  }

  if (Array.isArray(actionObj.thenValidations)) {
    actionObj.thenValidations = resolveValidationItems(actionObj.thenValidations, validationSets, validationTemplates);
  }

  if (Array.isArray(actionObj.elseValidations)) {
    actionObj.elseValidations = resolveValidationItems(actionObj.elseValidations, validationSets, validationTemplates);
  }

  return actionObj;
}

function resolveValidationItems(
  validations: unknown[],
  validationSets: Record<string, unknown>,
  validationTemplates: Record<string, unknown>,
): unknown[] {
  return validations.flatMap((item) => resolveValidationItem(item, validationSets, validationTemplates));
}

function resolveValidationItem(
  item: unknown,
  validationSets: Record<string, unknown>,
  validationTemplates: Record<string, unknown>,
): unknown[] {
  if (isValidationRef(item)) {
    return resolveValidationRef(item.$ref, validationSets).flatMap((resolvedItem) =>
      resolveValidationItem(resolvedItem, validationSets, validationTemplates),
    );
  }

  if (isValidationTemplateRef(item)) {
    return resolveValidationTemplate(item.$template, item.params ?? {}, validationTemplates).flatMap((resolvedItem) =>
      resolveValidationItem(resolvedItem, validationSets, validationTemplates),
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
  validationTemplates: Record<string, unknown>,
): unknown {
  if (validation === null || typeof validation !== 'object') return validation;

  const validationObj = { ...(validation as Record<string, unknown>) };

  if (Array.isArray(validationObj.actions)) {
    validationObj.actions = validationObj.actions.map((action) =>
      resolveActionReusableItems(action, validationSets, validationTemplates),
    );
  }

  return validationObj;
}

function isValidationRef(value: unknown): value is ValidationRef {
  return typeof value === 'object' && value !== null && '$ref' in value && typeof (value as Record<string, unknown>).$ref === 'string';
}

function isValidationTemplateRef(value: unknown): value is ValidationTemplateRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$template' in value &&
    typeof (value as Record<string, unknown>).$template === 'string'
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
  validationTemplates: Record<string, unknown>,
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

  if (definition !== null && typeof definition === 'object' && !Array.isArray(definition) && 'template' in definition) {
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
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, resolveParamPlaceholders(item, params)]),
    );
  }

  return value;
}

function getTemplateParam(params: Record<string, unknown>, key: string): unknown {
  const pathParts = key.split('.');
  let current: unknown = params;

  for (const part of pathParts) {
    if (current === null || typeof current !== 'object' || !(part in current)) {
      throw new Error(`Template parameter not found: ${key}. Please check if the given template parameter '${key}' is correct.`);
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
