import {
  englishMessages,
  type MessageKey,
  type Messages,
} from './en.js';
import {simplifiedChineseMessages} from './zh-cn.js';

export type Language = 'en' | 'zh-CN';
export type MessageParameters = Record<string, string | number>;

export interface Translator {
  readonly language: Language;
  readonly locale: 'en-US' | 'zh-CN';
  t(key: MessageKey, parameters?: MessageParameters): string;
}

export function resolveLanguage(languageNames: readonly string[]): Language {
  return languageNames.some(isSimplifiedChinese) ? 'zh-CN' : 'en';
}

export function createTranslatorForLanguage(language: Language): Translator {
  const messages: Messages = language === 'zh-CN'
    ? simplifiedChineseMessages
    : englishMessages;
  return {
    language,
    locale: language === 'zh-CN' ? 'zh-CN' : 'en-US',
    t: (key, parameters) => interpolate(messages[key], parameters),
  };
}

function isSimplifiedChinese(languageName: string): boolean {
  const normalized = languageName
    .replace(/\..*$/, '')
    .replaceAll('_', '-')
    .toLowerCase();
  return normalized === 'zh-cn' ||
    normalized.startsWith('zh-cn-') ||
    normalized === 'zh-sg' ||
    normalized.startsWith('zh-sg-') ||
    normalized === 'zh-hans' ||
    normalized.startsWith('zh-hans-');
}

function interpolate(
  template: string,
  parameters: MessageParameters | undefined,
): string {
  if (!parameters)
    return template;
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (match, key) =>
    key in parameters ? String(parameters[key]) : match);
}
