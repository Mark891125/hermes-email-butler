import pino from 'pino';

import type { AppConfig } from './config.js';

export const createLogger = (config: Pick<AppConfig, 'logLevel'>) =>
  pino({
    level: config.logLevel,
    base: {
      service: 'hermes-data-gateway'
    }
  });

export type AppLogger = ReturnType<typeof createLogger>;
