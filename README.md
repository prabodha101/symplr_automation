# Symplr config-driven Playwright tests

This project runs Symplr UI checks from JSON data instead of creating one Playwright test file per page.

The main test data file is:

```text
test-data/symplr_pages.json
```

The generic runner is:

```text
tests/data-driven.spec.ts
```

## Current approach

The project supports two reusable concepts:

1. `validationSets` for reusing a whole group of validations exactly as-is.
2. `validationTemplates` for reusing a validation pattern with different parameters.

The latest change makes templates locator-agnostic. A template can now receive the whole locator object as a parameter, so the same validation can work with elements found by `id`, role, text, CSS, XPath, or a fully custom Playwright locator.

## Recommended pattern for reusable validations

Define the validation once:

```json
"validationTemplates": {
  "visibleElement": {
    "defaults": {
      "timeout": 5000
    },
    "template": {
      "name": "Validate '${param.name}' is visible",
      "locator": "${param.locator}",
      "assertions": [
        {
          "type": "visible",
          "timeout": "${param.timeout}"
        }
      ]
    }
  }
}
```

Then reuse it anywhere in a page, validation set, or action-level validation:

```json
{
  "$template": "visibleElement",
  "params": {
    "name": "Build apps heading",
    "locator": {
      "strategy": "id",
      "id": "build-apps-heading"
    }
  }
}
```

## Examples with different locator types

### By id

```json
{
  "$template": "visibleTextElement",
  "params": {
    "name": "Build apps heading",
    "locator": {
      "strategy": "id",
      "id": "build-apps-heading"
    },
    "text": "Build apps with a blueprint."
  }
}
```

### By role

```json
{
  "$template": "visibleElement",
  "params": {
    "name": "Import from Figma button",
    "locator": {
      "strategy": "role",
      "role": "button",
      "name": "Import from Figma",
      "exact": true
    }
  }
}
```

### By text

```json
{
  "$template": "visibleElement",
  "params": {
    "name": "Create from Template label",
    "locator": {
      "strategy": "text",
      "text": "Create from Template",
      "exact": true
    }
  }
}
```

### By CSS selector

```json
{
  "$template": "visibleElement",
  "params": {
    "name": "Screens list item",
    "locator": {
      "strategy": "css",
      "selector": "div.Screens-list-item.MuiBox-root",
      "first": true
    }
  }
}
```

### By XPath

```json
{
  "$template": "visibleElement",
  "params": {
    "name": "First screen label",
    "locator": {
      "strategy": "xpath",
      "selector": "//span[normalize-space()='First Screen']"
    }
  }
}
```

### By custom Playwright locator

Use this when an element has no stable `id` and the selector is easier to express directly as a Playwright locator string.

```json
{
  "$template": "visibleElement",
  "params": {
    "name": "First page preview screen",
    "locator": {
      "strategy": "custom",
      "locator": "#PreviewScreen-main"
    }
  }
}
```

You can also use Playwright selector engines:

```json
{
  "$template": "visibleElement",
  "params": {
    "name": "Blueprint label",
    "locator": {
      "strategy": "custom",
      "locator": "p:has-text(\"Blueprint\")"
    }
  }
}
```

For XPath through the custom strategy:

```json
{
  "$template": "visibleElement",
  "params": {
    "name": "Settings tab",
    "locator": {
      "strategy": "custom",
      "engine": "xpath",
      "locator": "//button[normalize-space()='Settings']"
    }
  }
}
```

## Built-in generic templates

These templates are already defined in `test-data/symplr_pages.json`:

| Template | Purpose | Key params |
|---|---|---|
| `visibleElement` | Check any element is visible using any locator strategy | `name`, `locator`, optional `timeout` |
| `visibleTextElement` | Check any element is visible and has exact text | `name`, `locator`, `text`, optional `timeout` |
| `elementState` | Check a locator-level state such as `visible`, `disabled`, `checked`, or `unchecked` | `name`, `locator`, `assertion`, optional `timeout` |
| `valueEqualsElement` | Check an input-like element is visible and has a specific value | `name`, `locator`, `value`, optional `timeout` |
| `visibleById` | Legacy convenience template for visible-by-id checks | `id`, `name` |
| `visibleTextById` | Legacy convenience template for exact text by id | `id`, `text` |
| `visibleHeadingByText` | Convenience template for a heading located by role/name | `text`, `level` |
| `visibleExactText` | Convenience template for exact visible text | `text` |
| `elementByRole` | Convenience template for role-based elements such as buttons | `role`, `name`, `assertion` |
| `checkboxStateById` | Convenience template for checkbox state by id | `id`, `name`, `assertion` |

