#!/usr/bin/env node
import { cac } from 'cac';
import { z } from 'zod';

import { collectMails } from '../../core/collect-mails.js';
import { generateReport } from '../../core/generate-report.js';
import { listLatestReport } from '../../core/list-latest-report.js';
import { listTasks } from '../../core/list-tasks.js';
import { createAppContext } from '../../infra/app-context.js';
import { createMailProvider, createReportGenerator } from '../../infra/providers.js';

const cli = cac('hermes-data');

const printJson = (payload: unknown): void => {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
};

const withContext = async <T>(handler: (context: ReturnType<typeof createAppContext>) => Promise<T>): Promise<T> => {
  const context = createAppContext();
  try {
    return await handler(context);
  } finally {
    context.storage.close?.();
  }
};

const handleCliError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  printJson({ ok: false, error: message });
  process.exitCode = 1;
};

cli.command('version', 'Print version').action(() => {
  printJson({ name: 'hermes-data-gateway', version: '0.1.0' });
});

cli.command('health', 'Print health status').action(() => {
  printJson({ ok: true, service: 'hermes-data-gateway' });
});

cli
  .command('mails <command>', 'Mail commands')
  .option('--since <since>', 'Lookback window', { default: '24h' })
  .option('--provider <provider>', 'Mail provider', { default: 'mock' })
  .action(async (command: string, options) => {
    try {
      if (command !== 'collect') {
        throw new Error(`Unsupported mails command: ${command}`);
      }

      const parsed = z
        .object({
          since: z.string().min(1),
          provider: z.literal('mock')
        })
        .parse(options);

      await withContext(async ({ storage }) => {
        const result = await collectMails({
          since: parsed.since,
          source: parsed.provider,
          provider: createMailProvider(parsed.provider),
          storage
        });
        printJson({ ok: true, ...result });
      });
    } catch (error) {
      handleCliError(error);
    }
  });

cli
  .command('reports <command>', 'Report commands')
  .option('--source <source>', 'Report source', { default: 'mock' })
  .action(async (command: string, options) => {
    try {
      if (command === 'latest') {
        await withContext(async ({ storage }) => {
          printJson(await listLatestReport({ storage }));
        });
        return;
      }

      if (command !== 'generate') {
        throw new Error(`Unsupported reports command: ${command}`);
      }

      const parsed = z.object({ source: z.literal('mock') }).parse(options);

      await withContext(async ({ storage }) => {
        const result = await generateReport({
          source: parsed.source,
          storage,
          generator: createReportGenerator(parsed.source)
        });
        printJson({ ok: true, ...result });
      });
    } catch (error) {
      handleCliError(error);
    }
  });

cli.command('tasks <command>', 'Task commands').option('--limit <limit>', 'Max records', { default: '20' }).action(async (command: string, options) => {
  try {
    if (command !== 'list') {
      throw new Error(`Unsupported tasks command: ${command}`);
    }

    const parsed = z.object({ limit: z.coerce.number().int().positive().max(100) }).parse(options);
    await withContext(async ({ storage }) => {
      printJson(await listTasks({ storage, limit: parsed.limit }));
    });
  } catch (error) {
    handleCliError(error);
  }
});

cli.help();
cli.parse();
