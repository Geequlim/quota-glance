import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

import {
  parseDeepSeekResponse,
  selectActiveBalance,
} from '../.build-js/providers/deepseek/parser.js';
import {
  buildOpenCodeCookie,
  minimumLongTermRemaining,
  parseOpenCodePage,
} from '../.build-js/providers/opencode-go/parser.js';
import {
  classifyZaiWindow,
  parseZaiResponse,
  remainingPercentage,
} from '../.build-js/providers/zai/parser.js';
import {
  copilotQuotaPercent,
  isDisplayableCopilotQuota,
  parseCopilotResponse,
} from '../.build-js/providers/copilot/parser.js';
import {
  parseCodexErrorFallback,
  parseCodexResponses,
  remainingCodexPercent,
} from '../.build-js/providers/codex/parser.js';

const fixtures = path.join(process.cwd(), 'tests', 'fixtures');

test('DeepSeek parser normalizes balances and selects a useful currency', async () => {
  const payload = JSON.parse(
    await readFile(path.join(fixtures, 'deepseek-balance.json'), 'utf8'),
  );
  const data = parseDeepSeekResponse(payload);

  assert.equal(data.isAvailable, true);
  assert.equal(data.balances.length, 2);
  assert.equal(selectActiveBalance(data).currency, 'CNY');
  assert.equal(selectActiveBalance(data).totalBalance, '18.42');
});

test('Z.ai parser classifies 5-hour and 7-day quota windows', async () => {
  const payload = JSON.parse(
    await readFile(path.join(fixtures, 'zai-quota.json'), 'utf8'),
  );
  const data = parseZaiResponse(payload);

  assert.equal(data.level, 'PRO_PLAN');
  assert.equal(classifyZaiWindow(data.limits[0]), '5h');
  assert.equal(classifyZaiWindow(data.limits[1]), '7d');
  assert.equal(remainingPercentage(data.limits[0]), 65);
  assert.equal(remainingPercentage(data.limits[1]), 82);
});

test('OpenCode parser handles percentage-first and reset-first fields', async () => {
  const html = await readFile(path.join(fixtures, 'opencode-go.html'), 'utf8');
  const data = parseOpenCodePage(html, 1_000_000);

  assert.equal(data.rolling.usagePercent, 23.5);
  assert.equal(data.rolling.percentRemaining, 76.5);
  assert.equal(data.weekly.usagePercent, 41);
  assert.equal(data.weekly.resetAt, 346_600_000);
  assert.equal(data.monthly.percentRemaining, 92);
  assert.equal(minimumLongTermRemaining(data), 59);
});

test('OpenCode cookie accepts raw tokens and complete cookie headers', () => {
  assert.equal(buildOpenCodeCookie('raw-token'), 'auth=raw-token');
  assert.equal(
    buildOpenCodeCookie('auth=token; another=value'),
    'auth=token; another=value',
  );
});

test('OpenCode parser reports page structure changes as invalid response', () => {
  assert.throws(
    () => parseOpenCodePage('<html>changed</html>'),
    error => error.code === 'invalid-response' &&
      error.message.includes('Unable to parse'),
  );
});

test('Copilot parser normalizes known and future quota snapshots', async () => {
  const payload = JSON.parse(
    await readFile(path.join(fixtures, 'copilot-user.json'), 'utf8'),
  );
  const data = parseCopilotResponse(payload);

  assert.equal(data.login, 'octocat');
  assert.equal(data.plan, 'individual_pro');
  assert.equal(copilotQuotaPercent(data.quotas.premium_interactions), 75);
  assert.equal(copilotQuotaPercent(data.quotas.chat), 100);
  assert.equal(copilotQuotaPercent(data.quotas.completions), 80);
  assert.equal(data.quotas.future_quota.remaining, 42);
  assert.equal(
    isDisplayableCopilotQuota(data.quotas.premium_interactions),
    true,
  );
  assert.equal(isDisplayableCopilotQuota(data.quotas.chat), false);
});

test('Codex parser accepts rateLimitsByLimitId and legacy rateLimits', () => {
  const account = {
    account: {email: 'user@example.com', planType: 'plus'},
  };
  const bucket = {
    limitId: 'codex',
    planType: 'plus',
    primary: {
      usedPercent: 25,
      windowDurationMins: 300,
      resetsAt: 1_800_000_000,
    },
    secondary: {
      usedPercent: 40,
      windowDurationMins: 10080,
      resetsAt: 1_900_000_000,
    },
  };
  const modern = parseCodexResponses(account, {
    rateLimitsByLimitId: {codex: bucket},
  });
  const legacy = parseCodexResponses(account, {rateLimits: bucket});

  assert.equal(modern.email, 'user@example.com');
  assert.equal(modern.primary.durationMinutes, 300);
  assert.equal(remainingCodexPercent(modern.secondary), 60);
  assert.deepEqual(legacy, modern);
});

test('Codex parser extracts WHAM JSON from legacy RPC errors', () => {
  const body = {
    email: 'legacy@example.com',
    plan_type: 'team',
    rate_limit: {
      primary_window: {
        used_percent: 10,
        limit_window_seconds: 18000,
        reset_at: 1_800_000_000,
      },
      secondary_window: {
        used_percent: 30,
        limit_window_seconds: 604800,
        reset_at: 1_900_000_000,
      },
    },
  };
  const data = parseCodexErrorFallback(
    {message: `request failed body=${JSON.stringify(body)} tail`},
    {},
  );

  assert.equal(data.email, 'legacy@example.com');
  assert.equal(data.primary.durationMinutes, 300);
  assert.equal(remainingCodexPercent(data.secondary), 70);
});
