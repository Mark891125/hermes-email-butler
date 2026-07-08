import type { CollectMailInput, CollectMailResult, MailProvider } from '../ports/mail-provider.js';

const MOCK_MAILS = [
  {
    externalId: 'mock-001',
    subject: 'Quarterly budget review',
    sender: 'finance@example.com',
    snippet: 'Please review the quarterly budget updates before Friday.'
  },
  {
    externalId: 'mock-002',
    subject: 'Customer escalation summary',
    sender: 'support@example.com',
    snippet: 'Two enterprise customers need follow-up on onboarding blockers.'
  },
  {
    externalId: 'mock-003',
    subject: 'Product launch checklist',
    sender: 'pm@example.com',
    snippet: 'Launch readiness notes and owner updates are attached.'
  }
];

export class MockMailProvider implements MailProvider {
  async collect(_input: CollectMailInput): Promise<CollectMailResult> {
    const now = Date.now();

    return {
      items: MOCK_MAILS.map((mail, index) => ({
        ...mail,
        provider: 'mock',
        receivedAt: new Date(now - index * 60 * 60 * 1000),
        status: 'pending'
      }))
    };
  }
}
