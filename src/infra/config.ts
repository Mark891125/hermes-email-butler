import { resolve } from 'node:path';

import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

loadDotEnv();

const ConfigSchema = z.object({
  HERMES_DATABASE_PATH: z.string().default('data/app.sqlite'),
  HERMES_API_HOST: z.string().default('127.0.0.1'),
  HERMES_API_PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.string().default('info')
});

export type AppConfig = {
  databasePath: string;
  apiHost: string;
  apiPort: number;
  logLevel: string;
};

export const loadConfig = (): AppConfig => {
  const parsed = ConfigSchema.parse(process.env);

  return {
    databasePath: resolve(parsed.HERMES_DATABASE_PATH),
    apiHost: parsed.HERMES_API_HOST,
    apiPort: parsed.HERMES_API_PORT,
    logLevel: parsed.LOG_LEVEL
  };
};
