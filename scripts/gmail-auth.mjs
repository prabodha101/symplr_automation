#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

function getCredentialsPath() {
  return process.env.GMAIL_CREDENTIALS_PATH ?? path.resolve(process.cwd(), 'secrets/credentials.json');
}

function getTokenPath() {
  return process.env.GMAIL_TOKEN_PATH ?? path.resolve(process.cwd(), 'secrets/token.json');
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function getOAuthConfig(credentials) {
  const oauthConfig = credentials.installed ?? credentials.web;
  if (!oauthConfig?.client_id || !oauthConfig?.client_secret) {
    throw new Error('Invalid credentials.json. Expected installed or web OAuth client with client_id and client_secret.');
  }
  return oauthConfig;
}

function getRedirectPath(redirectUri) {
  const url = new URL(redirectUri);
  return url.pathname || '/oauth2callback';
}

async function listenForAuthorizationCode(redirectUri) {
  const redirectUrl = new URL(redirectUri);
  const expectedPath = getRedirectPath(redirectUri);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const requestUrl = new URL(req.url ?? '/', redirectUri);

        if (requestUrl.pathname !== expectedPath) {
          res.writeHead(404, { 'content-type': 'text/plain' });
          res.end('Not found');
          return;
        }

        const error = requestUrl.searchParams.get('error');
        if (error) {
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end(`Google authorization failed: ${error}`);
          server.close();
          reject(new Error(`Google authorization failed: ${error}`));
          return;
        }

        const code = requestUrl.searchParams.get('code');
        if (!code) {
          res.writeHead(400, { 'content-type': 'text/plain' });
          res.end('No authorization code received.');
          server.close();
          reject(new Error('No authorization code received.'));
          return;
        }

        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<h1>Gmail authorization complete</h1><p>You can close this browser tab and return to the terminal.</p>');
        server.close();
        resolve(code);
      } catch (error) {
        server.close();
        reject(error);
      }
    });

    server.on('error', reject);
    server.listen(Number(redirectUrl.port), redirectUrl.hostname, () => {
      console.log(`Waiting for Google OAuth redirect at ${redirectUri}`);
    });
  });
}

async function exchangeCodeForToken({ code, oauthConfig, redirectUri, tokenPath }) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: oauthConfig.client_id,
      client_secret: oauthConfig.client_secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(`Failed to exchange Gmail authorization code. HTTP ${response.status}. ${JSON.stringify(result)}`);
  }

  if (!result.refresh_token) {
    throw new Error(
      'Google did not return a refresh_token. Re-run this command and make sure the OAuth URL includes access_type=offline and prompt=consent. If needed, revoke the app access from your Google Account and authorize again.'
    );
  }

  const token = {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    scope: result.scope,
    token_type: result.token_type,
    expiry_date: Date.now() + (result.expires_in ?? 3600) * 1000,
  };

  await fs.mkdir(path.dirname(tokenPath), { recursive: true });
  await fs.writeFile(tokenPath, `${JSON.stringify(token, null, 2)}\n`);

  return token;
}

async function main() {
  const credentialsPath = getCredentialsPath();
  const tokenPath = getTokenPath();
  const credentials = await readJson(credentialsPath);
  const oauthConfig = getOAuthConfig(credentials);
  const scopes = (process.env.GMAIL_SCOPES ?? DEFAULT_SCOPE)
    .split(/[\s,]+/)
    .map(scope => scope.trim())
    .filter(Boolean);

  const redirectUri = process.env.GMAIL_REDIRECT_URI ?? 'http://127.0.0.1:53682/oauth2callback';
  const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizationUrl.searchParams.set('client_id', oauthConfig.client_id);
  authorizationUrl.searchParams.set('redirect_uri', redirectUri);
  authorizationUrl.searchParams.set('response_type', 'code');
  authorizationUrl.searchParams.set('scope', scopes.join(' '));
  authorizationUrl.searchParams.set('access_type', 'offline');
  authorizationUrl.searchParams.set('prompt', 'consent');

  console.log('Open this URL in your browser, then approve Gmail access:');
  console.log('');
  console.log(authorizationUrl.toString());
  console.log('');

  const codePromise = listenForAuthorizationCode(redirectUri);
  const code = await codePromise;

  const token = await exchangeCodeForToken({ code, oauthConfig, redirectUri, tokenPath });

  console.log('');
  console.log(`Saved Gmail token to ${tokenPath}`);
  console.log(`Scopes: ${token.scope}`);
  console.log('You can now re-run the Playwright test.');
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
