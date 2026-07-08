import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { z } from 'zod';

import { collectMails } from '../../core/collect-mails.js';
import { generateReport } from '../../core/generate-report.js';
import { listLatestReport } from '../../core/list-latest-report.js';
import { createAppContext } from '../../infra/app-context.js';
import type { AppLogger } from '../../infra/logger.js';
import { createMailProvider, createReportGenerator } from '../../infra/providers.js';
import type { Storage } from '../../ports/storage.js';

interface ApiDependencies {
  storage: Storage;
  logger?: AppLogger;
}

const collectTaskSchema = z.object({
  since: z.string().min(1).default('24h'),
  provider: z.literal('mock').default('mock')
});

const generateTaskSchema = z.object({
  source: z.literal('mock').default('mock')
});

export const createApiApp = (dependencies?: ApiDependencies): Hono => {
  const context = dependencies ?? createAppContext();
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, service: 'hermes-data-gateway' }));

  app.get('/reports/latest', async (c) => c.json(await listLatestReport({ storage: context.storage })));

  app.get('/mails/pending', async (c) => {
    const source = c.req.query('source');
    const mails = await context.storage.listPendingMails({ source, limit: 50 });
    return c.json({ mails });
  });

  app.post('/tasks/collect-mails', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = collectTaskSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.flatten() }, 400);
    }

    const startedAt = Date.now();
    try {
      const result = await collectMails({
        since: parsed.data.since,
        source: parsed.data.provider,
        provider: createMailProvider(parsed.data.provider),
        storage: context.storage
      });
      context.logger?.info({
        action: 'collect-mails',
        source: parsed.data.provider,
        status: 'success',
        durationMs: Date.now() - startedAt,
        input: parsed.data
      });
      return c.json({ ok: true, ...result });
    } catch (error) {
      context.logger?.error({
        action: 'collect-mails',
        source: parsed.data.provider,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        input: parsed.data,
        error: error instanceof Error ? error.message : String(error)
      });
      return c.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
    }
  });

  app.post('/tasks/generate-report', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = generateTaskSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ ok: false, error: parsed.error.flatten() }, 400);
    }

    const startedAt = Date.now();
    try {
      const result = await generateReport({
        source: parsed.data.source,
        storage: context.storage,
        generator: createReportGenerator(parsed.data.source)
      });
      context.logger?.info({
        action: 'generate-report',
        source: parsed.data.source,
        status: 'success',
        durationMs: Date.now() - startedAt,
        input: parsed.data
      });
      return c.json({ ok: true, ...result });
    } catch (error) {
      context.logger?.error({
        action: 'generate-report',
        source: parsed.data.source,
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
