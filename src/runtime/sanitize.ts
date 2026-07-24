const SENSITIVE_ASSIGNMENT = new RegExp(
  String.raw`\b(authorization|cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|secret|password)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)`,
  'gi',
);
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;

export function sanitizeSensitiveText(
  value: unknown,
  secrets: readonly string[] = [],
  maxLength = 240,
): string {
  let text = String(value ?? '')
    .replaceAll(/[\r\n\t]+/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();

  for (const secret of [...secrets].sort(
    (left, right) => right.length - left.length,
  )) {
    if (secret.length >= 4)
      text = text.replaceAll(secret, '[redacted]');
  }

  text = text
    .replaceAll(BEARER_TOKEN, 'Bearer [redacted]')
    .replaceAll(
      SENSITIVE_ASSIGNMENT,
      (_match, key: string, separator: string) =>
        `${key}${separator}[redacted]`,
    );

  return (text || 'Unknown error').slice(0, maxLength);
}
