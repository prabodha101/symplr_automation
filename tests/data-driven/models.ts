import type { FrameLocator, TestInfo } from '@playwright/test';
import type { AuthPageOptions, Locator, Page } from '../fixtures/app-fixtures';
import type { AppRunPage } from '../../pages/AppRunPage';

export type LocatorConfig = {
  strategy:
    | 'id'
    | 'role'
    | 'text'
    | 'label'
    | 'img'
    | 'placeholder'
    | 'altText'
    | 'title'
    | 'testId'
    | 'css'
    | 'xpath'
    | 'locator'
    | 'custom';
  id?: string;
  selector?: string;
  text?: string;
  role?: string;
  name?: string;
  exact?: boolean;
  level?: number;
  testId?: string;
  hasText?: string;
  nth?: number;
  first?: boolean;
  last?: boolean;
  locator?: string;
  value?: string;
  engine?: 'css' | 'xpath' | 'playwright';
  frameLocator?: string;
};

export type ActionConditionConfig = {
  locator: LocatorConfig;
  assertion?: 'visible' | 'hidden' | 'attached';
  timeout?: number | string;
};

export type ActionConfig = {
  type?:
    | 'click'
    | 'fill'
    | 'check'
    | 'uncheck'
    | 'hover'
    | 'press'
    | 'selectOption'
    | 'download'
    | 'clickAndSwitchToPopup'
    | 'switchToPopupPage'
    | 'waitForTimeout'
    | 'waitForLoadState'
    | 'downloadAppDefinition'
    | 'downloadCodeEmail'
    | 'connectToGitHubEmail'
    | 'fillEmailCodeAndSubmit'
    | 'conditional'
    | 'buildAndRunApp'
    | 'waitForBuildComplete'
    | 'openRunOnDeviceModal'
    | 'waitForQrCodeGenerated'
    | 'switchToMainPage'
    | 'switchToRunPage';
  name?: string;
  value?: string | number | boolean;
  valueEnv?: string;
  locator?: LocatorConfig;
  validations?: ValidationConfig[];
  postValidations?: ValidationConfig[];
  pageActions?: ActionConfig[];
  expectedExtension?: string;
  expectedFileNameContains?: string;
  validateJson?: boolean;
  minBytes?: number;
  saveAs?: string;
  timeout?: number;
  expectedEmailSubject?: string;
  emailFrom?: string;
  emailTo?: string;
  emailBodyContains?: string;
  pollIntervalMs?: number;
  codePrefix?: string;
  codeRegex?: string;
  codeRegexFlags?: string;
  verifyButtonLocator?: LocatorConfig;
  condition?: ActionConditionConfig;
  thenActions?: ActionConfig[];
  elseActions?: ActionConfig[];
  thenValidations?: ValidationConfig[];
  elseValidations?: ValidationConfig[];
  retryOnValidationFailure?: boolean;
  retryAttempts?: number;
  retryDelayMs?: number;
};

export type AssertionConfig = {
  type:
    | 'visible'
    | 'hidden'
    | 'attached'
    | 'enabled'
    | 'disabled'
    | 'editable'
    | 'checked'
    | 'unchecked'
    | 'empty'
    | 'textEquals'
    | 'textContains'
    | 'valueEquals'
    | 'attributeEquals'
    | 'countEquals'
    | 'countGreaterThan'
    | 'classContains'
    | 'cssEquals'
    | 'titleEquals'
    | 'titleContains'
    | 'urlEquals'
    | 'urlContains';
  expected?: string | number | boolean;
  expectedRegex?: string;
  flags?: string;
  attributeName?: string;
  cssName?: string;
  soft?: boolean;
  timeout?: number;
};

export type ValidationConfig = {
  name: string;
  locator: LocatorConfig;
  actions?: ActionConfig[];
  assertions: AssertionConfig[];
};

export type ValidationRef = {
  $ref: string;
};

export type ValidationTemplateRef = {
  $template: string;
  params?: Record<string, unknown>;
};

export type IncludeSection =
  | 'beforeValidateActions'
  | 'pageAssertions'
  | 'validations'
  | 'pageActions'
  | 'includeTestCases';

export type TestCaseInclude =
  | string
  | {
      name: string;
      sections?: IncludeSection[];
    };

export type ValidationTemplateDefinition =
  | ValidationConfig
  | ValidationConfig[]
  | {
      defaults?: Record<string, unknown>;
      template: ValidationConfig | ValidationConfig[];
    };

export type PageCase = {
  name: string;
  auth?: AuthPageOptions;
  enabled?: boolean;
  baseUrl?: string;
  path?: string;
  url?: string;
  navigationTimeout?: number;
  softAssertions?: boolean;
  beforeValidateActions?: ActionConfig[];
  pageActions?: ActionConfig[];
  pageAssertions?: AssertionConfig[];
  validations?: ValidationConfig[];
  includeTestCases?: TestCaseInclude[];
  prerequisiteTestCases?: TestCaseInclude[];
};

export type TestData = {
  defaults?: {
    baseUrl?: string;
    navigationTimeout?: number;
    softAssertions?: boolean;
  };
  imports?: string[];
  tokens?: Record<string, string>;
  validationSets?: Record<string, ValidationConfig | ValidationConfig[]>;
  validationTemplates?: Record<string, ValidationTemplateDefinition>;
  testCases: PageCase[];
};

export type RunContext = {
  mainPage: Page;
  activePage: Page;
  popupPage?: Page;
  runPage?: Page;
  appRunPage?: AppRunPage;
};

export type NormalizedTestCaseInclude = {
  name: string;
  sections: IncludeSection[];
};

export type LocatorRoot = Page | FrameLocator;

export type ActionExecutionParams = {
  context: RunContext;
  action: ActionConfig;
  defaultLocator?: Locator;
  testInfo?: TestInfo;
  pageCase?: PageCase;
};
