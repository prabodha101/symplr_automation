// integrations/email/GmailInbox.ts
import fs from 'node:fs/promises';
import path from 'node:path';

export type WaitForGmailEmailOptions = {
  to?: string;
  from?: string;
  subjectContains?: string;
  bodyContains?: string;
  after?: Date;
  timeoutMs?: number;
  pollIntervalMs?: number;
};

export type ReceivedGmailEmail = {
  id: string;
  threadId?: string | null;
  subject: string;
  from: string;
  to: string;
  snippet: string;
  bodyText: string;
  bodyHtml: string;
  internalDate?: number;
};

type OAuthClientConfig = {
  client_id?: string;
  client_secret?: string;
  redirect_uris?: string[];
};

type OAuthCredentialsFile = {
  installed?: OAuthClientConfig;
  web?: OAuthClientConfig;
};

type OAuthTokenFile = {
  access_token?: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
};

type GmailHeader = {
  name?: string;
  value?: string;
};

type GmailMessagePart = {
  mimeType?: string;
  body?: {
    data?: string | null;
  };
  headers?: GmailHeader[];
  parts?: GmailMessagePart[];
};

type GmailMessage = {
  id?: string;
  threadId?: string | null;
  snippet?: string | null;
  internalDate?: string | null;
  payload?: GmailMessagePart;
};

type GmailListResponse = {
  messages?: Array<{
    id?: string;
    threadId?: string | null;
  }>;
};

type RefreshTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
  error_subtype?: string;
};

class GmailReauthorizationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailReauthorizationRequiredError';
  }
}

