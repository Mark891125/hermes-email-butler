import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod';

import { collectMails } from '../../core/collect-mails.js';
import { createAppContext } from '../../infra/app-context.js';
import { loadConfig, type AppConfig } from '../../infra/config.js';
import type { AppLogger } from '../../infra/logger.js';
import { createMicrosoftMailProvider } from '../../infra/providers.js';
import type { Storage } from '../../ports/storage.js';

interface ApiDependencies {
  storage: Storage;
  config?: AppConfig;
  logger?: AppLogger;
}

const collectTaskSchema = z.object({}).strict();

export const createApiApp = (dependencies?: ApiDependencies): Hono => {
  const context = dependencies ? { ...dependencies, config: dependencies.config ?? loadConfig() } : createAppContext();
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, service: 'hermes-data-gateway' }));

  app.post('/tasks/collect-mails', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = collectTaskSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.flatten() }, 400);
    }

    const startedAt = Date.now();
    try {
      const result = await collectMails({
        source: 'microsoft',
        provider: createMicrosoftMailProvider({ config: context.config, storage: context.storage }),
        storage: context.storage
      });
      context.logger?.info({
        action: 'collect-mails',
        source: 'microsoft',
        status: 'success',
        durationMs: Date.now() - startedAt,
        input: parsed.data
      });
      return c.json({ ok: true, ...result });
    } catch (error) {
      context.logger?.error({
        action: 'collect-mails',
        source: 'microsoft',
        status: 'failed',
        durationMs: Date.now() - startedAt,
        input: parsed.data,
        error: error instanceof Error ? error.message : String(error)
      });
      return c.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  return app;
};

export const startApiServer = (): void => {
  const context = createAppContext();
  const app = createApiApp({ storage: context.storage, logger: context.logger });

  serve(
    {
      fetch: app.fetch,
      hostname: context.config.apiHost,
      port: context.config.apiPort
    },
    (info) => {
      context.logger.info({
        action: 'api-start',
        source: 'api',
        status: 'success',
        durationMs: 0,
        input: { host: info.address, port: info.port }
      });
    }
  );
};

if (import.meta.url === `file://${process.argv[1]}`) {
  startApiServer();
}
