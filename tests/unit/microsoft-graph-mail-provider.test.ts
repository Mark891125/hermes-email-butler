import { describe, expect, it } from 'vitest';

import { MicrosoftGraphMailProvider } from '../../src/infra/microsoft/graph-mail-provider.js';
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

const createTokenStorage = (token?: OAuthTokenRecord): Pick<Storage, 'getOAuthToken' | 'upsertOAuthToken'> => {
  let stored = token ?? {
    provider: 'microsoft',
    refreshToken: 'refresh-token',
    scope: 'offline_access User.Read Mail.Read',
    expiresAt: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z')
  };

  return {
    async getOAuthToken(provider) {
      return provider === stored.provider ? stored : null;
    },
    async upsertOAuthToken(input) {
      stored = {
        provider: input.provider,
        refreshToken: input.refreshToken,
        scope: input.scope ?? null,
        expiresAt: input.expiresAt ?? null,
        createdAt: stored.createdAt,
        updatedAt: new Date('2026-07-01T00:00:00.000Z')
      };
      return stored;
    }
  };
};

const graphMessage = (id: string) => ({
  id,
  conversationId: `conversation-${id}`,
  subject: `Subject ${id}`,
  from: { emailAddress: { name: `Sender ${id}`, address: `${id}@example.com` } },
  receivedDateTime: '2026-07-09T10:00:00Z',
  isRead: false,
  importance: 'normal',
  bodyPreview: `Preview ${id}`,
  body: { contentType: 'text', content: `Complete body ${id}` },
  hasAttachments: false
});

describe('MicrosoftGraphMailProvider', () => {
  it('starts a bounded Inbox delta query with selected mail fields', async () => {
    const requests: Request[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);

      if (request.url.includes('/oauth2/v2.0/token')) {
        return Response.json({ access_token: 'access-token', refresh_token: 'refresh-token-2', expires_in: 3600 });
      }

      return Response.json({ value: [], '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$deltatoken=done' });
    };

    const provider = new MicrosoftGraphMailProvider({
      config,
      storage: createTokenStorage() as Storage,
      fetchFn,
      now: () => new Date('2026-07-10T00:00:00.000Z')
    });

    await provider.collect({ initialWindowDays: 7, pageSize: 3 });

    const graphRequest = requests.find((request) => request.url.includes('graph.microsoft.com'));
    expect(graphRequest).toBeDefined();
    expect(graphRequest?.url).toContain('/me/mailFolders/Inbox/messages/delta');
    expect(graphRequest?.url).toContain('%24select=id%2CconversationId%2Csubject%2Cfrom%2CreceivedDateTime%2CisRead%2Cimportance%2CbodyPreview%2Cbody%2ChasAttachments');
    expect(graphRequest?.url).toContain('%24filter=receivedDateTime+ge+2026-07-03T00%3A00%3A00.000Z');
    expect(graphRequest?.url).toContain('%24orderby=receivedDateTime+desc');
    expect(graphRequest?.headers.get('Prefer')).toContain('odata.maxpagesize=3');
    expect(graphRequest?.headers.get('Prefer')).toContain('IdType="ImmutableId"');
    expect(graphRequest?.headers.get('Prefer')).toContain('outlook.body-content-type="text"');
  });

  it('returns plain-text body and attachment metadata without downloading attachment content', async () => {
    const requests: Request[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.url.includes('/oauth2/v2.0/token')) return Response.json({ access_token: 'access-token', expires_in: 3600 });
      if (request.url.includes('/attachments')) {
        return Response.json({
          value: [{ id: 'attachment-1', name: 'agenda.pdf', contentType: 'application/pdf', size: 2048 }]
        });
      }
      return Response.json({
        value: [{ ...graphMessage('mail-1'), hasAttachments: true }],
        '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$deltatoken=done'
      });
    };
    const provider = new MicrosoftGraphMailProvider({ config, storage: createTokenStorage() as Storage, fetchFn });

    const result = await provider.collect({ initialWindowDays: 7 });

    expect(result.items[0]).toMatchObject({
      bodyText: 'Complete body mail-1',
      attachments: [{ externalId: 'attachment-1', name: 'agenda.pdf', contentType: 'application/pdf', size: 2048 }]
    });
    expect(requests.find((request) => request.url.includes('/attachments'))?.url).toContain('%24select=id%2Cname%2CcontentType%2Csize');
  });

  it('follows nextLink pages and returns all message changes from the delta round', async () => {
    const graphUrls: string[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const request = new Request(input, init);

      if (request.url.includes('/oauth2/v2.0/token')) {
        return Response.json({ access_token: 'access-token', expires_in: 3600 });
      }

      graphUrls.push(request.url);
      if (graphUrls.length === 1) {
        return Response.json({
          value: [graphMessage('mail-1'), graphMessage('mail-2'), graphMessage('mail-3')],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$skiptoken=page-2'
        });
      }

      return Response.json({
        value: [graphMessage('mail-4'), graphMessage('mail-5'), graphMessage('mail-6')],
        '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$deltatoken=done'
      });
    };

    const provider = new MicrosoftGraphMailProvider({
      config,
      storage: createTokenStorage() as Storage,
      fetchFn,
      now: () => new Date('2026-07-10T00:00:00.000Z')
    });

    const result = await provider.collect({ initialWindowDays: 7, pageSize: 3 });

    expect(graphUrls).toHaveLength(2);
    expect(graphUrls[1]).toBe('https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$skiptoken=page-2');
    expect(result.items).toHaveLength(6);
    expect(result.deltaLink).toBe('https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$deltatoken=done');
  });

  it('uses the saved deltaLink for subsequent sync rounds', async () => {
    const graphUrls: string[] = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const request = new Request(input, init);

      if (request.url.includes('/oauth2/v2.0/token')) {
        return Response.json({ access_token: 'access-token', expires_in: 3600 });
      }

      graphUrls.push(request.url);
      return Response.json({
        value: [
          { id: 'mail-1', '@removed': { reason: 'deleted' } },
          { ...graphMessage('mail-2'), isRead: true, importance: 'high' }
        ],
        '@odata.deltaLink': 'https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$deltatoken=next'
      });
    };

    const provider = new MicrosoftGraphMailProvider({
      config,
      storage: createTokenStorage() as Storage,
      fetchFn,
      now: () => new Date('2026-07-10T00:00:00.000Z')
    });

    const result = await provider.collect({
      deltaLink: 'https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$deltatoken=previous',
      initialWindowDays: 7,
      pageSize: 3
    });

    expect(graphUrls).toEqual(['https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$deltatoken=previous']);
    expect(result.deletedMessageIds).toEqual(['mail-1']);
    expect(result.items[0]).toMatchObject({ messageId: 'mail-2', isRead: true, importance: 'high' });
  });

  it('explains Graph mail 401 failures as mailbox or consent problems', async () => {
    const fetchFn: typeof fetch = async (input, init) => {
      const request = new Request(input, init);

      if (request.url.includes('/oauth2/v2.0/token')) {
        return Response.json({ access_token: 'access-token', expires_in: 3600 });
      }

      return new Response('', { status: 401 });
    };

    const provider = new MicrosoftGraphMailProvider({
      config,
      storage: createTokenStorage() as Storage,
      fetchFn,
      now: () => new Date('2026-07-10T00:00:00.000Z')
    });

    await expect(provider.collect({ initialWindowDays: 7, pageSize: 3 })).rejects.toThrow(
      'Re-run `hd login` with an account that has an Exchange mailbox and Mail.Read consent.'
    );
  });
});
