import path from 'node:path';
import sharedConstants from '../../shared/framework-constants.json';
import type {
  IncludeSection,
  NormalizedTestCaseInclude,
  PageCase,
  TestCaseInclude,
  TestData,
} from './models';

const {
  loadConfigWithImports,
  resolveReusableValidations,
  resolveTokens,
} = require('../../shared/test-data-loader.cjs') as {
  loadConfigWithImports: (entryPath: string) => unknown;
  resolveReusableValidations: (value: unknown) => unknown;
  resolveTokens: (value: unknown) => unknown;
};

const dataPath = path.resolve(__dirname, '../../test-data/symplr_pages.json');
const rawTestData = loadConfigWithImports(dataPath);
export const testData = resolveReusableValidations(resolveTokens(rawTestData)) as TestData;
export const testCaseLookup = buildTestCaseLookup(testData.testCases);

export const defaultIncludeSections = sharedConstants.includeSections as IncludeSection[];

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
