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

  it('returns null latest report when none exists', async () => {
    const app = createApiApp({ storage });

    const response = await app.request('/reports/latest');
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ report: null });
  });
});