## Locator strategies supported by the runner

| Strategy | Required field | Example |
|---|---|---|
| `id` | `id` | `{ "strategy": "id", "id": "email" }` |
| `role` | `role` | `{ "strategy": "role", "role": "button", "name": "Save" }` |
| `text` | `text` | `{ "strategy": "text", "text": "Save", "exact": true }` |
| `label` | `text` | `{ "strategy": "label", "text": "Email" }` |
| `placeholder` | `text` | `{ "strategy": "placeholder", "text": "Enter email" }` |
| `altText` | `text` | `{ "strategy": "altText", "text": "Logo" }` |
| `title` | `text` | `{ "strategy": "title", "text": "Close" }` |
| `testId` | `testId` | `{ "strategy": "testId", "testId": "submit" }` |
| `css` | `selector` | `{ "strategy": "css", "selector": ".save-button" }` |
| `xpath` | `selector` | `{ "strategy": "xpath", "selector": "//button[text()='Save']" }` |
| `locator` | `locator` | `{ "strategy": "locator", "locator": "p:has-text(\"Blueprint\")" }` |
| `custom` | `locator`, `selector`, or `value` | `{ "strategy": "custom", "locator": "#PreviewScreen-main" }` |

`first`, `last`, and `nth` can be added to most locator objects when the selector returns more than one element.

## Template parameters

Templates support both simple and object parameters:

```json
"locator": "${param.locator}"
```

The placeholder above inserts the full locator object at runtime.

Nested parameters are also supported:

```json
"name": "Validate '${param.element.name}' is visible"
```

with params like:

```json
{
  "element": {
    "name": "Save button"
  }
}
```

## Existing `validationSets` still work

```json
{
  "$ref": "blueprintScreen"
}
```

Use `validationSets` when you want to reuse a group exactly as-is. Use `validationTemplates` when the locator, expected text, value, or assertion changes per page.


## Download actions

For downloads, the runner now supports two config-driven options.

### Option 1: simple Symplr-specific action

Use this when you want to reuse the existing `ProjectStoryBoardPage.downloadAppDefinition()` page-object method. This keeps the JSON very small and avoids putting a fragile button locator in the data file.

```json
{
  "type": "downloadAppDefinition",
  "name": "Download and validate appDefinition JSON file",
  "expectedExtension": ".json",
  "validateJson": true,
  "minBytes": 1
}
```

This is the recommended option for the `Download and validate appDefinition` test case.

### Option 2: generic download action

Use this when another page has a normal clickable element that triggers a browser download and you want to keep it generic.

```json
{
  "type": "download",
  "name": "Download report JSON file",
  "locator": {
    "strategy": "locator",
    "locator": "button[aria-label='Download report']"
  },
  "expectedExtension": ".json",
  "validateJson": true,
  "minBytes": 1
}
```

Supported optional download checks:

| Field | Purpose |
|---|---|
| `expectedExtension` | Checks the downloaded file extension, for example `.json` |
| `expectedFileNameContains` | Checks that the downloaded file name contains a value |
| `validateJson` | Parses the downloaded file and fails if it is not valid JSON |
| `minBytes` | Checks that the file is not empty or below a minimum size |
| `saveAs` | Saves the downloaded artifact using a custom file name in the Playwright test output folder |
| `timeout` | Timeout for the generic `download` action |

## Setup

Create your local environment file:

```bash
cp .env.example .env
```

Fill in the values required by your app and authentication flow.

Then install dependencies and Playwright browsers:

```bash
npm install
npm run install:browsers
```

## Validate test data

```bash
npm run validate:data
```

This checks `test-data/symplr_pages.json`, expands tokens/templates/validation sets, and validates the final resolved configuration.

## Run tests

```bash
npm test
```

Other useful commands:

```bash
npm run test:headed
npm run test:ui
npm run report
```

## Files changed

```text
tests/data-driven.spec.ts
schemas/testCases.schema.json
scripts/validate-test-data.mjs
test-data/symplr_pages.json
README.md
```
