import type {MessageKey} from './i18n/index.js';

export interface ProviderCatalogEntry {
  descriptionKey: MessageKey;
  id: string;
  name: string;
}

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    id: 'codex',
    name: 'Codex',
    descriptionKey: 'provider.codex.description',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    descriptionKey: 'provider.copilot.description',
  },
  {
    id: 'zai',
    name: 'Z.ai',
    descriptionKey: 'provider.zai.description',
  },
  {
    id: 'opencode-go',
    name: 'OpenCode Go',
    descriptionKey: 'provider.opencode.description',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    descriptionKey: 'provider.deepseek.description',
  },
];
