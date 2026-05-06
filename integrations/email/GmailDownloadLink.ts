import fs from 'node:fs/promises';
import path from 'node:path';
import type { ReceivedGmailEmail } from './GmailInbox';

function decodeHtmlUrl(value: string): string {
  return value.replace(/&amp;/g, '&');
}

export function extractZipDownloadLinkFromEmail(
  email: Pick<ReceivedGmailEmail, 'bodyHtml' | 'bodyText' | 'snippet'>
): string {
  const htmlMatch = email.bodyHtml?.match(
    /href=["']([^"']+\.zip(?:\?[^"']*)?)["']/i
  );

  if (htmlMatch?.[1]) {
    return decodeHtmlUrl(htmlMatch[1]);
  }

  const textSource = `${email.bodyText ?? ''}\n${email.snippet ?? ''}`;
  const textMatch = textSource.match(/https?:\/\/\S+?\.zip(?:\?\S+)?/i);

  if (textMatch?.[0]) {
    return textMatch[0].replace(/[),.;]+$/, '');
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

export async function downloadZipFromEmailLink(
  email: Pick<ReceivedGmailEmail, 'bodyHtml' | 'bodyText' | 'snippet'>,
  destinationPath?: string
): Promise<{
  downloadUrl: string;
  savedFilePath: string;
}> {
  const downloadUrl = extractZipDownloadLinkFromEmail(email);
  console.log(`   >> Download url from email: ${downloadUrl}`)
  
  const response = await fetch(downloadUrl, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(
      `Failed to download file from email link. HTTP ${response.status} ${response.statusText}`
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) {
    throw new Error('Downloaded file is empty.');
  }

  const looksLikeZip = bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!looksLikeZip) {
    throw new Error('Downloaded file does not look like a ZIP archive.');
  }

  const finalPath =
    destinationPath ??
    path.resolve(process.cwd(), 'playwright-downloads', getZipFileNameFromUrl(downloadUrl));

  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  await fs.writeFile(finalPath, bytes);

  return {
    downloadUrl,
    savedFilePath: finalPath,
  };
}