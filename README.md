# Symplr config-driven Playwright tests

This project runs Symplr end-to-end UI tests using a JSON-driven test configuration instead of writing a new Playwright spec for every screen or scenario.

The main files are:

```text
test-data/symplr_pages.json   # test cases, validation sets, templates, actions
tests/data-driven.spec.ts     # generic Playwright runner
playwright.config.ts          # Playwright configuration
.env.example                  # local environment variable template
```

## Prerequisites

Install these before running the tests:

- Git
- Node.js 20 or later
- npm, which is installed with Node.js

Check your versions:

```bash
node --version
npm --version
```

If you use `nvm`, a typical setup is:

```bash
nvm install 20
nvm use 20
```

Node.js 22 LTS is also fine.

## Fresh clone setup

From a clean machine or fresh checkout, run:

```bash
git clone <repository-url>
cd <repository-folder>
```

Install project dependencies from `package-lock.json`:

```bash
npm ci
```

If you are actively changing dependencies and do not want to use the lock file strictly, use this instead:

```bash
npm install
```

Install Playwright browser binaries:

```bash
npm run install:browsers
```

On Linux CI machines, you may need Playwright system dependencies too:

```bash
npx playwright install --with-deps
```

## Configure local environment variables

Create your local `.env` file:

```bash
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
Copy-Item .env.example .env
```

Then update `.env` with your local values.

Important variables:

```env
APP_URL=https://101studio.co/
PRE_CREATED_APP_NAME=printmessage

GOOGLE_EMAIL=
GOOGLE_PASSWORD=

EMAIL_SENDER=notification@101digital.io
GMAIL_CREDENTIALS_PATH=secrets/credentials.json
GMAIL_TOKEN_PATH=secrets/token.json
GMAIL_SCOPES=https://www.googleapis.com/auth/gmail.readonly
GMAIL_REDIRECT_URI=http://127.0.0.1:53682/oauth2callback
```

### What these values are used for

| Variable | Purpose |
|---|---|
| `APP_URL` | Symplr application URL used by Playwright. |
| `PRE_CREATED_APP_NAME` | Existing app name used by existing-app scenarios. |
| `GOOGLE_EMAIL` | Login email and Gmail inbox recipient for email-based tests. |
| `GOOGLE_PASSWORD` | Google login password used by the UI login flow. |
| `EMAIL_SENDER` | Sender filter for Gmail polling. Leave blank only if you want to match by recipient and subject. |
| `GMAIL_CREDENTIALS_PATH` | Path to Google OAuth client credentials. |
| `GMAIL_TOKEN_PATH` | Path where the generated Gmail OAuth token is stored. |
| `GMAIL_SCOPES` | Gmail API scope used by email validation. |
| `GMAIL_REDIRECT_URI` | Local OAuth callback used by `npm run gmail:auth`. |

Do not commit `.env`, `secrets/credentials.json`, `secrets/token.json`, or `playwright/.auth/user.json`.

## Gmail setup for email-based tests

Some tests validate email workflows, such as downloading code from an email link. Those tests need Gmail API access.

Email-based tests include flows such as:

```text
Validate that code can be sent by email from Developer Options
End to End scenario test
```

To configure Gmail access:

1. Create or obtain a Google OAuth client credentials file.
2. Save it as:

```text
secrets/credentials.json
```

3. Make sure `.env` points to it:

```env
GMAIL_CREDENTIALS_PATH=secrets/credentials.json
GMAIL_TOKEN_PATH=secrets/token.json
```

4. Generate the Gmail token:

```bash
npm run gmail:auth
```

5. Open the authorization URL printed in the terminal.
6. Sign in with the Gmail account used in `GOOGLE_EMAIL`.
7. Approve access.
8. Confirm that this file was created:

```text
secrets/token.json
```

The test code refreshes the Gmail access token automatically when possible. If Google says the refresh token is expired or revoked, run `npm run gmail:auth` again to generate a new token.

## Validate the JSON test data

Before running browser tests, validate the JSON configuration:

```bash
npm run validate:data
```

This checks:

- `test-data/symplr_pages.json` syntax
- tokens
- validation templates
- validation sets
- included test cases
- locators
- assertions
- configured actions

A successful result looks like:

```text
Test data looks valid: <path>/test-data/symplr_pages.json
```

