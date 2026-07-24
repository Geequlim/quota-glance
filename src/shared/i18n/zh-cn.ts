import type {Messages} from './en.js';

export const simplifiedChineseMessages = {
  'app.name': '额度速览',

  'status.syncing': '正在同步',
  'status.empty': '暂无内容',
  'status.error.one': '{count} 个错误',
  'status.error.many': '{count} 个错误',
  'time.never': '从未',
  'time.justNow': '刚刚',
  'time.minutesAgo': '{count} 分钟前',
  'time.hoursAgo': '{count} 小时前',

  'action.refresh': '刷新',
  'action.settings': '设置',
  'popup.chooseProviders': '请在设置中选择供应商',
  'popup.lastGoodData': '上次成功数据',

  'prefs.providers.title': '供应商',
  'prefs.providers.description': '选择要在面板和展开菜单中显示的服务。',
  'prefs.panel.title': '面板位置',
  'prefs.panel.subtitle': '选择额度速览的显示位置',
  'prefs.panel.top': 'GNOME 顶部面板',
  'prefs.panel.bottom': 'Dash to Panel 底部面板',
  'prefs.refresh.title': '刷新',
  'prefs.refresh.interval.title': '自动刷新间隔',
  'prefs.refresh.interval.subtitle': '两次额度更新之间的分钟数',

  'provider.codex.description': '读取已登录 Codex CLI 的额度限制',
  'provider.copilot.description': '读取已登录 GitHub CLI 的高级请求额度',
  'provider.zai.description': 'Coding Plan 额度周期',
  'provider.deepseek.description': 'API 账户余额',
  'provider.opencode.description': '工作区用量限制',

  'provider.common.showingLastData': '正在显示上次成功获取的数据',
  'provider.common.unknownAccount': '未知账户',
  'provider.common.unknownPlan': '未知方案',
  'provider.common.unavailable': '不可用',
  'provider.common.unlimited': '无限',
  'provider.common.used': '已使用 {value}%',
  'provider.common.remaining': '剩余 {remaining} / {total}',
  'provider.common.usageCount': '已使用 {value}',
  'provider.common.plan': '{plan} 方案',

  'provider.codex.account': 'Codex 账户',
  'provider.codex.unlimitedCredits': '点数无限',
  'provider.codex.credits': '点数：{value}',
  'provider.codex.window.5h': '5小时',
  'provider.codex.window.7d': '7天',
  'provider.codex.window.hours': '{count}小时',
  'provider.codex.window.days': '{count}天',

  'provider.copilot.metric.premium': '高级请求',
  'provider.copilot.metric.chat': '对话',
  'provider.copilot.metric.completions': '代码补全',

  'provider.zai.title': 'Z.ai Coding Plan',
  'provider.zai.window.5h': '5小时',
  'provider.zai.window.7d': '7天',
  'provider.zai.window.other': '{name}',

  'provider.deepseek.currencyBalance': '{currency} 余额',
  'provider.deepseek.grantedTopup':
    '赠送余额 {granted} · 充值余额 {toppedUp}',

  'provider.opencode.metric.rolling': '5小时',
  'provider.opencode.metric.weekly': '7天',
  'provider.opencode.metric.monthly': '月度',

  'error.missingConfig': '缺少供应商配置',
  'error.executableNotFound': '未找到所需命令',
  'error.notAuthenticated': '请先登录供应商命令行工具',
  'error.cancelled': '刷新已取消',
  'error.timeout': '请求超时',
  'error.http': '网络请求失败',
  'error.invalidResponse': '供应商返回了非预期响应',
  'error.processExited': '供应商命令执行失败',
  'error.internal': '发生了意外错误',
  'error.zai.missingKey': '请设置 Z_AI_API_KEY 以启用 Z.ai',
  'error.deepseek.missingKey': '请设置 DEEPSEEK_API_KEY 以启用 DeepSeek',
  'error.opencode.missingWorkspace':
    '请设置 OPENCODE_GO_WORKSPACE_ID 以启用 OpenCode Go',
  'error.opencode.missingCookie':
    '请设置 OPENCODE_GO_AUTH_COOKIE 以启用 OpenCode Go',
  'error.codex.missingCli': '请安装并登录 Codex CLI',
  'error.copilot.missingCli': '请安装 GitHub CLI（gh）以使用 Copilot',
} satisfies Messages;
