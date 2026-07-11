import { describe, expect, it } from 'vitest';

import { buildMicrosoftAuthorizationUrl, getMicrosoftAuthenticatedUser } from '../../src/infra/microsoft/oauth.js';
import type { AppConfig } from '../../src/infra/config.js';
import type { OAuthTokenRecord, Storage } from '../../src/ports/storage.js';

const config: AppConfig = {
  databasePath: ':memory:',
  apiHost: '127.0.0.1',
  apiPort: 8787,
  logLevel: 'silent',
  microsoft: {
    clientId: 'client-id',
    tenantId: 'tenant-id',
    clientSecret: 'client-secret',
    redirectUri: 'http://localhost:3000/auth/callback',
    scopes: 'offline_access User.Read Mail.Read'
  }
};

const token: OAuthTokenRecord = {
  provider: 'microsoft',
  refreshToken: 'refresh-token',
  scope: 'offline_access User.Read Mail.Read',
  expiresAt: null,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-01T00:00:00.000Z')
};

const storage: Pick<Storage, 'getOAuthToken' | 'upsertOAuthToken'> = {
  async getOAuthToken() {
    return token;
  },
  async upsertOAuthToken(input) {
    return { ...token, ...input, updatedAt: new Date('2026-07-02T00:00:00.000Z') };
  }
};

describe('getMicrosoftAuthenticatedUser', () => {
  it('always prompts for account selection during Microsoft authorization', () => {
    const url = new URL(buildMicrosoftAuthorizationUrl(config, 'state'));

    expect(url.searchParams.get('prompt')).toBe('select_account');
  });

  it('refreshes the stored token and returns the Microsoft ID and mailbox address without accessing Inbox', async () => {
    const requests: Request[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);

      if (request.url.includes('/oauth2/v2.0/token')) {
        return Response.json({ access_token: 'access-token', expires_in: 3600 });
      }

      return Response.json({ id: 'user-id', mail: 'inbox@example.com', userPrincipalName: 'principal@example.com' });
    };

    const user = await getMicrosoftAuthenticatedUser({ config, storage, fetchFn });

    expect(user).toEqual({ id: 'user-id', emailAddress: 'inbox@example.com' });
    expect(requests.map((request) => request.url)).toContain('https://graph.microsoft.com/v1.0/me?$select=id,mail,otherMails,userPrincipalName');
    expect(requests.some((request) => request.url.includes('/me/mailFolders/Inbox'))).toBe(false);
  });

  it('uses the first alternate email address when Graph does not provide mail', async () => {
    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/oauth2/v2.0/token')) {
        return Response.json({ access_token: 'access-token', expires_in: 3600 });
      }

      return Response.json({ id: 'guest-id', otherMails: ['inbox@example.com'], userPrincipalName: 'guest#EXT#@tenant.onmicrosoft.com' });
    };

    const user = await getMicrosoftAuthenticatedUser({ config, storage, fetchFn });

    expect(user).toEqual({ id: 'guest-id', emailAddress: 'inbox@example.com' });
  });
});
