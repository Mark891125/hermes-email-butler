import { loadConfig } from './config.js';
import { createSqliteStorage } from './db/client.js';
import { createLogger } from './logger.js';

export const createAppContext = () => {
  const config = loadConfig();
  const logger = createLogger(config);
  const storage = createSqliteStorage({ databasePath: config.databasePath });

  return { config, logger, storage };
};
