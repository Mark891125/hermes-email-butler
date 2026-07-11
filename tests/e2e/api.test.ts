import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApiApp } from '../../src/adapters/api/server.js';
import { createSqliteStorage } from '../../src/infra/db/client.js';
import type { Storage } from '../../src/ports/storage.js';

describe('API', () => {
  let dir: string;
  let storage: Storage;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hermes-data-api-test-'));
    storage = createSqliteStorage({ databasePath: join(dir, 'app.sqlite') });
  });

  afterEach(async () => {
    storage.close?.();
    await rm(dir, { recursive: true, force: true });
  });

  it('returns health JSON', async () => {
    const app = createApiApp({ storage });

    const response = await app.request('/health');
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, service: 'hermes-data-gateway' });
  });

  it('does not expose report or pending-mail routes over HTTP', async () => {
    const app = createApiApp({ storage });

    const reportResponse = await app.request('/reports/latest');
    const mailResponse = await app.request('/mails/pending');
    const generateResponse = await app.request('/tasks/generate-report', { method: 'POST' });

    expect(reportResponse.status).toBe(404);
    expect(mailResponse.status).toBe(404);
    expect(generateResponse.status).toBe(404);
  });

  it('rejects a provider parameter because mail sync is Microsoft-only', async () => {
    const app = createApiApp({ storage });

    const response = await app.request('/tasks/collect-mails', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'microsoft' })
    });

    expect(response.status).toBe(400);
  });

});
