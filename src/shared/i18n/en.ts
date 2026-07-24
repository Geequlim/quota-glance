export const englishMessages = {
  'app.name': 'Quota Glance',

  'status.syncing': 'Syncing',
  'status.empty': 'Empty',
  'status.error.one': '{count} error',
  'status.error.many': '{count} errors',
  'time.never': 'Never',
  'time.justNow': 'Just now',
  'time.minutesAgo': '{count} min ago',
  'time.hoursAgo': '{count} hr ago',

  'action.refresh': 'Refresh',
  'action.settings': 'Settings',
  'popup.chooseProviders': 'Choose providers in Settings',
  'popup.lastGoodData': 'Last good data',

  'prefs.providers.title': 'Providers',
  'prefs.providers.description':
    'Choose which services appear in the panel and popup.',
  'prefs.panel.title': 'Panel position',
  'prefs.panel.subtitle': 'Choose where Quota Glance appears',
  'prefs.panel.top': 'GNOME top panel',
  'prefs.panel.bottom': 'Dash to Panel bottom panel',
  'prefs.refresh.title': 'Refresh',
  'prefs.refresh.interval.title': 'Automatic refresh interval',
  'prefs.refresh.interval.subtitle': 'Minutes between quota updates',

  'provider.codex.description': 'Rate limits from the signed-in Codex CLI',
  'provider.copilot.description':
    'Premium requests from the signed-in GitHub CLI',
  'provider.zai.description': 'Coding Plan quota windows',
  'provider.deepseek.description': 'API account balance',
  'provider.opencode.description': 'Workspace usage limits',

  'provider.common.showingLastData': 'Showing last successful data',
  'provider.common.unknownAccount': 'Unknown account',
  'provider.common.unknownPlan': 'Unknown plan',
  'provider.common.unavailable': 'Unavailable',
  'provider.common.unlimited': 'Unlimited',
  'provider.common.used': '{value}% used',
  'provider.common.remaining': '{remaining} / {total} remaining',
  'provider.common.usageCount': '{value} used',
  'provider.common.plan': 'Plan {plan}',

  'provider.codex.account': 'Codex account',
  'provider.codex.unlimitedCredits': 'Unlimited credits',
  'provider.codex.credits': 'Credits: {value}',
  'provider.codex.window.5h': '5 hours',
  'provider.codex.window.7d': '7 days',
  'provider.codex.window.hours': '{count} hours',
  'provider.codex.window.days': '{count} days',

  'provider.copilot.metric.premium': 'Premium requests',
  'provider.copilot.metric.chat': 'Chat',
  'provider.copilot.metric.completions': 'Completions',

  'provider.zai.title': 'Z.ai Coding Plan',
  'provider.zai.window.5h': '5 hours',
  'provider.zai.window.7d': '7 days',
  'provider.zai.window.other': '{name}',

  'provider.deepseek.currencyBalance': '{currency} balance',
  'provider.deepseek.grantedTopup':
    'Granted {granted} · topped up {toppedUp}',

  'provider.opencode.metric.rolling': '5 hours',
  'provider.opencode.metric.weekly': '7 days',
  'provider.opencode.metric.monthly': 'Monthly',

  'error.missingConfig': 'Provider configuration is missing',
  'error.executableNotFound': 'Required command was not found',
  'error.notAuthenticated': 'Sign in to the provider CLI first',
  'error.cancelled': 'Refresh was cancelled',
  'error.timeout': 'Request timed out',
  'error.http': 'Network request failed',
  'error.invalidResponse': 'The provider returned an unexpected response',
  'error.processExited': 'The provider command failed',
  'error.internal': 'An unexpected error occurred',
  'error.zai.missingKey': 'Set Z_AI_API_KEY to enable Z.ai',
  'error.deepseek.missingKey': 'Set DEEPSEEK_API_KEY to enable DeepSeek',
  'error.opencode.missingWorkspace':
    'Set OPENCODE_GO_WORKSPACE_ID to enable OpenCode Go',
  'error.opencode.missingCookie':
    'Set OPENCODE_GO_AUTH_COOKIE to enable OpenCode Go',
  'error.codex.missingCli': 'Install and sign in to the Codex CLI',
  'error.copilot.missingCli': 'Install GitHub CLI (gh) to use Copilot',
} as const;

export type MessageKey = keyof typeof englishMessages;
export type Messages = Record<MessageKey, string>;
