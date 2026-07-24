import GLib from 'gi://GLib';

import {
  createTranslatorForLanguage,
  resolveLanguage,
  type Translator,
} from './language.js';

export type {
  Language,
  MessageParameters,
  Translator,
} from './language.js';
export type {MessageKey} from './en.js';
export {
  createTranslatorForLanguage,
  resolveLanguage,
} from './language.js';

export function createTranslator(): Translator {
  return createTranslatorForLanguage(
    resolveLanguage(GLib.get_language_names()),
  );
}
