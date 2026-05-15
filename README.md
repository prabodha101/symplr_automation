# Symplr Config-Driven Playwright Tests

This project runs Symplr end-to-end UI tests using a JSON-driven Playwright automation framework.

Instead of writing a new Playwright spec file for every page, screen, or scenario, most test behavior is configured in:

```text
test-data/symplr_pages.json
```

The generic Playwright runner reads this JSON file and executes the configured scenarios, actions, validations, downloads, email checks, and end-to-end flows.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Important Files](#important-files)
3. [Pre-Requisites](#pre-requisites)
4. [Fresh Clone Setup](#fresh-clone-setup)
5. [Environment Configuration](#environment-configuration)
6. [Gmail API Setup](#gmail-api-setup)
7. [Login Session Handling](#login-session-handling)
8. [Validate Test Data](#validate-test-data)
9. [Test Execution Commands](#test-execution-commands)
10. [Run Tests by Scenario](#run-tests-by-scenario)
11. [How the Config-Driven Tests Work](#how-the-config-driven-tests-work)
12. [How to Add a New Test Case](#how-to-add-a-new-test-case)
13. [Examples](#examples)
14. [Troubleshooting](#troubleshooting)
15. [Git Hygiene](#git-hygiene)

---

## Project Overview

The goal of this framework is to let users add and maintain many UI tests from configuration.

Most changes should be done in:

```text
test-data/symplr_pages.json
```

Only update TypeScript code when a completely new framework capability is required, such as a new special action, new integration, or new locator strategy.

High-level execution flow:

```text
Start Playwright Test
  -> Read symplr_pages.json
  -> Load tokens and defaults
  -> Load test case
  -> Prepare authenticated browser page
  -> Run scenario or navigate to page
  -> Run before actions
  -> Run page assertions
  -> Run validations
  -> Run page actions
  -> Run nested validations
  -> Test passes or fails
```

---

## Important Files

| File | Purpose |
|---|---|
| `test-data/symplr_pages.json` | Main test configuration file. Contains tokens, scenario definitions, validation templates, validation sets, and test cases. |
| `schemas/testCases.schema.json` | JSON schema that defines the allowed structure of `symplr_pages.json`. |
| `tests/data-driven.spec.ts` | Generic Playwright runner that reads the JSON file and executes tests. |
| `tests/fixtures/app-fixtures.ts` | Custom Playwright fixture that prepares an authenticated browser page before test execution. |
| `tests/utils/auth-session.ts` | Handles saved login session reuse and re-login when session is expired. |
| `pages/LoginPage.ts` | Contains Google login page interactions. |
| `pages/DashboardHomePage.ts` | Contains dashboard page helpers used to confirm login/session status. |
| `pages/ProjectStoryBoardPage.ts` | Page object for storyboard-specific named actions. |
| `pages/AppRunPage.ts` | Page object for Build and Run page actions. |
| `integrations/email/GmailInbox.ts` | Reads Gmail messages for email-based tests. |
| `integrations/email/GmailDownloadLink.ts` | Extracts and downloads ZIP links from emails. |
| `scripts/validate-test-data.mjs` | Validates the JSON test data before running browser tests. |
| `scripts/gmail-auth.mjs` | Generates or refreshes Gmail OAuth token. |
| `playwright.config.ts` | Playwright configuration. |
| `.env.example` | Template for local environment variables. |

---

## Pre-Requisites

Before running the automation tests, complete the following items.

### 1. Google Account

- A Google account is required to log in to Symplr.
- This Google account must already be registered with Symplr.
- The user should be able to manually log in to Symplr before running automation.
- Recommended: use a dedicated QA/test Google account instead of a personal account.

Example:

```text
qa.automation.user@gmail.com
```

### 2. Disable 2FA

- Two-factor authentication should be disabled for the Google account used by automation.
- The framework logs in using email and password.
- If 2FA is enabled, Google may ask for manual verification and the automation can fail.

### 3. Add Google Credentials to `.env`

The Google email and password should be added to the local `.env` file:

```env
GOOGLE_EMAIL=qa.automation.user@gmail.com
GOOGLE_PASSWORD=your-password-here
```

Do not commit `.env` to GitHub.

### 4. Symplr Access

The configured Google account should have permission to:

- Log in to Symplr.
- Access the correct workspace.
- Open the dashboard.
- Search for the configured test app.
- Open the storyboard.
- Use Developer Options.
- Build and run the app, if Build and Run tests are enabled.

### 5. GitHub Account Connection

For GitHub-related tests, the user's GitHub account should already be connected to the Symplr account.

This is required for tests such as:

```text
Validate that code can be pushed to GitHub from Developer Options
```

If the GitHub authorization has expired, reconnect GitHub manually before running the test.

### 6. Gmail API

Email-based tests require Gmail API access.

Example email-based tests:

```text
Validate that code can be sent by email from Developer Options
Validate that code can be pushed to GitHub from Developer Options
```

The Gmail API is used to:

- Wait for a specific email.
- Validate the email subject.
- Read the email body.
- Extract a download link.
- Download and validate a ZIP file.

### 7. Local Machine Requirements

Install these before running the tests:

- Git
- Node.js 20 or later
- npm, which is installed with Node.js
- Playwright browsers

Check versions:

```bash
node --version
npm --version
```

If using `nvm`, a typical setup is:

```bash
nvm install 20
nvm use 20
```

Node.js 22 LTS is also supported.

---

## Fresh Clone Setup

From a clean machine or fresh checkout:

```bash
git clone <repository-url>
cd <repository-folder>
```

Install project dependencies from `package-lock.json`:

```bash
npm ci
```

If you are actively changing dependencies and do not want to use the lock file strictly, use:

```bash
npm install
```

Install Playwright browser binaries:

```bash
npm run install:browsers
```

Or run directly:

```bash
npx playwright install
```

On Linux CI machines, install browser system dependencies too:

```bash
npx playwright install --with-deps
```

---

## Environment Configuration

Create your local `.env` file from `.env.example`.

### macOS / Linux

```bash
cp .env.example .env
```

### Windows PowerShell

```powershell
Copy-Item .env.example .env
```

Then update `.env` with your local values.

Example:

```env
APP_URL=https://101studio.co/

GOOGLE_EMAIL=qa.automation.user@gmail.com
GOOGLE_PASSWORD=your-password-here

EMAIL_SENDER=notification@101digital.io

GMAIL_CREDENTIALS_PATH=secrets/credentials.json
GMAIL_TOKEN_PATH=secrets/token.json
GMAIL_SCOPES=https://www.googleapis.com/auth/gmail.readonly
GMAIL_REDIRECT_URI=http://127.0.0.1:53682/oauth2callback
```

### Environment Variable Details

| Variable | Purpose |
|---|---|
| `APP_URL` | Symplr application URL used by Playwright. This should be the single source of truth for the base URL. |
| `GOOGLE_EMAIL` | Google account used for Symplr login and Gmail inbox validation. |
| `GOOGLE_PASSWORD` | Google account password used by the UI login flow. |
| `EMAIL_SENDER` | Sender filter used while polling Gmail. Leave blank only if you want to match by recipient and subject only. |
| `GMAIL_CREDENTIALS_PATH` | Path to Google OAuth client credentials file. |
| `GMAIL_TOKEN_PATH` | Path where the generated Gmail OAuth token is stored. |
| `GMAIL_SCOPES` | Gmail API scope used by email validation. |
| `GMAIL_REDIRECT_URI` | Local OAuth callback used by `npm run gmail:auth`. |

### Base URL Recommendation

Keep the application URL in `.env` as:

```env
APP_URL=https://101studio.co/
```

Do not duplicate the same base URL in `test-data/symplr_pages.json`.

Reason:

```text
.env = environment-specific values
symplr_pages.json = test behavior and validation data
```

This makes it easier to switch between local, QA, staging, and production environments.

---

## Gmail API Setup

Some tests need to read Gmail emails and download files from email links.

### Step 1: Enable Gmail API

In Google Cloud Console:

1. Select or create a Google Cloud project.
2. Enable the Gmail API.
3. Configure OAuth consent screen.
4. If the OAuth app is in testing mode, add the automation Gmail account as a test user.

### Step 2: Create OAuth Credentials

Create:

```text
OAuth Client ID
```

Recommended application type:

```text
Desktop app
```

Download the credentials JSON file and save it as:

```text
secrets/credentials.json
```

The file should contain values like:

```json
{
  "installed": {
    "client_id": "your-client-id",
    "client_secret": "your-client-secret"
  }
}
```

### Step 3: Configure `.env`

Make sure `.env` points to the Gmail files:

```env
GMAIL_CREDENTIALS_PATH=secrets/credentials.json
GMAIL_TOKEN_PATH=secrets/token.json
```

### Step 4: Generate Gmail Token

Run:

```bash
npm run gmail:auth
```

Then:

1. Open the authorization URL printed in the terminal.
2. Sign in using the Gmail account from `GOOGLE_EMAIL`.
3. Approve access.
4. Confirm that this file was created:

```text
secrets/token.json
```

The test code refreshes the Gmail access token automatically when possible.

If Google says the refresh token is expired or revoked, run this again:

```bash
npm run gmail:auth
```

---

## Login Session Handling

Before each test runs, the framework checks whether a saved login session is already available.

The saved session file is:

```text
playwright/.auth/user.json
```

This file contains browser authentication state such as cookies and local storage.

### What Happens Before Each Test

1. Playwright starts the test.
2. The custom test fixture prepares an authenticated page.
3. The framework checks whether `playwright/.auth/user.json` exists.
4. If the file exists, the framework opens the app using the saved session.
5. It checks whether the session is still active.
6. If the session is active, the test runs as a pre-logged-in user.
7. If the session is missing or expired, the framework logs in using `GOOGLE_EMAIL` and `GOOGLE_PASSWORD`.
8. After successful login, it saves a fresh session to `playwright/.auth/user.json`.
9. The configured test steps then run.

Simple flow:

```text
Test starts
  -> Check saved session file
  -> Session exists and active?
      -> Yes: reuse saved session
      -> No: login with configured user and save new session
  -> Run test as pre-logged-in user
```

If login behaves unexpectedly, delete the saved auth file and run again:

### macOS / Linux

```bash
rm -f playwright/.auth/user.json
```

### Windows PowerShell

```powershell
Remove-Item playwright/.auth/user.json -ErrorAction SilentlyContinue
```

Do not commit `playwright/.auth/user.json` to Git.

---

## Validate Test Data

Before running browser tests, validate the JSON configuration:

```bash
npm run validate:data
```

This checks:

- JSON syntax
- tokens
- scenario definitions
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

Run this command after every change to `test-data/symplr_pages.json`.

---

## Test Execution Commands

### Run All Tests

```bash
npm test
```

### Run Tests with Browser Visible

```bash
npm run test:headed
```

### Open Playwright UI Mode

```bash
npm run test:ui
```

### Open Latest HTML Report

```bash
npm run report
```

### Run a Specific Test Case

Use Playwright's `-g` grep option with the test name from `test-data/symplr_pages.json`.

```bash
npx playwright test tests/data-driven.spec.ts -g "Home page loads correctly"
```

Headed mode:

```bash
npx playwright test tests/data-driven.spec.ts -g "Home page loads correctly" --headed
```

Another example:

```bash
npx playwright test tests/data-driven.spec.ts -g "Open Pages screen from storyboard" --headed
```

### List Tests Without Running Them

```bash
npx playwright test --list
```

### Debug a Test

```bash
npx playwright test tests/data-driven.spec.ts -g "Home page loads correctly" --debug
```

---

## Run Tests by Scenario

The project supports scenario filtering from the command line.

Allowed scenario values:

```text
prompt
figma
template
existingApp
```

### Using npm script

```bash
npm run test:scenario -- existingApp
```

Examples:

```bash
npm run test:scenario -- figma
npm run test:scenario -- template
npm run test:scenario -- prompt
```

With headed mode:

```bash
npm run test:scenario -- existingApp --headed
```

With a specific test name:

```bash
npm run test:scenario -- existingApp -g "Open Blueprint screen from storyboard"
```

### Using environment variables directly

#### Windows PowerShell

```powershell
$env:SCENARIO="existingApp"
npx playwright test tests/data-driven.spec.ts --headed
```

#### Windows CMD

```cmd
set SCENARIO=existingApp && npx playwright test tests/data-driven.spec.ts --headed
```

#### macOS / Linux

```bash
SCENARIO=existingApp npx playwright test tests/data-driven.spec.ts --headed
```

Important:

```text
SCENARIO=figma means:
Run only test cases whose scenario is already "figma".

It does not convert an existingApp test into a figma test.
```

---

## Project Scripts

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
| `npm run test:scenario -- <scenario>` | Runs only test cases matching a scenario. |

---

## How the Config-Driven Tests Work

The main test data file is:

```text
test-data/symplr_pages.json
```

The generic runner is:

```text
tests/data-driven.spec.ts
```

The JSON file supports:

- `defaults` for common settings
- `tokens` for reusable values
- `scenarioDefinitions` for reusable scenario flows
- `validationTemplates` for reusable parameterized validation patterns
- `validationSets` for reusable groups of validations
- `testCases` for actual runnable tests
- `includeTestCases` for composing end-to-end tests from existing test cases
- `beforeValidateActions` for actions before validations
- `pageAssertions` for page title/URL checks
- `validations` for UI validations
- `pageActions` for configured user interactions
- `postValidations` for validations immediately after a page action
- `frameLocator` for validating elements inside iframes

---

## Reusable Scenario Definitions

The app-loading scenarios are configuration driven.

Each test case chooses a scenario by name:

```json
{
  "name": "Open Blueprint screen from storyboard",
  "enabled": true,
  "scenario": "existingApp",
  "scenarioConfig": {
    "type": "existingApp",
    "appName": "${tokens.appName}"
  }
}
```

The actual steps for `existingApp` live in the top-level `scenarioDefinitions` section of `test-data/symplr_pages.json`.

Example:

```json
"scenarioDefinitions": {
  "existingApp": {
    "beforeValidateActions": [
      {
        "type": "fill",
        "name": "Search for existing app",
        "locator": {
          "strategy": "role",
          "role": "textbox",
          "name": "Search",
          "exact": true
        },
        "value": "${scenarioConfig.appName}"
      }
    ],
    "validations": [
      { "$ref": "storyboardReady" }
    ]
  }
}
```

Use `${scenarioConfig.fieldName}` inside a scenario definition to read values from the test case's `scenarioConfig`.

Examples:

| Scenario | Common Config Value |
|---|---|
| `existingApp` | `${scenarioConfig.appName}` |
| `prompt` | `${scenarioConfig.prompt}` |
| `figma` | `${scenarioConfig.figmaUrl}` |
| `template` | `${scenarioConfig.templateName}` |

Example template scenario test case:

```json
{
  "name": "Build an app from a template",
  "enabled": true,
  "scenario": "template",
  "scenarioConfig": {
    "type": "template",
    "templateName": "${tokens.templateName}"
  }
}
```

If a label, button name, or locator changes in one of these flows, update `scenarioDefinitions` in the JSON file.

---

## Validation Templates

Use `validationTemplates` when the structure of a validation is the same but the text, locator, value, or assertion changes.

Example:

```json
{
  "$template": "textIsVisible",
  "params": {
    "text": "Blueprint",
    "timeout": 30000
  }
}
```

Example with a full locator object:

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

---

## Validation Sets

Use `validationSets` when you want to reuse a group of validations.

Example usage:

```json
{
  "$ref": "blueprintScreen"
}
```

This allows multiple tests to share the same validations without copying them.

---

## End-to-End Test Composition

The project supports `includeTestCases`, which lets one test reuse sections from other test cases.

Example:

```json
{
  "name": "End to End scenario test using existing app",
  "enabled": true,
  "scenario": "existingApp",
  "scenarioConfig": {
    "type": "existingApp",
    "appName": "${tokens.appName}"
  },
  "includeTestCases": [
    "Open Blueprint screen from storyboard",
    "Open Pages screen from storyboard",
    "Open Themes screen from storyboard",
    "Open Variables screen from storyboard",
    "Open Settings screen from storyboard",
    "Validate that code can be sent by email from Developer Options",
    "Validate that code can be pushed to GitHub from Developer Options",
    "Validate that the app can be built and run from the storyboard"
  ]
}
```

Referenced test cases do not rerun their own `scenario`, `path`, or `url`; only their configured sections are reused.

---

## Supported Actions

The runner supports generic actions:

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

---

## How to Add a New Test Case

Most new test cases should be added in:

```text
test-data/symplr_pages.json
```

### Step 1: Add or Reuse Tokens

If the same text is used many times, add it under `tokens`.

Example:

```json
"tokens": {
  "newMenuText": "Reports"
}
```

Then use it like this:

```json
"${tokens.newMenuText}"
```

### Step 2: Reuse Existing Templates or Validation Sets

Before adding a long validation block, check whether a template or validation set already exists.

Useful examples:

```json
{ "$template": "textIsVisible" }
```

```json
{ "$template": "elementIsVisibleByLocator" }
```

```json
{ "$ref": "blueprintScreen" }
```

### Step 3: Add the Test Case

Add a new object inside the `testCases` array.

Example:

```json
{
  "name": "Open Reports screen from storyboard",
  "enabled": true,
  "scenario": "existingApp",
  "scenarioConfig": {
    "type": "existingApp",
    "appName": "${tokens.appName}"
  },
  "beforeValidateActions": [
    {
      "type": "click",
      "name": "Open Reports menu",
      "locator": {
        "strategy": "text",
        "text": "${tokens.newMenuText}",
        "exact": true
      }
    }
  ],
  "validations": [
    {
      "$template": "textIsVisible",
      "params": {
        "text": "${tokens.newMenuText}",
        "timeout": 30000
      }
    }
  ]
}
```

### Step 4: Validate the JSON

```bash
npm run validate:data
```

### Step 5: Run the New Test

```bash
npx playwright test tests/data-driven.spec.ts -g "Open Reports screen from storyboard" --headed
```

---

## Examples

### Example 1: Validate Text Is Visible

```json
{
  "$template": "textIsVisible",
  "params": {
    "text": "Settings",
    "timeout": 30000
  }
}
```

### Example 2: Validate Button Is Visible

```json
{
  "$template": "buttonIsVisible",
  "params": {
    "name": "Add",
    "timeout": 30000
  }
}
```

### Example 3: Validate Element by Custom Locator

```json
{
  "$template": "elementIsVisibleByLocator",
  "params": {
    "name": "First screen preview",
    "locator": "#PreviewScreen-main",
    "timeout": 30000
  }
}
```

### Example 4: Click a Button and Validate Result

```json
{
  "type": "click",
  "name": "Open App Details",
  "locator": {
    "strategy": "role",
    "role": "button",
    "name": "App Details",
    "exact": true,
    "first": true
  },
  "validations": [
    {
      "$template": "textIsVisible",
      "params": {
        "text": "Advance Settings"
      }
    }
  ]
}
```

### Example 5: Validate App Definition Download

```json
{
  "type": "downloadAppDefinition",
  "name": "Download and validate appDefinition JSON file",
  "expectedExtension": ".json",
  "validateJson": true,
  "minBytes": 1
}
```

### Example 6: Validate Code ZIP from Email

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

### Example 7: Build and Run Page Validation

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
}
```

After `buildAndRunApp`, the active Playwright page becomes the newly opened run page.

Normal JSON-driven validations and actions then run against that run page until you switch back with:

```json
{
  "type": "switchToMainPage"
}
```

### Example 8: Validate an Element Inside an Iframe

Some app-run content is rendered inside an iframe.

For example, the built app preview uses:

```text
#emulator-iframe
```

To validate an element inside that iframe, add `frameLocator`:

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

The runner first enters the iframe, then finds the normal locator inside it.

### Example 9: Validate After an Action

Use `postValidations` when you want to validate something immediately after a page action finishes.

```json
{
  "type": "waitForBuildComplete",
  "name": "Wait until the app run page is ready",
  "postValidations": [
    {
      "$template": "elementIsVisibleByLocator",
      "params": {
        "name": "Run app root container is visible",
        "locator": "#root>div",
        "timeout": 30000
      }
    }
  ]
}
```

Execution order:

```text
action -> postValidations -> nested pageActions
```

The older `validations` property on an action still works and runs after the action. `postValidations` is preferred for new action-level checks.

---

## Soft Assertions

The framework supports `softAssertions`.

When `softAssertions` is `false`, the test stops immediately after a validation failure.

When `softAssertions` is `true`, Playwright records the failure but continues executing the remaining validations.

Default setting:

```json
"defaults": {
  "softAssertions": false
}
```

Enable for one test case:

```json
{
  "name": "Open Settings screen from storyboard",
  "enabled": true,
  "softAssertions": true
}
```

Use this when you want to collect all missing/broken UI fields in one run.

---

## When to Update the Schema

The schema file is:

```text
schemas/testCases.schema.json
```

Do not add normal test cases into this file.

Add normal test cases into:

```text
test-data/symplr_pages.json
```

Update the schema only when the framework supports a new type of configuration, such as:

- New action type
- New assertion type
- New locator strategy
- New top-level JSON section
- New required property

---


---

## New User Onboarding Test

The framework now supports a config-driven onboarding test without changing the normal login/session behavior for existing tests.

The test case is defined in:

```text
test-data/symplr_pages.json
```

Test case name:

```text
Complete new user onboarding flow
```

This test is disabled by default because onboarding normally appears only for a brand-new Symplr user. To run it:

1. Configure `.env` with a Google account that is registered with Symplr but has not completed onboarding yet.
2. Set this test case to `"enabled": true` in `test-data/symplr_pages.json`.
3. Run the test by name:

```bash
npx playwright test tests/data-driven.spec.ts -g "Complete new user onboarding flow" --headed
```

The test uses this auth configuration:

```json
"auth": {
  "session": "fresh",
  "saveSessionAfterTest": true
}
```

This means:

- `session: "fresh"` forces the existing Google login flow before this test starts.
- `saveSessionAfterTest: true` saves the browser session again after onboarding completes.

The onboarding button clicks are still configured in JSON. Example:

```json
{
  "type": "click",
  "name": "Click through onboarding Next buttons if they appear",
  "locator": {
    "strategy": "role",
    "role": "button",
    "name": "${tokens.onboardingNextButtonText}",
    "exact": true
  },
  "optional": true,
  "repeat": 5,
  "timeout": 5000,
  "delayMs": 500
}
```

The optional/repeat behavior is useful for onboarding because the number of modal steps can change:

- `optional: true` skips the click if the button is not visible.
- `repeat: 5` tries to click the same button up to five times.
- `delayMs: 500` waits briefly between repeated clicks.

If the onboarding button text changes, update the related tokens:

```json
"onboardingNextButtonText": "Next",
"onboardingFinishButtonText": "Finish",
"onboardingDoneButtonText": "Done",
"onboardingGetStartedButtonText": "Get Started"
```

## Troubleshooting

### `npm run validate:data` fails

Check the error message. It usually points to:

- Missing token
- Invalid locator strategy
- Missing assertion value
- Missing validation set
- Missing template parameter
- Missing scenario config parameter
- Invalid action type

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

Windows PowerShell:

```powershell
Remove-Item playwright/.auth/user.json -ErrorAction SilentlyContinue
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

### Element is inside an iframe

If a locator works manually but fails in the test, check whether the element is inside an iframe.

Use `frameLocator`:

```json
{
  "$template": "elementIsVisibleByLocator",
  "params": {
    "name": "Login button",
    "locator": "#root div:has-text(\"Login\")",
    "frameLocator": "#emulator-iframe",
    "timeout": 30000
  }
}
```

### HTML report does not open

Run tests first, then run:

```bash
npm run report
```

---

## Git Hygiene

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

Commit:

```text
.env.example
secrets/.gitkeep
```

Do not commit real credentials, tokens, local auth state, reports, or generated test output.

---

## Quick Start Summary

For a fresh setup:

```bash
git clone <repository-url>
cd <repository-folder>
npm ci
npm run install:browsers
cp .env.example .env
```

Update `.env`.

If email tests are required:

```bash
npm run gmail:auth
```

Validate data:

```bash
npm run validate:data
```

Run tests:

```bash
npm test
```

Run one test:

```bash
npx playwright test tests/data-driven.spec.ts -g "Home page loads correctly" --headed
```
