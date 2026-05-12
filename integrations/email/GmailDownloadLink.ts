import fs from 'node:fs/promises';
import path from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import type { ReceivedGmailEmail } from './GmailInbox';

type DownloadZipOptions = {
  request?: APIRequestContext;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

type HttpDownloadResult = {
  status: number;
  statusText: string;
  ok: boolean;
  url: string;
  headers: Record<string, string>;
  bytes: Buffer;
  bodyTextPreview?: string;
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#x3A;/gi, ':')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    );
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[\s"'<>),.;]+$/g, '');
}

function tryDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeDownloadUrl(rawUrl: string): string | null {
  const decoded = stripTrailingPunctuation(decodeHtmlEntities(rawUrl.trim()));
  if (!decoded) return null;

  try {
    const parsed = new URL(decoded);

    // Gmail and Google commonly wrap external links as:
    // https://www.google.com/url?q=<real-url>&sa=...
    if (
      parsed.hostname.endsWith('google.com') &&
      parsed.pathname === '/url'
    ) {
      const wrappedUrl = parsed.searchParams.get('q') ?? parsed.searchParams.get('url');
      if (wrappedUrl) return normalizeDownloadUrl(wrappedUrl);
    }

    // Microsoft Safe Links wrap the target in a url= query parameter.
    if (parsed.hostname.endsWith('safelinks.protection.outlook.com')) {
      const wrappedUrl = parsed.searchParams.get('url');
      if (wrappedUrl) return normalizeDownloadUrl(wrappedUrl);
    }

    // Some mail/security products use generic redirect query params.
    for (const paramName of ['target', 'redirect', 'redirectUrl', 'redirect_uri', 'u']) {
      const wrappedUrl = parsed.searchParams.get(paramName);
      if (wrappedUrl?.startsWith('http')) return normalizeDownloadUrl(wrappedUrl);
    }

    return parsed.toString();
  } catch {
    const decodedOnce = tryDecodeURIComponent(decoded);
    if (decodedOnce !== decoded && decodedOnce.startsWith('http')) {
      return normalizeDownloadUrl(decodedOnce);
    }
    return null;
  }
}

function scoreDownloadUrl(url: string): number {
  let score = 0;
  const lower = url.toLowerCase();

  try {
    const parsed = new URL(url);
    if (parsed.pathname.toLowerCase().endsWith('.zip')) score += 100;
    if ([...parsed.searchParams.values()].some(value => value.toLowerCase().includes('.zip'))) {
      score += 60;
    }
    if (lower.includes('download')) score += 20;
    if (lower.includes('.zip')) score += 10;
  } catch {
    if (lower.includes('.zip')) score += 10;
  }

  return score;
}

function collectCandidateLinks(
  email: Pick<ReceivedGmailEmail, 'bodyHtml' | 'bodyText' | 'snippet'>,
): string[] {
  const candidates: string[] = [];
  const html = email.bodyHtml ?? '';
  const text = `${email.bodyText ?? ''}\n${email.snippet ?? ''}`;

  for (const match of html.matchAll(/href=["']([^"']+)["']/gi)) {
    if (match[1]) candidates.push(match[1]);
  }

  for (const match of `${html}\n${text}`.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    if (match[0]) candidates.push(match[0]);
  }

  return [...new Set(candidates)]
    .map(candidate => normalizeDownloadUrl(candidate))
    .filter((candidate): candidate is string => Boolean(candidate));
}

export function extractZipDownloadLinkFromEmail(
  email: Pick<ReceivedGmailEmail, 'bodyHtml' | 'bodyText' | 'snippet'>,
): string {
  const candidates = collectCandidateLinks(email)
    .filter(candidate => candidate.toLowerCase().includes('.zip') || candidate.toLowerCase().includes('download'))
    .sort((a, b) => scoreDownloadUrl(b) - scoreDownloadUrl(a));

  if (candidates[0]) {
    return candidates[0];
  }

  throw new Error('Could not find a ZIP download link in the email body.');
}

function getZipFileNameFromUrl(downloadUrl: string): string {
  const pathname = new URL(downloadUrl).pathname;
  const fileName = path.basename(pathname);
  return fileName && fileName.toLowerCase().endsWith('.zip')
    ? fileName
    : 'downloaded-code.zip';
}

function getDefaultDownloadHeaders(downloadUrl: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: 'application/zip, application/octet-stream, */*',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  };

  const referer = process.env.APP_URL ?? process.env.BASE_URL;
  if (referer) {
    try {
      headers.referer = new URL(referer).origin;
    } catch {
      headers.referer = referer;
    }
  } else {
    try {
      headers.referer = new URL(downloadUrl).origin;
    } catch {
      // Ignore invalid referer fallback.
    }
  }

  return headers;
}

async function downloadWithPlaywrightRequest(
  request: APIRequestContext,
  downloadUrl: string,
  options: DownloadZipOptions,
): Promise<HttpDownloadResult> {
  const response = await request.get(downloadUrl, {
    timeout: options.timeoutMs ?? 180_000,
    headers: {
      ...getDefaultDownloadHeaders(downloadUrl),
      ...(options.headers ?? {}),
    },
    maxRedirects: 20,
    failOnStatusCode: false,
  });

  const bytes = await response.body();
  return {
    status: response.status(),
    statusText: response.statusText(),
    ok: response.ok(),
    url: response.url(),
    headers: response.headers(),
    bytes,
    bodyTextPreview: bytes.subarray(0, 500).toString('utf8'),
  };
}

async function downloadWithNativeFetch(
  downloadUrl: string,
  options: DownloadZipOptions,
): Promise<HttpDownloadResult> {
  const response = await fetch(downloadUrl, {
    redirect: 'follow',
    headers: {
      ...getDefaultDownloadHeaders(downloadUrl),
      ...(options.headers ?? {}),
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 180_000),
  });

  const bytes = Buffer.from(await response.arrayBuffer());
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    url: response.url,
    headers: responseHeaders,
    bytes,
    bodyTextPreview: bytes.subarray(0, 500).toString('utf8'),
  };
}

