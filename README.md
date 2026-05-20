# Symplr Config-Driven Playwright Tests

This project runs Symplr end-to-end UI tests using a JSON-driven Playwright automation framework.

Instead of writing a new Playwright spec file for every page, screen, or scenario, most test behavior is configured in JSON files under:

```text
test-data/
```

The main entry file is:

```text
test-data/symplr_pages.json
```

That file is intentionally small. It imports smaller configuration files for tokens, scenarios, validation templates, validation sets, and test cases. The generic Playwright runner loads and merges those files before executing the configured scenarios, actions, validations, downloads, email checks, and end-to-end flows.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Important Files](#important-files)
3. [Test Data File Structure](#test-data-file-structure)
4. [Pre-Requisites](#pre-requisites)
5. [Fresh Clone Setup](#fresh-clone-setup)
6. [Environment Configuration](#environment-configuration)
7. [Gmail API Setup](#gmail-api-setup)
8. [Login Session Handling](#login-session-handling)
9. [Validate Test Data](#validate-test-data)
10. [Test Execution Commands](#test-execution-commands)
11. [Run Tests by Scenario](#run-tests-by-scenario)
12. [How the Config-Driven Tests Work](#how-the-config-driven-tests-work)
13. [How to Add a New Test Case](#how-to-add-a-new-test-case)
14. [Examples](#examples)
15. [Troubleshooting](#troubleshooting)
16. [Git Hygiene](#git-hygiene)

---

## Project Overview

The goal of this framework is to let users add and maintain many UI tests from configuration.

Most changes should be done in one of the smaller JSON files under:

```text
test-data/common/
test-data/test-cases/
```

The root file `test-data/symplr_pages.json` should normally only list imports.

Only update TypeScript code when a completely new framework capability is required, such as a new special action, new integration, or new locator strategy.

High-level execution flow:

```text
Start Playwright Test
  -> Read symplr_pages.json
  -> Load imported JSON files
  -> Merge tokens, defaults, scenarios, templates, validation sets, and test cases
  -> Load selected test case
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
| `test-data/symplr_pages.json` | Main entry file. It imports smaller JSON files and keeps the root configuration easy to read. |
| `test-data/common/defaults.json` | Common default settings such as navigation timeout and soft assertions. |
| `test-data/common/tokens.json` | Reusable text values, app names, email addresses, template IDs, etc. |
| `test-data/common/scenario-definitions.json` | Reusable scenario flows such as `prompt`, `figma`, `template`, and `existingApp`. |
| `test-data/common/validation-templates.json` | Reusable parameterized validation templates. |
| `test-data/common/validation-sets.json` | Reusable groups of validations, such as `blueprintScreen` and `settingsScreen`. |
| `test-data/test-cases/*.json` | Feature-specific test case files. New tests should usually be added here. |
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

## Test Data File Structure

The project uses an import-based JSON structure to keep files smaller and easier to maintain.

The main file is:

```text
test-data/symplr_pages.json
```

It now works like a table of contents:

```json
{
  "$schema": "../schemas/testCases.schema.json",
  "imports": [
    "./common/defaults.json",
    "./common/tokens.json",
    "./common/scenario-definitions.json",
    "./common/validation-templates.json",
    "./common/validation-sets.json",
    "./test-cases/home.json",
    "./test-cases/create-app.json",
    "./test-cases/storyboard-navigation.json",
    "./test-cases/settings.json",
    "./test-cases/sharing.json",
    "./test-cases/email-and-github.json",
    "./test-cases/build-run.json",
    "./test-cases/e2e.json"
  ]
}
```

When tests run, the framework loads `symplr_pages.json`, reads each imported file, merges them in order, and then runs the tests exactly as before.

### Current folder structure

```text
test-data/
  symplr_pages.json
  common/
    defaults.json
    tokens.json
    scenario-definitions.json
    validation-templates.json
    validation-sets.json
  test-cases/
    home.json
    create-app.json
    storyboard-navigation.json
    settings.json
    sharing.json
    email-and-github.json
    build-run.json
    e2e.json
```

### Where to make changes

| Need | File to update |
|---|---|
| Change common text, app name, email, template ID | `test-data/common/tokens.json` |
| Change scenario setup flow | `test-data/common/scenario-definitions.json` |
| Change reusable validation pattern | `test-data/common/validation-templates.json` |
| Change reusable screen validation group | `test-data/common/validation-sets.json` |
| Add or maintain normal test cases | One of the files under `test-data/test-cases/` |
| Add a new test-case file | Create a new file under `test-data/test-cases/` and add it to `imports` in `symplr_pages.json` |

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

### Tests That Must Run Without the Saved Login Session

Most tests should use the default authenticated behavior. However, a few tests must start from a clean, logged-out browser state. A common example is the **User Registration** test.

For those tests, add an `auth` block to the test case:

```json
{
  "name": "User Registration",
  "enabled": true,
  "auth": {
    "session": "none",
    "clearStorageState": true,
    "navigateToApp": true
  },
  "pageActions": []
}
```

This means:

```text
For this test only:
  -> delete the saved session file if it exists
  -> create a clean browser context
  -> do not run the framework's internal login helper
  -> open APP_URL
  -> run the configured JSON steps
```

Use this only for tests that need to validate login, registration, or first-time user behavior. Existing tests that do not include this `auth` block continue to reuse the normal saved login session.

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

Run this command after every change to any file under `test-data/`. The validator loads `symplr_pages.json`, follows all imports, merges the configuration, and validates the final result.

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
| `npm run validate:data` | Loads `test-data/symplr_pages.json`, follows imports, merges the config, and validates the final test data. |
| `npm run gmail:auth` | Generates or refreshes Gmail OAuth token file. |
| `npm run test:scenario -- <scenario>` | Runs only test cases matching a scenario. |

---

## How the Config-Driven Tests Work

The main test data entry file is:

```text
test-data/symplr_pages.json
```

The generic runner is:

```text
tests/data-driven.spec.ts
```

The runner performs this process:

```text
1. Read test-data/symplr_pages.json.
2. Load each file listed in imports.
3. Merge imported files into one in-memory configuration.
4. Resolve tokens such as ${tokens.appName}.
5. Expand validation sets and validation templates.
6. Register enabled test cases.
7. Execute the selected tests.
```

The imported JSON files support:

- `defaults` for common settings
- `tokens` for reusable values
- `scenarioDefinitions` for reusable scenario flows
- `validationTemplates` for reusable parameterized validation patterns
- `validationSets` for reusable groups of validations
- `testCases` for actual runnable tests
- `auth` for per-test authentication behavior, such as clean logged-out registration tests
- `includeTestCases` for composing end-to-end tests from existing test cases
- `prerequisiteTestCases` for running one or more configured test flows before the current test case's own scenario/navigation
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

The actual steps for `existingApp` live in `test-data/common/scenario-definitions.json`.

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

## Prerequisite Test Cases

Use `prerequisiteTestCases` when one full configured test flow must run before another test case starts its own scenario or navigation.

This is different from `includeTestCases`:

| Feature | When it runs | Main use |
|---|---|---|
| `prerequisiteTestCases` | Before the current test case's scenario/navigation | Preconditions such as fresh user registration |
| `includeTestCases` | As part of the current test case sections | Reusing validations/actions inside an E2E test |

Example: register a fresh user first, then create an app using the reusable `template` scenario.

```json
{
  "name": "Create app using template",
  "enabled": true,
  "auth": {
    "session": "none",
    "clearStorageState": true,
    "navigateToApp": true
  },
  "prerequisiteTestCases": [
    "User Registration"
  ],
  "scenario": "template",
  "scenarioConfig": {
    "type": "template",
    "templateName": "${tokens.templateName}"
  },
  "pageAssertions": [
    {
      "type": "urlContains",
      "expected": "/dashboard/projects"
    }
  ],
  "validations": [
    {
      "$ref": "blueprintScreen"
    }
  ]
}
```

Important notes:

- The current test case controls the browser session/auth behavior.
- For fresh-user flows, use `auth.session = "none"` and `clearStorageState = true`.
- The referenced prerequisite test runs in the same browser page/context before the current scenario starts.
- The referenced prerequisite test's own `auth` block is not applied separately, because Playwright creates the browser fixture before the test body starts.

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
fillEmailCodeAndSubmit
conditional
buildAndRunApp
waitForBuildComplete
openRunOnDeviceModal
waitForQrCodeGenerated
switchToMainPage
switchToRunPage
```

Use named actions when a workflow needs page-object logic, popup handling, Gmail polling, ZIP validation, branching, or other app-specific behavior.

The `conditional` action is used when the application can follow more than one valid path. For example, GitHub may sometimes ask for an email verification code and sometimes connect directly. The condition checks whether a configured element appears within a timeout, then runs the matching branch.

---

## How to Add a New Test Case

Most new test cases should be added in one of the files under:

```text
test-data/test-cases/
```

Choose the file that matches the feature area. For example:

| Test type | Suggested file |
|---|---|
| Home/dashboard tests | `test-data/test-cases/home.json` |
| Create app tests | `test-data/test-cases/create-app.json` |
| Blueprint, Pages, Themes, Variables navigation tests | `test-data/test-cases/storyboard-navigation.json` |
| Settings tests | `test-data/test-cases/settings.json` |
| Share app tests | `test-data/test-cases/sharing.json` |
| Download-code email tests | `test-data/test-cases/download-code.json` |
| GitHub connection tests | `test-data/test-cases/connect-to-github.json` |
| Build and Run tests | `test-data/test-cases/build-run.json` |
| End-to-end composed tests | `test-data/test-cases/e2e.json` |

### Step 1: Add or Reuse Tokens

If the same text is used many times, add it under `tokens` in:

```text
test-data/common/tokens.json
```

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

Add a new object inside the `testCases` array in the correct feature file.

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

### Step 4: Add a New Test-Case File if Needed

If none of the existing files is a good place for the new test, create a new file.

Example:

```text
test-data/test-cases/reports.json
```

The file should contain:

```json
{
  "testCases": [
    {
      "name": "Open Reports screen from dashboard",
      "enabled": true,
      "scenario": "existingApp",
      "scenarioConfig": {
        "type": "existingApp",
        "appName": "${tokens.appName}"
      },
      "validations": []
    }
  ]
}
```

Then add the file to `imports` in `test-data/symplr_pages.json`:

```json
"./test-cases/reports.json"
```

### Step 5: Validate the JSON

```bash
npm run validate:data
```

### Step 6: Run the New Test

```bash
npx playwright test tests/data-driven.spec.ts -g "Open Reports screen from storyboard" --headed
```

### Example: New test that uses a prerequisite and a reusable scenario

The test case `Create app using template` is an example of this pattern:

```text
Run User Registration first
  -> then run the reusable template scenario
  -> then validate the Blueprint screen
```

Run it with:

```bash
npx playwright test tests/data-driven.spec.ts -g "Create app using template" --headed
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

### Example 7: Fill an Email Verification Code and Submit

Use `fillEmailCodeAndSubmit` when a UI action sends an email that contains a verification code.

Example use case:

```text
GitHub sends an email with subject: [GitHub] Please verify your device
The email body contains: Verification code: 123456
```

Config example:

```json
{
  "type": "fillEmailCodeAndSubmit",
  "name": "Read GitHub device verification code from email and verify",
  "expectedEmailSubject": "[GitHub] Please verify your device",
  "emailTo": "${tokens.symplrUserEmail}",
  "emailBodyContains": "Verification code:",
  "codePrefix": "Verification code:",
  "codeRegex": "Verification code:\\s*([A-Za-z0-9][A-Za-z0-9 _-]{2,30})",
  "timeout": 180000,
  "pollIntervalMs": 5000,
  "locator": {
    "strategy": "role",
    "role": "input",
    "name": "otp",
    "exact": true
  },
  "verifyButtonLocator": {
    "strategy": "role",
    "role": "button",
    "name": "Verify",
    "exact": true
  }
}
```

This action:

1. Waits for an email matching `expectedEmailSubject`.
2. Looks for the verification code using `codeRegex` or `codePrefix`.
3. Fills the code into the configured input locator.
4. Clicks the configured verify button.

`role: "input"` is supported as a convenience alias for common HTML inputs such as `input[name="otp"]`, `input[id="otp"]`, `input[aria-label="otp"]`, and similar textarea attributes.

### Example 8: Build and Run Page Validation

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

### Example 9: Validate an Element Inside an Iframe

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

### Example 10: Validate After an Action

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

### Example 11: Retry an Action Until Its Validation Passes

Some UI actions can be timing-sensitive. For example, the **Sign in** button may be clickable, but the login modal may not open on the first click if the application is still finishing background work.

For this situation, use `retryOnValidationFailure` on the action. The framework will:

1. Run the action.
2. Run the action-level `validations` or `postValidations`.
3. If those validations fail, wait and try the action again.
4. Stop retrying as soon as the validations pass.

Example:

```json
{
  "type": "click",
  "name": "Click Sign in and wait until the Continue with modal opens",
  "locator": {
    "strategy": "role",
    "role": "button",
    "name": "Sign in"
  },
  "retryOnValidationFailure": true,
  "retryAttempts": 5,
  "retryDelayMs": 1500,
  "validations": [
    {
      "$template": "textIsVisible",
      "params": {
        "text": "Continue with",
        "timeout": 5000
      }
    }
  ]
}
```

Use this only when the success condition can be validated clearly after the action.

---

## Example: User Registration Without Reusing Login Session

The `User Registration` test needs to run as a logged-out user. It should not reuse `playwright/.auth/user.json`, and it should not call the framework's internal login helper.

Use this config pattern:

```json
{
  "name": "User Registration",
  "enabled": true,
  "auth": {
    "session": "none",
    "clearStorageState": true,
    "navigateToApp": true
  },
  "pageActions": [
    {
      "type": "click",
      "name": "Click Sign in and wait until the Continue with modal opens",
      "locator": {
        "strategy": "role",
        "role": "button",
        "name": "Sign in"
      },
      "retryOnValidationFailure": true,
      "retryAttempts": 5,
      "retryDelayMs": 1500,
      "validations": [
        {
          "$template": "textIsVisible",
          "params": {
            "text": "Continue with",
            "timeout": 5000
          }
        }
      ]
    }
  ]
}
```

Recommended command:

```bash
npx playwright test tests/data-driven.spec.ts -g "User Registration" --headed
```

This test starts clean, opens the app URL, and then executes the configured registration actions from JSON.

### Example 12: Conditional Action for Optional GitHub Verification

Use `conditional` when the application may show one screen in some runs and skip that screen in other runs.

Example use case:

```text
GitHub connection flow
  -> Sometimes shows Device verification screen
  -> Sometimes connects directly without OTP
```

The config can handle both paths:

```json
{
  "type": "conditional",
  "name": "Handle optional GitHub device verification",
  "condition": {
    "locator": {
      "strategy": "text",
      "text": "Device verification",
      "exact": true
    },
    "assertion": "visible",
    "timeout": 15000
  },
  "thenActions": [
    {
      "type": "fillEmailCodeAndSubmit",
      "name": "Read GitHub device verification code from email and verify",
      "expectedEmailSubject": "[GitHub] Please verify your device",
      "emailTo": "${tokens.symplrUserEmail}",
      "emailBodyContains": "Verification code:",
      "codePrefix": "Verification code:",
      "locator": {
        "strategy": "role",
        "role": "input",
        "name": "otp",
        "exact": true
      },
      "verifyButtonLocator": {
        "strategy": "role",
        "role": "button",
        "name": "Verify",
        "exact": true
      }
    }
  ],
  "elseActions": [
    {
      "validations": [
        {
          "$ref": "appDefinitionValidation"
        }
      ]
    }
  ]
}
```

Execution behavior:

```text
If "Device verification" appears within 15 seconds:
  run thenActions, such as reading the code from email and verifying it

If "Device verification" does not appear within 15 seconds:
  run elseActions. In this example the else action only contains validations, so it validates that the app is already back on the Blueprint page.
```

This avoids failing the test when both application paths are valid. Prefer `thenActions` and `elseActions` for new conditional flows. Each branch action can run a normal action, or it can be a validation-only block with a `validations` array.

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

Add normal test cases into an appropriate file under:

```text
test-data/test-cases/
```

Update the schema only when the framework supports a new type of configuration, such as:

- New action type
- New assertion type
- New locator strategy
- New top-level JSON section
- New required property

---

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
