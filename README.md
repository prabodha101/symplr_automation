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

## Config-driven download-code email validation

The project also supports a named action for the workflow where Symplr sends a code download link by email.

Use this in `test-data/symplr_pages.json`:

```json
{
  "type": "downloadCodeFromEmail",
  "name": "Click Download and validate code ZIP from email",
  "expectedEmailSubject": "Download Code",
  "timeout": 180000,
  "pollIntervalMs": 5000,
  "expectedExtension": ".zip",
  "minBytes": 1
}
```

What it does internally:

1. Calls `ProjectStoryBoardPage.downloadCode()` to open Developer Tools and click the `Download` button.
2. Polls Gmail for a matching email sent after the button click.
3. Checks the email subject contains `expectedEmailSubject`.
4. Extracts the ZIP link from the email body.
5. Downloads the ZIP file into the Playwright test output folder.
6. Validates that the file exists, is not empty, has a `.zip` extension, and looks like a ZIP archive.
7. Attaches the ZIP to the Playwright report as `downloaded-code-zip`.

By default, the action reads these environment variables:

```env
GOOGLE_EMAIL=your-recipient-email@example.com
EMAIL_SENDER=notification@101digital.io
GMAIL_CREDENTIALS_PATH=secrets/credentials.json
GMAIL_TOKEN_PATH=secrets/token.json
```

You can override the email values in JSON only when needed:

```json
{
  "type": "downloadCodeFromEmail",
  "expectedEmailSubject": "Download Code",
  "emailTo": "qa@example.com",
  "emailFrom": "notification@101digital.io"
}
```

Keep the JSON simple for app-specific workflows. Prefer named actions such as `downloadCodeFromEmail` when a flow needs special logic like Gmail polling, OAuth, file download, or ZIP validation.

## Gmail token refresh and reauthorization

The Gmail email-download test uses OAuth credentials from:

```env
GMAIL_CREDENTIALS_PATH=secrets/credentials.json
GMAIL_TOKEN_PATH=secrets/token.json
```

The test now refreshes the Gmail **access token** automatically when:

- `secrets/token.json` has an expired `access_token`, or
- Gmail returns HTTP 401 because the access token is stale.

However, if Google says the token is `expired or revoked`, that usually means the **refresh token** in `secrets/token.json` is no longer valid. That cannot be fixed silently by the test because Google requires the user to authorize the app again.

When that happens, run:

```bash
npm run gmail:auth
```

Then:

1. Open the printed Google authorization URL.
2. Sign in using the Gmail account configured as `GOOGLE_EMAIL`.
3. Approve the Gmail access request.
4. The script recreates `secrets/token.json`.
5. Re-run the Playwright test.

The script requests this scope by default:

```text
https://www.googleapis.com/auth/gmail.readonly
```

You can override it when needed:

```env
GMAIL_SCOPES=https://www.googleapis.com/auth/gmail.readonly
```

The default local callback is:

```env
GMAIL_REDIRECT_URI=http://127.0.0.1:53682/oauth2callback
```

For the simplest setup, create a **Desktop app** OAuth client in Google Cloud and download it as `secrets/credentials.json`. Keep both `credentials.json` and `token.json` out of Git.

If you still get refresh-token expiry frequently, check whether your Google OAuth consent screen is set to External + Testing. In that mode, refresh tokens can expire sooner than expected; for stable test automation, move the OAuth app to Production or regenerate the token before scheduled runs.

## Config-driven Build & Run page validation

The runner supports app-specific actions for the Build & Run workflow while keeping `symplr_pages.json` small.

Recommended pattern:

```json
{
  "type": "buildAndRunApp",
  "name": "Click Build and switch to the app run page"
}
```

This calls `ProjectStoryBoardPage.buildAndRunApp()`, waits for the popup/new page, and makes that new page the active page for the rest of the configured actions and validations in the test case.

Available Build & Run named actions:

| Action | What it does |
|---|---|
| `buildAndRunApp` | Calls `ProjectStoryBoardPage.buildAndRunApp()`, captures the popup, waits for build completion, and switches the active config page to the new run page. |
| `waitForBuildComplete` | Calls `AppRunPage.waitForBuildComplete()` on the run page. |
| `openRunOnDeviceModal` | Calls `AppRunPage.openRunOnDeviceModal()` on the run page. |
| `waitForQrCodeGenerated` | Calls `AppRunPage.waitForQrCodeGenerated()` on the run page. |
| `switchToMainPage` | Switches generic locators/actions back to the original storyboard page. |
| `switchToRunPage` | Switches generic locators/actions back to the Build & Run popup page. |

Example test case:

```json
{
  "name": "Build app and validate Run on Device QR code",
  "enabled": true,
  "scenario": "existingApp",
  "scenarioConfig": {
    "type": "existingApp",
    "appName": "${tokens.appName}"
  },
  "beforeValidateActions": [
    {
      "type": "click",
      "locator": {
        "strategy": "locator",
        "locator": "[data-testid^=\"nav-item-\"][aria-label=\"Blueprint\"]"
      }
    }
  ],
  "validations": [
    {
      "$ref": "appDefinitionValidation"
    }
  ],
  "pageActions": [
    {
      "type": "buildAndRunApp",
      "name": "Click Build and switch to the app run page"
    },
    {
      "type": "waitForBuildComplete",
      "name": "Wait until the app run page is ready"
    },
    {
      "type": "openRunOnDeviceModal",
      "name": "Open the Run App on Your Device modal"
    },
    {
      "type": "waitForQrCodeGenerated",
      "name": "Validate the Connect Expo QR code is generated"
    }
  ]
}
```

After `buildAndRunApp`, normal config-driven validations and generic actions run against the new run page. For example, if a new label or button is added to the run page, add a normal validation or action after `buildAndRunApp`:

```json
{
  "$template": "textIsVisible",
  "params": {
    "text": "New Run Page Label",
    "timeout": 30000
  }
}
```

or:

```json
{
  "type": "click",
  "name": "Click a new run page button",
  "locator": {
    "strategy": "role",
    "role": "button",
    "name": "New Button",
    "exact": true
  },
  "validations": [
    {
      "$template": "textIsVisible",
      "params": {
        "text": "Button clicked successfully"
      }
    }
  ]
}
```

Use named actions for fragile or app-specific workflows. Use normal locators, templates, and validation sets for ordinary labels, buttons, text boxes, check boxes, and page content on the run page.