function findZipLinkInHtmlResponse(bodyTextPreview?: string): string | null {
  if (!bodyTextPreview) return null;

  const match = bodyTextPreview.match(/https?:\/\/[^\s"'<>]+\.zip(?:\?[^\s"'<>]+)?/i);
  return match?.[0] ? normalizeDownloadUrl(match[0]) : null;
}

function isZip(bytes: Buffer): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function buildDownloadFailureMessage(
  result: HttpDownloadResult,
  originalDownloadUrl: string,
): string {
  const contentType = result.headers['content-type'] ?? result.headers['Content-Type'] ?? 'unknown';
  const responseUrlChanged = result.url !== originalDownloadUrl;

  return [
    `Failed to download file from email link. HTTP ${result.status} ${result.statusText}`,
    `Content-Type: ${contentType}`,
    `Original link: ${originalDownloadUrl}`,
    responseUrlChanged ? `Final URL after redirects: ${result.url}` : '',
    '',
    'Common causes:',
    '  - The email contained a wrapped/tracking link instead of the real ZIP link.',
    '  - The download endpoint requires the logged-in browser session cookies.',
    '  - The signed download link expired or can only be used once.',
    '  - The server blocks non-browser requests and requires headers such as User-Agent or Referer.',
    '',
    'This helper now unwraps common mail redirect links and uses the Playwright browser context request when provided so Symplr session cookies are included.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function performDownload(
  downloadUrl: string,
  options: DownloadZipOptions,
): Promise<HttpDownloadResult> {
  const result = options.request
    ? await downloadWithPlaywrightRequest(options.request, downloadUrl, options)
    : await downloadWithNativeFetch(downloadUrl, options);

  if (result.ok && isZip(result.bytes)) {
    return result;
  }

  const nestedZipLink = findZipLinkInHtmlResponse(result.bodyTextPreview);
  if (nestedZipLink && nestedZipLink !== downloadUrl) {
    return options.request
      ? downloadWithPlaywrightRequest(options.request, nestedZipLink, options)
      : downloadWithNativeFetch(nestedZipLink, options);
  }

  return result;
}

export async function downloadZipFromEmailLink(
  email: Pick<ReceivedGmailEmail, 'bodyHtml' | 'bodyText' | 'snippet'>,
  destinationPath?: string,
  options: DownloadZipOptions = {},
): Promise<{
  downloadUrl: string;
  savedFilePath: string;
}> {
  const downloadUrl = extractZipDownloadLinkFromEmail(email);
  const result = await performDownload(downloadUrl, options);

  if (!result.ok) {
    throw new Error(buildDownloadFailureMessage(result, downloadUrl));
  }

  if (!result.bytes.length) {
    throw new Error('Downloaded file is empty.');
  }

  if (!isZip(result.bytes)) {
    const contentType = result.headers['content-type'] ?? result.headers['Content-Type'] ?? 'unknown';
    throw new Error(
      [
        'Downloaded file does not look like a ZIP archive.',
        `Content-Type: ${contentType}`,
        `Original link: ${downloadUrl}`,
        `Final URL after redirects: ${result.url}`,
        `Response preview: ${result.bodyTextPreview ?? ''}`,
      ].join('\n'),
    );
  }

  const finalPath =
    destinationPath ??
    path.resolve(process.cwd(), 'playwright-downloads', getZipFileNameFromUrl(downloadUrl));

  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  await fs.writeFile(finalPath, result.bytes);

  return {
    downloadUrl: result.url || downloadUrl,
    savedFilePath: finalPath,
  };
}
