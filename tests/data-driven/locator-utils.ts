import type { Locator } from '../fixtures/app-fixtures';
import type { LocatorConfig, LocatorRoot } from './models';

export function buildLocator(page: import('../fixtures/app-fixtures').Page, locatorConfig: LocatorConfig): Locator {
  const frameSelector = locatorConfig.frameLocator?.trim();
  const root: LocatorRoot = frameSelector ? page.frameLocator(frameSelector) : page;
  return buildLocatorFromRoot(root, locatorConfig);
}

export function buildLocatorFromRoot(root: LocatorRoot, locatorConfig: LocatorConfig): Locator {
  let locator: Locator;

  switch (locatorConfig.strategy) {
    case 'id': {
      if (!locatorConfig.id) throw new Error('id locator requires "id".');
      locator = root.locator(`[id="${escapeCssAttributeValue(locatorConfig.id)}"]`);
      break;
    }
    case 'role': {
      if (!locatorConfig.role) throw new Error('role locator requires "role".');

      if (locatorConfig.role.toLowerCase() === 'input') {
        const inputName = locatorConfig.name ?? locatorConfig.text;
        if (inputName) {
          const escapedInputName = escapeCssAttributeValue(inputName);
          locator = root.locator(
            `input[name="${escapedInputName}"], input[id="${escapedInputName}"], input[aria-label="${escapedInputName}"], input[placeholder="${escapedInputName}"], textarea[name="${escapedInputName}"], textarea[id="${escapedInputName}"], textarea[aria-label="${escapedInputName}"], textarea[placeholder="${escapedInputName}"]`,
          );
        } else {
          locator = root.locator('input, textarea');
        }
        break;
      }

      locator = root.getByRole(locatorConfig.role as never, {
        name: locatorConfig.name,
        exact: locatorConfig.exact,
        level: locatorConfig.level,
      } as never);
      break;
    }
    case 'text': {
      if (!locatorConfig.text) throw new Error('text locator requires "text".');
      if (locatorConfig.role) {
        locator = root.getByRole(locatorConfig.role as never, {
          name: locatorConfig.name ?? locatorConfig.text,
          exact: locatorConfig.exact,
          level: locatorConfig.level,
        } as never);
      } else {
        locator = root.getByText(locatorConfig.text, { exact: locatorConfig.exact });
      }
      break;
    }
    case 'label': {
      if (!locatorConfig.text) throw new Error('label locator requires "text".');
      locator = root.getByLabel(locatorConfig.text, { exact: locatorConfig.exact });
      break;
    }
    case 'img': {
      const imgName = locatorConfig.name ?? locatorConfig.text;
      if (!imgName) throw new Error('img locator requires "name" or "text".');
      console.log(`  >> Waiting for img locator with name: ${imgName}`);
      locator = root.getByRole('img', { name: imgName, exact: locatorConfig.exact });
      break;
    }
    case 'placeholder': {
      if (!locatorConfig.text) throw new Error('placeholder locator requires "text".');
      locator = root.getByPlaceholder(locatorConfig.text, { exact: locatorConfig.exact });
      break;
    }
    case 'altText': {
      if (!locatorConfig.text) throw new Error('altText locator requires "text".');
      locator = root.getByAltText(locatorConfig.text, { exact: locatorConfig.exact });
      break;
    }
    case 'title': {
      if (!locatorConfig.text) throw new Error('title locator requires "text".');
      locator = root.getByTitle(locatorConfig.text, { exact: locatorConfig.exact });
      break;
    }
    case 'testId': {
      if (!locatorConfig.testId) throw new Error('testId locator requires "testId".');
      locator = root.getByTestId(locatorConfig.testId);
      break;
    }
    case 'css': {
      if (!locatorConfig.selector) throw new Error('css locator requires "selector".');
      locator = root.locator(locatorConfig.selector, { hasText: locatorConfig.hasText });
      break;
    }
    case 'xpath': {
      if (!locatorConfig.selector) throw new Error('xpath locator requires "selector".');
      locator = root.locator(`xpath=${locatorConfig.selector}`);
      break;
    }
    case 'locator': {
      if (!locatorConfig.locator) throw new Error('locator strategy requires "locator".');
      locator = root.locator(locatorConfig.locator);
      break;
    }
    case 'custom': {
      const customLocator = locatorConfig.locator ?? locatorConfig.selector ?? locatorConfig.value;
      if (!customLocator) {
        throw new Error('custom locator strategy requires "locator", "selector", or "value".');
      }
      const selector = locatorConfig.engine === 'xpath' && !customLocator.startsWith('xpath=')
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

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsPattern(value: string): RegExp {
  return new RegExp(escapeRegExp(value));
}

export function escapeCssAttributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
