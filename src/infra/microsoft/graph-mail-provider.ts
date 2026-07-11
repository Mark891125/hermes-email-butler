import type { AppConfig } from '../config.js';
import type { CollectMailInput, CollectMailResult, MailAttachment, MailImportance, MailItem, MailProvider } from '../../ports/mail-provider.js';
import type { Storage } from '../../ports/storage.js';
import { refreshMicrosoftAccessToken } from './oauth.js';

interface MicrosoftGraphMailProviderInput {
  config: AppConfig;
  storage: Pick<Storage, 'getOAuthToken' | 'upsertOAuthToken'>;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

interface GraphMessage {
  id: string;
  conversationId?: string;
  subject?: string;
  from?: {
    emailAddress?: {
      name?: string;
      address?: string;
    };
  };
  receivedDateTime?: string;
  isRead?: boolean;
  importance?: MailImportance;
  bodyPreview?: string;
  body?: {
    contentType?: string;
    content?: string;
  };
  hasAttachments?: boolean;
  '@removed'?: {
    reason?: string;
  };
}

interface GraphAttachment {
  id?: string;
  name?: string;
  contentType?: string;
  size?: number;
}

interface GraphDeltaResponse {
  value?: GraphMessage[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
}

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const PROVIDER = 'microsoft';
const FOLDER = 'Inbox';

const requireMicrosoftConfig = (config: AppConfig): Required<AppConfig['microsoft']> => {
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

const buildInitialDeltaUrl = (now: Date, initialWindowDays: number): string => {
  const since = new Date(now.getTime() - initialWindowDays * 24 * 60 * 60 * 1000);
  const url = new URL(`${GRAPH_BASE_URL}/me/mailFolders/${FOLDER}/messages/delta`);
  url.searchParams.set('$select', 'id,conversationId,subject,from,receivedDateTime,isRead,importance,bodyPreview,body,hasAttachments');
  url.searchParams.set('$filter', `receivedDateTime ge ${since.toISOString()}`);
  url.searchParams.set('$orderby', 'receivedDateTime desc');
  return url.toString();
};

const mapGraphMessage = (message: GraphMessage, attachments: MailAttachment[]): MailItem => {
  const fromName = message.from?.emailAddress?.name ?? '';
  const fromAddress = message.from?.emailAddress?.address ?? '';
  const sender = fromAddress || fromName;
  const bodyPreview = message.bodyPreview ?? '';

  return {
    externalId: message.id,
    messageId: message.id,
    conversationId: message.conversationId ?? '',
    provider: PROVIDER,
    subject: message.subject ?? '',
    sender,
    fromName,
    fromAddress,
    receivedAt: message.receivedDateTime ? new Date(message.receivedDateTime) : new Date(0),
    snippet: bodyPreview,
    bodyPreview,
    bodyText: message.body?.content ?? bodyPreview,
    attachments,
    isRead: Boolean(message.isRead),
    importance: message.importance ?? 'normal',
    isDeleted: false,
    deletedAt: null
  };
};

export class MicrosoftGraphMailProvider implements MailProvider {
  private readonly config: Required<AppConfig['microsoft']>;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;

  constructor(input: MicrosoftGraphMailProviderInput) {
    this.appConfig = input.config;
    this.config = requireMicrosoftConfig(input.config);
    this.storage = input.storage;
    this.fetchFn = input.fetchFn ?? fetch;
    this.now = input.now ?? (() => new Date());
  }

  private readonly storage: Pick<Storage, 'getOAuthToken' | 'upsertOAuthToken'>;
  private readonly appConfig: AppConfig;

  async collect(input: CollectMailInput): Promise<CollectMailResult> {
    const accessToken = await this.refreshAccessToken();
    let url = input.deltaLink ?? buildInitialDeltaUrl(this.now(), input.initialWindowDays ?? 7);
    const items: MailItem[] = [];
    const deletedMessageIds: string[] = [];
    let deltaLink: string | null = null;
    let pageCount = 0;

    while (url) {
      pageCount += 1;
      const response = await this.fetchFn(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Prefer: `odata.maxpagesize=${input.pageSize ?? 3}, IdType="ImmutableId", outlook.body-content-type="text"`
        }
      });

      if (!response.ok) {
        throw new Error(await this.formatGraphError(response));
      }

      const payload = (await response.json()) as GraphDeltaResponse;
      for (const message of payload.value ?? []) {
        if (message['@removed']) {
          deletedMessageIds.push(message.id);
          continue;
        }

        items.push(mapGraphMessage(message, await this.collectAttachmentMetadata(message, accessToken)));
      }

      if (payload['@odata.nextLink']) {
        url = payload['@odata.nextLink'];
        continue;
      }

      deltaLink = payload['@odata.deltaLink'] ?? null;
      url = '';
    }

    if (!deltaLink) {
      throw new Error('Microsoft Graph delta response did not include @odata.deltaLink');
    }

    return { items, deletedMessageIds, deltaLink, pageCount };
  }

  private async collectAttachmentMetadata(message: GraphMessage, accessToken: string): Promise<MailAttachment[]> {
    if (!message.hasAttachments || !message.id) return [];
    const url = new URL(`${GRAPH_BASE_URL}/me/messages/${message.id}/attachments`);
    url.searchParams.set('$select', 'id,name,contentType,size');
    const response = await this.fetchFn(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(await this.formatGraphError(response));
    const payload = (await response.json()) as { value?: GraphAttachment[] };
    return (payload.value ?? []).flatMap((attachment) => {
      if (!attachment.id) return [];
      return [{
        externalId: attachment.id,
        name: attachment.name ?? '',
        contentType: attachment.contentType ?? '',
        size: attachment.size ?? 0
      }];
    });
  }

  private async refreshAccessToken(): Promise<string> {
    return refreshMicrosoftAccessToken({ config: this.appConfig, storage: this.storage, fetchFn: this.fetchFn, now: this.now });
  }

  private async formatGraphError(response: Response): Promise<string> {
    const body = await response.text();
    const authHeader = response.headers.get('www-authenticate');

    if (response.status === 401) {
      return [
        'Microsoft Graph mail request failed: 401 Unauthorized.',
        'The OAuth token is valid, but Graph rejected the Mail API request.',
        'Re-run `hd login` with an account that has an Exchange mailbox and Mail.Read consent.',
        body ? `Response body: ${body}` : null,
        authHeader ? `WWW-Authenticate: ${authHeader}` : null
      ]
        .filter(Boolean)
        .join(' ');
    }

    return `Microsoft Graph delta request failed: ${response.status} ${body}`;
  }
}
