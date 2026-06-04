import { expect, type Locator, type Page } from '@playwright/test';
import { containsPattern } from './locator-utils';
import { testData } from './config';
import type { AssertionConfig, PageCase, ValidationConfig } from './models';

export async function runPageAssertion(page: Page, pageCase: PageCase, assertion: AssertionConfig): Promise<void> {
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

export async function runLocatorAssertion(
  locator: Locator,
  pageCase: PageCase,
  validation: ValidationConfig,
  assertion: AssertionConfig,
): Promise<void> {
  const assertionExpect = shouldUseSoftAssertion(pageCase, assertion) ? expect.soft : expect;
  const message = `[${pageCase.name}] ${validation.name} -> ${assertion.type}`;
  const timeout = assertion.timeout ?? 5_000;

  switch (assertion.type) {
    case 'visible':
      await assertionExpect(locator, message).toBeVisible({ timeout });
      return;
    case 'hidden':
      await assertionExpect(locator, message).toBeHidden({ timeout });
      return;
    case 'attached':
      await assertionExpect(locator, message).toBeAttached({ timeout });
      return;
    case 'enabled':
      await assertionExpect(locator, message).toBeEnabled({ timeout });
      return;
    case 'disabled':
      await assertionExpect(locator, message).toBeDisabled({ timeout });
      return;
    case 'editable':
      await assertionExpect(locator, message).toBeEditable({ timeout });
      return;
    case 'checked':
      await assertionExpect(locator, message).toBeChecked({ timeout });
      return;
    case 'unchecked':
      await assertionExpect(locator, message).not.toBeChecked({ timeout });
      return;
    case 'empty':
      await assertionExpect(locator, message).toBeEmpty({ timeout });
      return;
    case 'textEquals': {
      const expected = expectedValue(assertion);
      await assertionExpect(locator, message).toHaveText(expected as string | RegExp, { timeout });
      return;
    }
    case 'textContains': {
      const expected = expectedValue(assertion);
      await assertionExpect(locator, message).toContainText(expected as string | RegExp, { timeout });
      return;
    }
    case 'valueEquals': {
      const expected = expectedValue(assertion);
      await assertionExpect(locator, message).toHaveValue(String(expected), { timeout });
      return;
    }
    case 'attributeEquals': {
      const expected = expectedValue(assertion);
      if (!assertion.attributeName) throw new Error('attributeEquals requires "attributeName".');
      await assertionExpect(locator, message).toHaveAttribute(assertion.attributeName, String(expected), { timeout });
      return;
    }
    case 'countEquals': {
      const expected = expectedValue(assertion);
      await assertionExpect(locator, message).toHaveCount(Number(expected), { timeout });
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
      await assertionExpect(locator, message).toContainClass(String(expected), { timeout });
      return;
    }
    case 'cssEquals': {
      const expected = expectedValue(assertion);
      if (!assertion.cssName) throw new Error('cssEquals requires "cssName".');
      await assertionExpect(locator, message).toHaveCSS(assertion.cssName, String(expected), { timeout });
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
