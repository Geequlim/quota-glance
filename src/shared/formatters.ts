import type {Translator} from './i18n/index.js';

export function formatUpdatedAt(
  updatedAt: number | null,
  translator: Translator,
): string {
  if (updatedAt === null)
    return translator.t('time.never');

  const seconds = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (seconds < 45)
    return translator.t('time.justNow');
  if (seconds < 3600)
    return translator.t('time.minutesAgo', {
      count: Math.max(1, Math.round(seconds / 60)),
    });
  return translator.t('time.hoursAgo', {
    count: Math.max(1, Math.round(seconds / 3600)),
  });
}

export function formatResetAt(
  resetAt: number,
  translator: Translator,
): string {
  return new Date(resetAt).toLocaleString(translator.locale, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  });
}
