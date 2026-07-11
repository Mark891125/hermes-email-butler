#!/usr/bin/env node
import { cac } from 'cac';
import { z } from 'zod';

import { claimReportTask } from '../../core/claim-report-task.js';
import { collectMails } from '../../core/collect-mails.js';
import { listTasks } from '../../core/list-tasks.js';
import { submitReportTask } from '../../core/submit-report-task.js';
import { createAppContext } from '../../infra/app-context.js';
import { getMicrosoftAuthenticatedUser, runMicrosoftLocalOAuthLogin } from '../../infra/microsoft/oauth.js';
import { createMicrosoftMailProvider } from '../../infra/providers.js';

const cli = cac('hd');

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

const readStandardInput = async (): Promise<string> => {
  if (process.stdin.isTTY) {
    throw new Error('Report summary must be provided through standard input');
  }
  let summary = '';
  for await (const chunk of process.stdin) summary += String(chunk);
  return summary;
};

cli.command('version', 'Print version').action(() => {
  printJson({ name: 'hermes-data-gateway', version: '0.1.0' });
});

cli.command('health', 'Print health status').action(() => {
  printJson({ ok: true, service: 'hermes-data-gateway' });
});

cli.command('sync', 'Synchronize Microsoft Inbox changes').action(async () => {
  try {
    await withContext(async ({ config, storage }) => {
      const result = await collectMails({
        source: 'microsoft',
        provider: createMicrosoftMailProvider({ config, storage }),
        storage
      });
      printJson({ ok: true, ...result });
    });
  } catch (error) {
    handleCliError(error);
  }
});

cli.command('login', 'Authenticate Microsoft Graph access').action(async () => {
  try {
    await withContext(async ({ config, storage }) => {
      const hasStoredToken = Boolean(await storage.getOAuthToken('microsoft'));
      if (hasStoredToken) {
        try {
          const user = await getMicrosoftAuthenticatedUser({ config, storage });
          printJson({ ok: true, provider: 'microsoft', user });
          return;
        } catch {
          // A stale token or an account without Inbox access must be re-authorized.
        }
      }

      await runMicrosoftLocalOAuthLogin({
        config,
        storage,
        writeLine: (line) => process.stdout.write(`${line}\n`)
      });

      const user = await getMicrosoftAuthenticatedUser({ config, storage });
      process.stdout.write(`Microsoft login successful: ${user.emailAddress}\n`);
      printJson({ ok: true, provider: 'microsoft', user });
    });
  } catch (error) {
    handleCliError(error);
  }
});

cli
  .command('reports <command> [taskId]', 'Claim mails or submit an Agent report')
  .option('--limit <limit>', 'Maximum mails to claim', { default: '50' })
  .action(async (command: string, taskId: string | undefined, options) => {
    try {
      if (command === 'claim') {
        const parsed = z.object({ limit: z.coerce.number().int().positive().max(100) }).parse(options);
        await withContext(async ({ storage }) => {
          const result = await claimReportTask({ storage, source: 'microsoft', limit: parsed.limit });
          printJson({ ok: true, task: result.task, mails: result.mails, expiredTaskCount: result.expiredTaskCount, operation: result.operation });
        });
        return;
      }

      if (command === 'submit') {
        if (!taskId) throw new Error('Report task ID is required');
        const summary = await readStandardInput();
        await withContext(async ({ storage }) => {
          const result = await submitReportTask({ storage, taskId, summary, source: 'microsoft' });
          printJson({ ok: true, ...result });
        });
        return;
      }

      throw new Error(`Unsupported reports command: ${command}`);
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
