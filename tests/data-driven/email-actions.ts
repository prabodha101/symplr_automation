import type { TestInfo } from '@playwright/test';
import { expect } from '../fixtures/app-fixtures';
import { downloadZipFromEmailLink } from '../../integrations/email/GmailDownloadLink';
import { waitForGmailEmail, type ReceivedGmailEmail } from '../../integrations/email/GmailInbox';
import type { ActionConfig, RunContext } from './models';
import { getActivePage } from './context';
import { buildLocator, escapeRegExp } from './locator-utils';
import { validateDownloadedFile } from './downloads';

export async function runDownloadCodeEmailAction(
  context: RunContext,
  action: ActionConfig,
  testInfo: TestInfo,
): Promise<void> {
  const expectedEmailSubject = action.expectedEmailSubject ?? 'Download Code';
  const emailTo = action.emailTo ?? process.env.GOOGLE_EMAIL;
  const emailFrom = action.emailFrom ?? process.env.EMAIL_SENDER;

  if (!emailTo) {
    throw new Error('downloadCodeEmail requires GOOGLE_EMAIL in .env or "emailTo" in the action.');
  }

  const email = await waitForMatchingEmail(action, expectedEmailSubject, emailFrom, emailTo);
  expect(email.subject).toContain(expectedEmailSubject);

  const zipFilePath = testInfo.outputPath(action.saveAs ?? `email-download-${Date.now()}.zip`);
  const { savedFilePath } = await downloadZipFromEmailLink(email, zipFilePath, {
    request: getActivePage(context).context().request,
    timeoutMs: action.timeout ?? 180_000,
  });

  await validateDownloadedFile(savedFilePath, savedFilePath.split(/[\\/]/).pop() ?? savedFilePath, {
    ...action,
    expectedExtension: action.expectedExtension ?? '.zip',
    minBytes: action.minBytes ?? 1,
  });

  await testInfo.attach('downloaded-code-zip', {
    path: savedFilePath,
    contentType: 'application/zip',
  });
}

export async function runConnectToGitHubEmailAction(action: ActionConfig): Promise<void> {
  const expectedEmailSubject = action.expectedEmailSubject ?? 'Push Code Github';
  const emailTo = action.emailTo ?? process.env.GOOGLE_EMAIL;
  const emailFrom = action.emailFrom ?? process.env.EMAIL_SENDER;

  if (!emailTo) {
    throw new Error('connectToGitHubEmail requires GOOGLE_EMAIL in .env or "emailTo" in the action.');
  }

  const email = await waitForMatchingEmail(action, expectedEmailSubject, emailFrom, emailTo);
  expect(email.subject).toContain(expectedEmailSubject);
}

export async function runFillEmailCodeAndSubmitAction(context: RunContext, action: ActionConfig): Promise<void> {
  if (!action.locator) {
    throw new Error('fillEmailCodeAndSubmit action requires locator for the verification code input.');
  }
  if (!action.verifyButtonLocator) {
    throw new Error('fillEmailCodeAndSubmit action requires verifyButtonLocator.');
  }

  const expectedEmailSubject = action.expectedEmailSubject ?? '[GitHub] Please verify your device';
  const emailTo = action.emailTo ?? process.env.GOOGLE_EMAIL;

  if (!emailTo) {
    throw new Error('fillEmailCodeAndSubmit requires GOOGLE_EMAIL in .env or "emailTo" in the action.');
  }

  const email = await waitForMatchingEmail(
    action,
    expectedEmailSubject,
    action.emailFrom,
    emailTo,
    action.emailBodyContains ?? action.codePrefix ?? 'Verification code:',
  );
  expect(email.subject).toContain(expectedEmailSubject);

  const verificationCode = extractVerificationCodeFromEmail(email, action);
  const codeInput = buildLocator(getActivePage(context), action.locator);
  await codeInput.fill(verificationCode);
}

async function waitForMatchingEmail(
  action: ActionConfig,
  expectedEmailSubject: string,
  emailFrom: string | undefined,
  emailTo: string,
  bodyContains: string | undefined = action.emailBodyContains,
): Promise<ReceivedGmailEmail> {
  const sentAt = new Date(Date.now() - 10_000);
  return await waitForGmailEmail({
    from: emailFrom,
    to: emailTo,
    subjectContains: expectedEmailSubject,
    bodyContains,
    after: sentAt,
    timeoutMs: action.timeout ?? 180_000,
    pollIntervalMs: action.pollIntervalMs ?? 5_000,
  });
}

function extractVerificationCodeFromEmail(email: ReceivedGmailEmail, action: ActionConfig): string {
  const emailContent = [email.bodyText, htmlToPlainText(email.bodyHtml), email.snippet].filter(Boolean).join('\n');

  if (action.codeRegex) {
    const regex = new RegExp(action.codeRegex, action.codeRegexFlags ?? 'i');
    const match = regex.exec(emailContent);
    const code = match?.[1] ?? match?.[0];
    if (code?.trim()) return code.trim();

    throw new Error(`Could not extract verification code using codeRegex: ${action.codeRegex}`);
  }

  const codePrefix = action.codePrefix ?? 'Verification code:';
  const prefixRegex = new RegExp(`${escapeRegExp(codePrefix)}\\s*([A-Za-z0-9][A-Za-z0-9 _-]{2,30})`, 'i');
  const match = prefixRegex.exec(emailContent);
  const code = match?.[1]?.trim();

  if (!code) {
    throw new Error(`Could not find verification code in email body using prefix: ${codePrefix}`);
  }

  return code;
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
