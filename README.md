# Symplr Config-Driven Playwright Automation

This project is a **config-driven Playwright UI automation framework** for Symplr.

Instead of writing a separate `.spec.ts` file for every test case, most test behavior is defined in JSON files under `test-data/`. The Playwright runner reads those JSON files and executes the configured test flows, actions, validations, downloads, email checks, GitHub-related flows, build/run flows, and QR-code validation.

---

## Table of Contents

1. [What this project does](#what-this-project-does)
2. [Technology stack](#technology-stack)
3. [Local PC setup](#local-pc-setup)
4. [Project setup](#project-setup)
5. [Pre-requisites](#pre-requisites)
6. [Environment variables](#environment-variables)
7. [Gmail API setup for email validation](#gmail-api-setup-for-email-validation)
8. [Authentication handling](#authentication-handling)
9. [How the framework works](#how-the-framework-works)
10. [Important folders and files](#important-folders-and-files)
11. [How to run the tests](#how-to-run-the-tests)
12. [How to add a new test case](#how-to-add-a-new-test-case)
13. [How to modify an existing test case](#how-to-modify-an-existing-test-case)
14. [How to reuse existing test cases](#how-to-reuse-existing-test-cases)
15. [Locator strategies](#locator-strategies)
16. [Actions and assertions](#actions-and-assertions)
17. [Best practices](#best-practices)
18. [Troubleshooting](#troubleshooting)

---

## What this project does

This framework automates Symplr web application behavior such as:

- opening the home page
- creating an app using:
  - template
  - Figma
  - prompt
- loading an existing app
- navigating the storyboard/dashboard screens:
  - Blueprint
  - Pages
  - Themes
  - Variables
  - Settings
- downloading app definition JSON
- validating downloaded files
- validating email-based download links
- validating GitHub connection flows
- building and running an app
- validating QR code generation

Most of this behavior is controlled by JSON configuration files, not custom test code.

---

## Technology stack

- **Node.js**
- **Playwright**
- **TypeScript**
- **dotenv**
- **Gmail API** for email validation

---

## Local PC setup

Install the following on your local machine:

### 1. Node.js
Recommended: **Node.js 20 or later**

Check version:

```bash
node -v
npm -v