## Run tests

Run all tests:

```bash
npm test
```

Run tests with the browser visible:

```bash
npm run test:headed
```

Open Playwright UI mode:

```bash
npm run test:ui
```

Open the latest HTML report:

```bash
npm run report
```

## Run a specific test case

Use Playwright's `-g` grep option with the test name from `test-data/symplr_pages.json`.

Examples:

```bash
npx playwright test -g "Storyboard validation: Validate 'Pages' option"
```

```bash
npx playwright test -g "Download app definition file successfully"
```

```bash
npx playwright test -g "End to End scenario test"
```

For headed mode:

```bash
npx playwright test -g "End to End scenario test" --headed
```

## Authentication behavior

The project uses a reusable authenticated browser session.

On the first run, Playwright logs in using:

```env
GOOGLE_EMAIL=
GOOGLE_PASSWORD=
```

After login, it saves the authenticated session to:

```text
playwright/.auth/user.json
```

Future test runs reuse that file if the session is still valid.

If login behaves unexpectedly or the saved session expires, delete the saved auth file and run the test again:

```bash
rm -f playwright/.auth/user.json
```

On Windows PowerShell:

```powershell
Remove-Item playwright/.auth/user.json -ErrorAction SilentlyContinue
```

## Project scripts

These scripts are available in `package.json`:

| Command | What it does |
|---|---|
| `npm test` | Runs all Playwright tests. |
| `npm run test:headed` | Runs tests with the browser visible. |
| `npm run test:ui` | Opens Playwright UI mode. |
| `npm run report` | Opens the HTML test report. |
| `npm run install:browsers` | Installs Playwright browsers. |
| `npm run validate:data` | Validates `test-data/symplr_pages.json`. |
| `npm run gmail:auth` | Generates or refreshes Gmail OAuth token file. |

## How the config-driven tests work

The main test data file is:

```text
test-data/symplr_pages.json
```

The generic runner is:

```text
tests/data-driven.spec.ts
```

The JSON file supports:

- `tokens` for reusable values
- `validationTemplates` for reusable parameterized validation patterns
- `validationSets` for reusable groups of validations
- `testCases` for scenario definitions
- `includeTestCases` for composing an end-to-end test from existing test cases
- `beforeValidateActions` and `pageActions` for configured user interactions

## Validation templates

Use `validationTemplates` when the structure of a validation is the same but the locator, text, value, or assertion changes.

Example usage:

```json
{
  "$template": "textIsVisible",
  "params": {
    "text": "Blueprint",
    "timeout": 30000
  }
}
```

A template can also receive a full locator object:

```json
{
  "$template": "validateElementState",
  "params": {
    "name": "Download button",
    "assertion": "visible",
    "locator": {
      "strategy": "role",
      "role": "button",
      "name": "Download",
      "exact": true
    }
  }
}
```

## Validation sets

Use `validationSets` when you want to reuse a group of validations.

Example:

```json
{
  "$ref": "blueprintScreen"
}
```

This allows multiple tests to share the same configured validations without copying them.

## End-to-end test composition

The project supports `includeTestCases`, which lets one test reuse sections from other test cases.

Example:

```json
{
  "name": "End to End scenario test",
  "enabled": true,
  "scenario": "existingApp",
  "scenarioConfig": {
    "type": "existingApp",
    "appName": "${tokens.appName}"
  },
  "includeTestCases": [
    "Storyboard validation: Validate 'Blueprint' option",
    "Storyboard validation: Validate 'Pages' option",
    "Storyboard validation: Validate 'Variables' option",
    "Storyboard validation: Validate 'Themes' option",
    "Storyboard validation: Validate 'Settings' option",
    "Download app definition file successfully",
    "Validate that code can be sent by email from Developer Options",
    "Validate that code can be pushed to GitHub from Developer Options",
    "Validate that the app can be built and run from the storyboard",
    "Generate a QR code to run the app on a real device"
  ]
}
```

Referenced test cases do not rerun their own `scenario`, `path`, or `url`; only their configured sections are reused.

## Supported named actions

The runner supports normal generic actions such as:

```text
click
fill
check
uncheck
hover
press
selectOption
download
```

It also supports Symplr-specific named actions:

