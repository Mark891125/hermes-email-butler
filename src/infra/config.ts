import { resolve } from 'node:path';

import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

loadDotEnv();

const ConfigSchema = z.object({
  HERMES_DATABASE_PATH: z.string().default('data/app.sqlite'),
  HERMES_API_HOST: z.string().default('127.0.0.1'),
  HERMES_API_PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.string().default('info'),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_TENANT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_REDIRECT_URI: z.string().default('http://localhost:3000/auth/callback'),
  MICROSOFT_GRAPH_SCOPES: z.string().default('offline_access User.Read Mail.Read')
});

export type AppConfig = {
  databasePath: string;
  apiHost: string;
  apiPort: number;
  logLevel: string;
  microsoft: {
    clientId?: string;
    tenantId?: string;
    clientSecret?: string;
    redirectUri: string;
    scopes: string;
  };
};

export const loadConfig = (): AppConfig => {
  const parsed = ConfigSchema.parse(process.env);

  return {
    databasePath: resolve(parsed.HERMES_DATABASE_PATH),
    apiHost: parsed.HERMES_API_HOST,
    apiPort: parsed.HERMES_API_PORT,
    logLevel: parsed.LOG_LEVEL,
    microsoft: {
      clientId: parsed.MICROSOFT_CLIENT_ID,
      tenantId: parsed.MICROSOFT_TENANT_ID,
      clientSecret: parsed.MICROSOFT_CLIENT_SECRET,
      redirectUri: parsed.MICROSOFT_REDIRECT_URI,
      scopes: parsed.MICROSOFT_GRAPH_SCOPES
    }
  };
};
