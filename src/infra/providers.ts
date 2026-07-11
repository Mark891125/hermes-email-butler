import type { MailProvider } from '../ports/mail-provider.js';
import type { Storage } from '../ports/storage.js';
import type { AppConfig } from './config.js';
import { MicrosoftGraphMailProvider } from './microsoft/graph-mail-provider.js';

interface ProviderDependencies {
  config: AppConfig;
  storage: Storage;
}

export const createMicrosoftMailProvider = (dependencies: ProviderDependencies): MailProvider =>
  new MicrosoftGraphMailProvider({ config: dependencies.config, storage: dependencies.storage });
