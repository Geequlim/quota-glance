export const ENVIRONMENT_ALLOWLIST = [
  'PATH',
  'HTTP_PROXY',
  'http_proxy',
  'HTTPS_PROXY',
  'https_proxy',
  'NO_PROXY',
  'no_proxy',
  'GH_CONFIG_DIR',
  'Z_AI_API_KEY',
  'DEEPSEEK_API_KEY',
  'OPENCODE_GO_WORKSPACE_ID',
  'OPENCODE_GO_AUTH_COOKIE',
] as const;

export type EnvironmentKey = typeof ENVIRONMENT_ALLOWLIST[number];
export type RuntimeEnvironment = Partial<Record<EnvironmentKey, string>>;

const ALLOWED_KEYS = new Set<string>(ENVIRONMENT_ALLOWLIST);
const ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

export function parseEnvironmentFile(contents: string): RuntimeEnvironment {
  const result: RuntimeEnvironment = {};

  for (const sourceLine of contents.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith('#'))
      continue;

    const match = ASSIGNMENT.exec(line);
    if (!match || !ALLOWED_KEYS.has(match[1]))
      continue;

    const key = match[1] as EnvironmentKey;
    result[key] = unwrapMatchingQuotes(match[2].trim());
  }

  return result;
}

export function mergeEnvironmentSources(
  ...sourcesLowToHigh: readonly RuntimeEnvironment[]
): RuntimeEnvironment {
  return Object.assign({}, ...sourcesLowToHigh);
}

export function normalizeProxyVariables(
  environment: RuntimeEnvironment,
): RuntimeEnvironment {
  const normalized = {...environment};
  for (const [upper, lower] of [
    ['HTTP_PROXY', 'http_proxy'],
    ['HTTPS_PROXY', 'https_proxy'],
    ['NO_PROXY', 'no_proxy'],
  ] as const) {
    const value = normalized[upper] ?? normalized[lower];
    if (value === undefined)
      continue;
    normalized[upper] = value;
    normalized[lower] = value;
  }
  return normalized;
}

function unwrapMatchingQuotes(value: string): string {
  if (value.length < 2)
    return value;

  const first = value.at(0);
  const last = value.at(-1);
  return first === last && (first === '"' || first === "'")
    ? value.slice(1, -1)
    : value;
}
