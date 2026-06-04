import { test } from './fixtures/app-fixtures';
import { testData } from './data-driven/config';
import { createRunContext, runConfiguredTestCaseSections, runPrerequisiteTestCases } from './data-driven/runner';
import { getActivePage } from './data-driven/context';

for (const testCase of testData.testCases.filter((item) => item.enabled !== false)) {
  test.describe(testCase.name, () => {
    test.use({ auth: testCase.auth ?? { session: 'authenticated' } });

    test(`validates configured checks for test case: '${testCase.name}'`, async ({ page }, testInfo) => {
      const runContext = createRunContext(page);

      await runPrerequisiteTestCases(runContext, testCase, testInfo, [testCase.name]);

      if (testCase.path || testCase.url) {
        const targetUrl = testCase.url ?? new URL(
          testCase.path ?? '/',
          process.env.APP_URL ?? testCase.baseUrl ?? testData.defaults?.baseUrl,
        ).toString();

        await getActivePage(runContext).goto(targetUrl, {
          waitUntil: 'domcontentloaded',
          timeout: testCase.navigationTimeout ?? testData.defaults?.navigationTimeout ?? 15_000,
        });
      }

      await runConfiguredTestCaseSections(runContext, testCase, testInfo, [testCase.name]);
    });
  });
}