function quoteGmailQuery(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function decodeBase64Url(data?: string | null): string {
  if (!data) return '';
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function getHeader(headers: GmailHeader[] | undefined, name: string): string {
  const header = headers?.find(
    h => h.name?.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? '';
}

function extractBodyByMimeType(
  part: GmailMessagePart | undefined,
  mimeType: 'text/plain' | 'text/html'
): string {
  if (!part) return '';

  if (part.mimeType === mimeType && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  for (const child of part.parts ?? []) {
    const content = extractBodyByMimeType(child, mimeType);
    if (content) return content;
  }

  return '';
}

function extractBodyText(part?: GmailMessagePart): string {
  return extractBodyByMimeType(part, 'text/plain');
}

function extractBodyHtml(part?: GmailMessagePart): string {
  return extractBodyByMimeType(part, 'text/html');
}

function getCredentialsPath(): string {
  return (
    process.env.GMAIL_CREDENTIALS_PATH ??
    path.resolve(process.cwd(), 'secrets/credentials.json')
  );
}

function getTokenPath(): string {
  return (
    process.env.GMAIL_TOKEN_PATH ??
    path.resolve(process.cwd(), 'secrets/token.json')
  );
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

function buildReauthorizationMessage(
  tokenPath: string,
  reason: string,
  errorSubtype?: string
): string {
  const subtypeText = errorSubtype ? ` Error subtype: ${errorSubtype}.` : '';
  return [
    `Gmail reauthorization required. ${reason}.${subtypeText}`,
    '',
    'The stored Gmail refresh token can no longer be used, so it cannot be fixed by another automatic refresh.',
    '',
    'Fix:',
    '  1. Run: npm run gmail:auth',
    `  2. Sign in with the Gmail account used by GOOGLE_EMAIL.`,
    `  3. The script will recreate ${tokenPath}.`,
    '  4. Re-run the Playwright test.',
    '',
    'Tip: If your Google OAuth app is External + Testing, Google can expire refresh tokens after a short period. For stable test automation, move the OAuth app to Production or refresh the token regularly.',
  ].join('\n');
}

async function refreshGmailAccessToken(
  token: OAuthTokenFile,
  oauthConfig: OAuthClientConfig,
  tokenPath: string
): Promise<string> {
  if (!token.refresh_token) {
    throw new GmailReauthorizationRequiredError(
      buildReauthorizationMessage(
        tokenPath,
        `Token file at ${tokenPath} does not contain a refresh_token`
      )
    );
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: oauthConfig.client_id ?? '',
      client_secret: oauthConfig.client_secret ?? '',
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const refreshResult = (await response.json()) as RefreshTokenResponse;

  if (!response.ok || !refreshResult.access_token) {
    const googleError = `${refreshResult.error_description ?? refreshResult.error ?? ''}`.trim();
    const reason = googleError || `Failed to refresh Gmail access token. HTTP ${response.status}`;

    if (response.status === 400 || refreshResult.error === 'invalid_grant') {
      throw new GmailReauthorizationRequiredError(
        buildReauthorizationMessage(tokenPath, reason, refreshResult.error_subtype)
      );
    }

    throw new Error(`Failed to refresh Gmail access token. HTTP ${response.status}. ${googleError}`.trim());
  }

  const updatedToken: OAuthTokenFile = {
    ...token,
    access_token: refreshResult.access_token,
    token_type: refreshResult.token_type ?? token.token_type,
    scope: refreshResult.scope ?? token.scope,
    expiry_date: Date.now() + (refreshResult.expires_in ?? 3600) * 1000,
  };

  await fs.mkdir(path.dirname(tokenPath), { recursive: true });
  await fs.writeFile(tokenPath, JSON.stringify(updatedToken, null, 2));

  return updatedToken.access_token as string;
}

async function getGmailAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string> {
  const credentialsPath = getCredentialsPath();
  const tokenPath = getTokenPath();

  const credentials = await readJsonFile<OAuthCredentialsFile>(credentialsPath);
  const token = await readJsonFile<OAuthTokenFile>(tokenPath);

  const oauthConfig = credentials.installed ?? credentials.web;
  if (!oauthConfig?.client_id || !oauthConfig?.client_secret) {
    throw new Error(
      'Invalid Gmail OAuth credentials.json. Expected "installed" or "web" client config with client_id and client_secret.'
    );
  }

  const expiresAt = token.expiry_date ?? 0;
  const hasUsableAccessToken =
    token.access_token && expiresAt > Date.now() + 60_000;

  if (!options.forceRefresh && hasUsableAccessToken) {
    return token.access_token as string;
  }

  return refreshGmailAccessToken(token, oauthConfig, tokenPath);
}

async function fetchGmail<T>(
  accessToken: string,
  apiPath: string,
  params: Record<string, string | number | undefined> = {}
): Promise<{ response: Response; bodyText: string; parsedBody?: T }> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/${apiPath}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });

  const bodyText = await response.text();
  let parsedBody: T | undefined;

  if (bodyText) {
    try {
      parsedBody = JSON.parse(bodyText) as T;
    } catch {
      parsedBody = undefined;
    }
  }

  return { response, bodyText, parsedBody };
}

async function gmailGet<T>(
  apiPath: string,
  params: Record<string, string | number | undefined> = {}
): Promise<T> {
  let accessToken = await getGmailAccessToken();
  let result = await fetchGmail<T>(accessToken, apiPath, params);

  // If token.json had a stale expiry_date or Google invalidated only the access
  // token, force one refresh and retry the Gmail API call automatically.
  if (result.response.status === 401) {
    accessToken = await getGmailAccessToken({ forceRefresh: true });
    result = await fetchGmail<T>(accessToken, apiPath, params);
  }

  if (!result.response.ok) {
    throw new Error(
      `Gmail API request failed. HTTP ${result.response.status} ${result.response.statusText}. ${result.bodyText}`
    );
  }

  return (result.parsedBody ?? {}) as T;
}

function buildGmailQuery(options: WaitForGmailEmailOptions): string {
  const parts: string[] = ['in:inbox'];

  if (options.to) {
    parts.push(`to:${quoteGmailQuery(options.to)}`);
  }

  if (options.from) {
    parts.push(`from:${quoteGmailQuery(options.from)}`);
  }

  if (options.subjectContains) {
    parts.push(`subject:${quoteGmailQuery(options.subjectContains)}`);
  }

  if (options.after) {
    parts.push(`after:${Math.floor(options.after.getTime() / 1000)}`);
  }

  return parts.join(' ');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function waitForGmailEmail(
  options: WaitForGmailEmailOptions = {}
): Promise<ReceivedGmailEmail> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const pollIntervalMs = options.pollIntervalMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  const q = buildGmailQuery(options);

  while (Date.now() < deadline) {
    console.log(`Checking for email with query: ${q}`);

    const listResponse = await gmailGet<GmailListResponse>(
      'users/me/messages',
      {
        q,
        labelIds: 'INBOX',
        maxResults: 20,
      }
    );

    const messages = listResponse.messages ?? [];

    for (const message of messages) {
      if (!message.id) continue;

      const fullMessage = await gmailGet<GmailMessage>(
        `users/me/messages/${message.id}`,
        {
          format: 'full',
        }
      );

      const headers = fullMessage.payload?.headers;
      const subject = getHeader(headers, 'Subject');
      const from = getHeader(headers, 'From');
      const to = getHeader(headers, 'To');
      const bodyText = extractBodyText(fullMessage.payload);
      const bodyHtml = extractBodyHtml(fullMessage.payload);
      const snippet = fullMessage.snippet ?? '';

      if (
        options.subjectContains &&
        !subject.toLowerCase().includes(options.subjectContains.toLowerCase())
      ) {
        continue;
      }

      if (
        options.bodyContains &&
        !`${snippet}\n${bodyText}\n${bodyHtml}`
          .toLowerCase()
          .includes(options.bodyContains.toLowerCase())
      ) {
        continue;
      }

      return {
        id: fullMessage.id ?? '',
        threadId: fullMessage.threadId,
        subject,
        from,
        to,
        snippet,
        bodyText,
        bodyHtml,
        internalDate: fullMessage.internalDate
          ? Number(fullMessage.internalDate)
          : undefined,
      };
    }

    await sleep(pollIntervalMs);
  }

  throw new Error(
    `No matching email received within ${timeoutMs} ms. Query used: ${q}`
  );
}