```text
downloadAppDefinition
downloadCodeFromEmail
connectToGitHub
buildAndRunApp
waitForBuildComplete
openRunOnDeviceModal
waitForQrCodeGenerated
switchToMainPage
switchToRunPage
```

Use named actions when a workflow needs page-object logic, popup handling, Gmail polling, ZIP validation, or other app-specific behavior.

## Example: app definition download

```json
{
  "type": "downloadAppDefinition",
  "name": "Download and validate appDefinition JSON file",
  "expectedExtension": ".json",
  "validateJson": true,
  "minBytes": 1
}
```

## Example: email ZIP download validation

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

This action:

1. Clicks the Symplr Download option using the page object.
2. Polls Gmail for the expected email.
3. Extracts the ZIP download link.
4. Downloads the ZIP file.
5. Validates that the file exists and looks like a ZIP archive.
6. Attaches the ZIP to the Playwright report.

## Example: Build and Run page validation

```json
{
  "type": "buildAndRunApp",
  "name": "Click Build and switch to the app run page"
},
{
  "type": "waitForBuildComplete",
  "name": "Wait until the app run page is ready",
  "postValidations": [
    {
      "$template": "elementIsVisibleByLocator",
      "params": {
        "name": "Run app root container after build completes",
        "locator": "#root>div",
        "timeout": 30000
      }
    }
  ]
},
{
  "type": "openRunOnDeviceModal",
  "name": "Open the Run App on Your Device modal"
},
{
  "type": "waitForQrCodeGenerated",
  "name": "Validate the Connect Expo QR code is generated"
}
```

After `buildAndRunApp`, the active Playwright page becomes the newly opened run page. Normal JSON-driven validations and actions then run against that run page until you switch back with `switchToMainPage`.

Use `postValidations` when you want to validate something immediately after a page action finishes. Execution order is:

```text
action -> postValidations / validations -> nested pageActions
```

The older `validations` property on an action still works and runs after the action. `postValidations` is the preferred clearer name for new action-level checks.


## Example: Validate an element inside an iframe

Some app-run content is rendered inside an iframe. For example, the built app preview uses the iframe with id `emulator-iframe`.

To validate an element inside that iframe, add `frameLocator` to the locator configuration. The runner first enters the iframe, then finds the normal locator inside it.

```json
{
  "$template": "elementIsVisibleByLocator",
  "params": {
    "name": "Run app login button",
    "locator": "#root div:has-text(\"Login\")",
    "frameLocator": "#emulator-iframe",
    "timeout": 30000
  }
}
```

You can also use `frameLocator` directly in a full locator object:

```json
{
  "name": "Run app login button is visible",
  "locator": {
    "strategy": "locator",
    "locator": "#root div:has-text(\"Login\")",
    "frameLocator": "#emulator-iframe"
  },
  "assertions": [
    {
      "type": "visible",
      "timeout": 30000
    }
  ]
}
```

Use this when the element is not on the main page, but inside an iframe.

## Troubleshooting

### `npm run validate:data` fails

Check the error message. It usually points to a missing token, invalid locator strategy, missing assertion value, missing validation set, or missing template parameter.

### Login fails

Check these values in `.env`:

```env
APP_URL=
GOOGLE_EMAIL=
GOOGLE_PASSWORD=
```

Then delete the saved auth state and retry:

```bash
rm -f playwright/.auth/user.json
npm test
```

### Gmail test cannot find the email

Check:

- `GOOGLE_EMAIL` is the inbox receiving the email.
- `EMAIL_SENDER` matches the sender, or leave it blank to avoid sender filtering.
- `expectedEmailSubject` in JSON matches the email subject.
- `secrets/token.json` exists.
- The Gmail account authorized by `npm run gmail:auth` is the same account used by `GOOGLE_EMAIL`.

### Gmail token is expired or revoked

Run:

```bash
npm run gmail:auth
```

Then rerun the test.

### Playwright browser is missing

Run:

```bash
npm run install:browsers
```

On Linux:

```bash
npx playwright install --with-deps
```

### HTML report does not open

Run tests first, then run:

```bash
npm run report
```

## Git hygiene

These files should stay out of Git:

```text
.env
.env.*
playwright/.auth/user.json
secrets/credentials.json
secrets/token.json
node_modules/
playwright-report/
test-results/
```

Commit `.env.example` and `secrets/.gitkeep`, but do not commit real credentials or tokens.
