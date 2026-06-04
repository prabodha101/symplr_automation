#!/usr/bin/env node
import path from 'node:path';
import { loadConfigWithImports, resolveReusableValidations, resolveTokens } from '../shared/test-data-loader.cjs';
import { formatValidationFailure, validateTestData } from './test-data/validator-helpers.mjs';

const filePath = process.argv[2] ?? 'test-data/symplr_pages.json';
const absolutePath = path.resolve(process.cwd(), filePath);
const rawData = loadConfigWithImports(absolutePath);

let data = rawData;
let errors = [];

try {
  data = resolveReusableValidations(resolveTokens(rawData));
} catch (error) {
  errors.push(error instanceof Error ? error.message : String(error));
}

errors = [...errors, ...validateTestData(data)];

if (errors.length > 0) {
  console.error(formatValidationFailure(absolutePath, errors));
  process.exitCode = 1;
} else {
  console.log(`Test-data validation passed for ${path.relative(process.cwd(), absolutePath)}`);
}
