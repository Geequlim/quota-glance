import type {UsageProvider} from '../core/provider.js';
import type {HttpClient} from '../runtime/http-client.js';
import type {RuntimeEnvironment} from '../runtime/environment-parser.js';
import {CommandRunner} from '../runtime/command-runner.js';
import {CodexProvider} from './codex/provider.js';
import {CopilotProvider} from './copilot/provider.js';
import {DeepSeekProvider} from './deepseek/provider.js';
import {OpenCodeGoProvider} from './opencode-go/provider.js';
import {ZaiProvider} from './zai/provider.js';
import type {Translator} from '../shared/i18n/index.js';

export function createProviders(
  http: HttpClient,
  environment: RuntimeEnvironment,
  translator: Translator,
): UsageProvider[] {
  const dependencies = {http, environment};
  return [
    new CodexProvider(new CommandRunner(environment), translator),
    new CopilotProvider(new CommandRunner(environment), translator),
    new ZaiProvider(dependencies, translator),
    new OpenCodeGoProvider(dependencies, translator),
    new DeepSeekProvider(dependencies, translator),
  ].sort((left, right) => left.order - right.order);
}
