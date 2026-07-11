import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import type { AppConfig } from '../config.js';
import type { Storage } from '../../ports/storage.js';

interface TokenResponse {
  refresh_token?: string;
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface MicrosoftAuthResult {
  provider: 'microsoft';
  scope: string | null;
  expiresAt: Date | null;
}

export interface MicrosoftAuthenticatedUser {
  id: string;
  emailAddress: string;
}

interface MicrosoftUserResponse {
  id?: string;
  mail?: string;
  otherMails?: string[];
  userPrincipalName?: string;
}

const PROVIDER = 'microsoft';
const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

const terminalLink = (label: string, url: string): string => `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`;

export const requireMicrosoftOAuthConfig = (config: AppConfig): Required<AppConfig['microsoft']> => {
  const missing = [
    ['MICROSOFT_CLIENT_ID', config.microsoft.clientId],
    ['MICROSOFT_TENANT_ID', config.microsoft.tenantId],
    ['MICROSOFT_CLIENT_SECRET', config.microsoft.clientSecret]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing Microsoft configuration: ${missing.join(', ')}`);
  }

  return {
    clientId: config.microsoft.clientId,
    tenantId: config.microsoft.tenantId,
    clientSecret: config.microsoft.clientSecret,
    redirectUri: config.microsoft.redirectUri,
    scopes: config.microsoft.scopes
  } as Required<AppConfig['microsoft']>;
};

export const buildMicrosoftAuthorizationUrl = (config: AppConfig, state: string): string => {
  const microsoft = requireMicrosoftOAuthConfig(config);
  const url = new URL(`https://login.microsoftonline.com/${microsoft.tenantId}/oauth2/v2.0/authorize`);
  url.searchParams.set('client_id', microsoft.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', microsoft.redirectUri);
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', microsoft.scopes);
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('state', state);
  return url.toString();
};

export const refreshMicrosoftAccessToken = async (input: {
  config: AppConfig;
  storage: Pick<Storage, 'getOAuthToken' | 'upsertOAuthToken'>;
  fetchFn?: typeof fetch;
  now?: () => Date;
}): Promise<string> => {
  const microsoft = requireMicrosoftOAuthConfig(input.config);
  const fetchFn = input.fetchFn ?? fetch;
  const now = input.now ?? (() => new Date());
  const token = await input.storage.getOAuthToken(PROVIDER);

  if (!token) {
    throw new Error('Microsoft OAuth token not found. Run `hd login` first.');
  }

  const body = new URLSearchParams({
    client_id: microsoft.clientId,
    client_secret: microsoft.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: token.refreshToken,
    scope: microsoft.scopes
  });
  const response = await fetchFn(`https://login.microsoftonline.com/${microsoft.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const payload = (await response.json()) as TokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new Error(`Microsoft token refresh failed: ${payload.error_description ?? payload.error ?? response.statusText}`);
  }

  if (payload.refresh_token) {
    await input.storage.upsertOAuthToken({
      provider: PROVIDER,
      refreshToken: payload.refresh_token,
      scope: payload.scope ?? token.scope,
      expiresAt: payload.expires_in ? new Date(now().getTime() + payload.expires_in * 1000) : null
    });
  }

  return payload.access_token;
};

export const getMicrosoftAuthenticatedUser = async (input: {
  config: AppConfig;
  storage: Pick<Storage, 'getOAuthToken' | 'upsertOAuthToken'>;
  fetchFn?: typeof fetch;
  now?: () => Date;
}): Promise<MicrosoftAuthenticatedUser> => {
  const fetchFn = input.fetchFn ?? fetch;
  const accessToken = await refreshMicrosoftAccessToken(input);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const userResponse = await fetchFn(`${GRAPH_BASE_URL}/me?$select=id,mail,otherMails,userPrincipalName`, { headers });

  if (!userResponse.ok) {
    throw new Error(`Microsoft identity request failed: ${userResponse.status} ${await userResponse.text()}`);
  }

  const user = (await userResponse.json()) as MicrosoftUserResponse;
  const emailAddress = user.mail ?? user.otherMails?.find(Boolean) ?? user.userPrincipalName;
  if (!user.id || !emailAddress) {
    throw new Error('Microsoft identity response did not include an ID and mailbox address.');
  }

  return { id: user.id, emailAddress };
};

export const exchangeMicrosoftCode = async (input: {
  config: AppConfig;
  storage: Pick<Storage, 'upsertOAuthToken'>;
  code: string;
  fetchFn?: typeof fetch;
  now?: () => Date;
}): Promise<MicrosoftAuthResult> => {
  const microsoft = requireMicrosoftOAuthConfig(input.config);
  const fetchFn = input.fetchFn ?? fetch;
  const now = input.now ?? (() => new Date());
  const body = new URLSearchParams({
    client_id: microsoft.clientId,
    client_secret: microsoft.clientSecret,
    code: input.code,
    redirect_uri: microsoft.redirectUri,
    grant_type: 'authorization_code',
    scope: microsoft.scopes
  });

  const response = await fetchFn(`https://login.microsoftonline.com/${microsoft.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  const payload = (await response.json()) as TokenResponse;

  if (!response.ok || !payload.refresh_token) {
    throw new Error(`Microsoft authorization failed: ${payload.error_description ?? payload.error ?? response.statusText}`);
  }

  const expiresAt = payload.expires_in ? new Date(now().getTime() + payload.expires_in * 1000) : null;
  await input.storage.upsertOAuthToken({
    provider: PROVIDER,
    refreshToken: payload.refresh_token,
    scope: payload.scope ?? microsoft.scopes,
    expiresAt
  });

  return { provider: PROVIDER, scope: payload.scope ?? microsoft.scopes, expiresAt };
};

export const runMicrosoftLocalOAuthLogin = async (input: {
  config: AppConfig;
  storage: Pick<Storage, 'upsertOAuthToken'>;
  writeLine: (line: string) => void;
}): Promise<MicrosoftAuthResult> => {
  const microsoft = requireMicrosoftOAuthConfig(input.config);
  const redirectUrl = new URL(microsoft.redirectUri);
  const state = randomUUID();
  const authUrl = buildMicrosoftAuthorizationUrl(input.config, state);

  return await new Promise<MicrosoftAuthResult>((resolve, reject) => {
    let server: Server;
    const finish = (callback: () => void): void => {
      server.close(() => callback());
    };

    server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', microsoft.redirectUri);
      if (requestUrl.pathname !== redirectUrl.pathname) {
        response.writeHead(404).end('Not found');
        return;
      }

      const code = requestUrl.searchParams.get('code');
      const returnedState = requestUrl.searchParams.get('state');
      const error = requestUrl.searchParams.get('error');
      const errorDescription = requestUrl.searchParams.get('error_description');

      if (error) {
        response.writeHead(400).end('Microsoft authorization failed.');
        finish(() => reject(new Error(`Microsoft authorization failed: ${errorDescription ?? error}`)));
        return;
      }

      if (!code || returnedState !== state) {
        response.writeHead(400).end('Invalid Microsoft authorization response.');
        finish(() => reject(new Error('Invalid Microsoft authorization response')));
        return;
      }

      input.writeLine('Microsoft authorization callback received. Exchanging authorization code...');
      response.writeHead(200, { 'Content-Type': 'text/plain' }).end('Microsoft authorization complete. You can close this window.');
      exchangeMicrosoftCode({ config: input.config, storage: input.storage, code })
        .then((result) => {
          input.writeLine('Microsoft authorization completed. Reading the signed-in email address...');
          finish(() => resolve(result));
        })
        .catch((exchangeError: unknown) => finish(() => reject(exchangeError)));
    });

    server.once('error', reject);
    server.listen(Number(redirectUrl.port || 80), redirectUrl.hostname, () => {
      input.writeLine(
        [
          'Microsoft Graph authorization is required.',
          `Open in browser: ${terminalLink('Authorize Microsoft Graph access', authUrl)}`,
          `URL: ${authUrl}`,
          `Waiting for callback at ${microsoft.redirectUri}`
        ].join('\n')
      );
    });
  });
};
