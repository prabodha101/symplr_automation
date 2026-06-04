const fs = require('node:fs');
const path = require('node:path');

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneConfig(value) {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
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

function loadConfigWithImports(entryPath) {
  return loadConfigFile(path.resolve(entryPath), new Set());
}

function loadConfigFile(filePath, stack) {
  const normalizedPath = path.resolve(filePath);
  if (stack.has(normalizedPath)) {
    throw new Error(`Circular test-data import detected: ${normalizedPath}`);
  }
  stack.add(normalizedPath);
  const parsed = JSON.parse(fs.readFileSync(normalizedPath, 'utf-8').replace(/^\uFEFF/, ''));
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
  const currentConfig = { ...parsed };
  delete currentConfig.imports;
  merged = mergeConfigObjects(merged, currentConfig);
  stack.delete(normalizedPath);
  return merged;
}

function resolveTokenPlaceholders(value, tokens) {
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
      Object.entries(value).map(([key, item]) => [key, resolveTokenPlaceholders(item, tokens)]),
    );
  }
  return value;
}

function resolveTokens(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const root = value;
  const tokens = Object.entries(root.tokens ?? {}).reduce((acc, [key, tokenValue]) => {
    if (typeof tokenValue === 'string') acc[key] = tokenValue;
    return acc;
  }, {});
  return resolveTokenPlaceholders(value, tokens);
}

function isValidationRef(value) {
  return typeof value === 'object' && value !== null && '$ref' in value && typeof value.$ref === 'string';
}

function isValidationTemplateRef(value) {
  return typeof value === 'object' && value !== null && '$template' in value && typeof value.$template === 'string';
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveValidationRef(ref, validationSets) {
  const key = ref.startsWith('validationSets.') ? ref.slice('validationSets.'.length) : ref;
  const setValue = validationSets[key];
  if (setValue === undefined) throw new Error(`Validation set not found: ${ref}`);
  return Array.isArray(setValue) ? deepClone(setValue) : [deepClone(setValue)];
}

function getTemplateParam(params, key) {
  const pathParts = key.split('.');
  let current = params;
  for (const part of pathParts) {
    if (current === null || typeof current !== 'object' || !(part in current)) {
      throw new Error(`Template parameter not found: ${key}. Please check if the given template parameter '${key}' is correct.`);
    }
    current = current[part];
  }
  return current;
}

function resolveParamPlaceholders(value, params) {
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
      Object.entries(value).map(([key, item]) => [key, resolveParamPlaceholders(item, params)]),
    );
  }
  return value;
}

function resolveValidationTemplate(templateName, params, validationTemplates) {
  const key = templateName.startsWith('validationTemplates.')
    ? templateName.slice('validationTemplates.'.length)
    : templateName;
  const definition = validationTemplates[key];
  if (definition === undefined) throw new Error(`Validation template not found: ${templateName}`);
  let templateValue = definition;
  let defaults = {};
  if (definition !== null && typeof definition === 'object' && !Array.isArray(definition) && 'template' in definition) {
    templateValue = definition.template;
    defaults = definition.defaults ?? {};
  }
  const mergedParams = { ...defaults, ...params };
  const resolvedTemplate = resolveParamPlaceholders(deepClone(templateValue), mergedParams);
  return Array.isArray(resolvedTemplate) ? resolvedTemplate : [resolvedTemplate];
}

function resolveValidationNestedReusableItems(validation, validationSets, validationTemplates) {
  if (validation === null || typeof validation !== 'object') return validation;
  const validationObj = { ...validation };
  if (Array.isArray(validationObj.actions)) {
    validationObj.actions = validationObj.actions.map((action) => resolveActionReusableItems(action, validationSets, validationTemplates));
  }
  return validationObj;
}

function resolveValidationItem(item, validationSets, validationTemplates) {
  if (isValidationRef(item)) {
    return resolveValidationRef(item.$ref, validationSets).flatMap((resolvedItem) => resolveValidationItem(resolvedItem, validationSets, validationTemplates));
  }
  if (isValidationTemplateRef(item)) {
    return resolveValidationTemplate(item.$template, item.params ?? {}, validationTemplates).flatMap((resolvedItem) => resolveValidationItem(resolvedItem, validationSets, validationTemplates));
  }
  if (item !== null && typeof item === 'object') {
    return [resolveValidationNestedReusableItems(item, validationSets, validationTemplates)];
  }
  return [item];
}

function resolveValidationItems(validations, validationSets, validationTemplates) {
  return validations.flatMap((item) => resolveValidationItem(item, validationSets, validationTemplates));
}

function resolveActionReusableItems(action, validationSets, validationTemplates) {
  if (action === null || typeof action !== 'object') return action;
  const actionObj = { ...action };
  if (Array.isArray(actionObj.validations)) {
    actionObj.validations = resolveValidationItems(actionObj.validations, validationSets, validationTemplates);
  }
  if (Array.isArray(actionObj.postValidations)) {
    actionObj.postValidations = resolveValidationItems(actionObj.postValidations, validationSets, validationTemplates);
  }
  if (Array.isArray(actionObj.pageActions)) {
    actionObj.pageActions = actionObj.pageActions.map((nestedAction) => resolveActionReusableItems(nestedAction, validationSets, validationTemplates));
  }
  if (Array.isArray(actionObj.thenActions)) {
    actionObj.thenActions = actionObj.thenActions.map((nestedAction) => resolveActionReusableItems(nestedAction, validationSets, validationTemplates));
  }
  if (Array.isArray(actionObj.elseActions)) {
    actionObj.elseActions = actionObj.elseActions.map((nestedAction) => resolveActionReusableItems(nestedAction, validationSets, validationTemplates));
  }
  if (Array.isArray(actionObj.thenValidations)) {
    actionObj.thenValidations = resolveValidationItems(actionObj.thenValidations, validationSets, validationTemplates);
  }
  if (Array.isArray(actionObj.elseValidations)) {
    actionObj.elseValidations = resolveValidationItems(actionObj.elseValidations, validationSets, validationTemplates);
  }
  return actionObj;
}

function resolvePageCaseReusableItems(page, validationSets, validationTemplates) {
  if (page === null || typeof page !== 'object') return page;
  const pageObj = { ...page };
  if (Array.isArray(pageObj.beforeValidateActions)) {
    pageObj.beforeValidateActions = pageObj.beforeValidateActions.map((action) => resolveActionReusableItems(action, validationSets, validationTemplates));
  }
  if (Array.isArray(pageObj.pageActions)) {
    pageObj.pageActions = pageObj.pageActions.map((action) => resolveActionReusableItems(action, validationSets, validationTemplates));
  }
  if (Array.isArray(pageObj.validations)) {
    pageObj.validations = resolveValidationItems(pageObj.validations, validationSets, validationTemplates);
  }
  return pageObj;
}

function resolveReusableValidations(value) {
  if (value === null || typeof value !== 'object') return value;
  const root = value;
  const validationSets = root.validationSets ?? {};
  const validationTemplates = root.validationTemplates ?? {};
  const cases = Array.isArray(root.testCases) ? root.testCases : root.pages;
  if (!Array.isArray(cases)) return value;
  const resolvedTestCases = cases.map((page) => resolvePageCaseReusableItems(page, validationSets, validationTemplates));
  return { ...root, testCases: resolvedTestCases };
}

module.exports = {
  cloneConfig,
  deepMergeObjects,
  isPlainObject,
  loadConfigWithImports,
  mergeConfigObjects,
  resolveReusableValidations,
  resolveTokens,
};
