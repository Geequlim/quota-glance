# Quota Glance for GNOME 项目规划

## 1. 项目定位

新建一个面向 GNOME Shell 的独立项目，以 TypeScript 开发 Quota Glance 扩展。

新项目不是现有 Cinnamon applet 的直接移植版本，而是基于相同产品目标和 provider 能力重新实现的 GNOME 原生扩展。现有 Cinnamon 项目继续独立维护，暂不建立双目标构建系统。

建议项目名称：

- 仓库名：`quota-glance`
- 扩展名称：`Quota Glance`
- UUID：`quota-glance@geequlim`

首个版本以当前开发环境中的 GNOME Shell 50 为目标。基础架构稳定后，再评估支持 GNOME Shell 48 和 49。

## 2. 项目目标

### 2.1 核心目标

- 在 GNOME 顶栏显示多个服务的剩余用量、配额或余额摘要。
- 点击顶栏入口后显示各 provider 的详细信息。
- 支持手动刷新和定时刷新。
- 支持启用或停用单个 provider。
- 刷新失败时保留最后一次成功快照。
- 使用纯 GJS/TypeScript 实现，不随扩展分发 Python 脚本。
- 使用 GNOME Shell 45 之后的标准 ES Modules。
- 正确清理定时器、信号、子进程、网络请求和 UI 对象。
- 生成可读、未压缩、可供 GNOME Extensions 审核的 JavaScript。

### 2.2 首批 provider

- Codex
- GitHub Copilot
- Z.ai
- DeepSeek
- OpenCode Go

### 2.3 暂不纳入首版

- 从用户配置目录动态加载任意 JavaScript provider。
- Cinnamon 和 GNOME 的统一源码构建。
- GNOME Quick Settings 集成。
- 在扩展内管理 API Key 或执行登录流程。
- 绕过 `codex` 和 `gh` CLI 自行实现其认证协议。
- GNOME Shell 45 之前的兼容支持。

## 3. 技术决策

### 3.1 技术栈

- TypeScript
- GJS
- GNOME Shell ES Modules
- `St`、`Clutter`、`GObject`
- `Gio`、`GLib`
- LibSoup 3
- GSettings
- Oxlint
- `tsc` 或轻量、无压缩的构建脚本

避免引入 Webpack、大型运行时或难以审查的 bundle。构建产物应保留模块结构、源文件边界和可读的函数名。

### 3.2 数据采集方式

| Provider | 实现方式 | 外部依赖 |
| --- | --- | --- |
| DeepSeek | LibSoup 3 HTTP 请求 | API Key |
| Z.ai | LibSoup 3 HTTP 请求 | API Key |
| OpenCode Go | LibSoup 3 HTTP 请求 | Workspace ID、Cookie |
| GitHub Copilot | `Gio.Subprocess` 执行 `gh api` | 已登录的 `gh` CLI |
| Codex | `Gio.Subprocess` 启动 `codex app-server`，通过 stdio 执行 JSON-RPC | 已登录的 `codex` CLI |

“纯 GJS”表示扩展自身不包含或调用 Python collector；Codex 和 Copilot 仍允许调用用户已经安装和登录的官方 CLI。

### 3.3 凭据策略

首版沿用环境变量和外部 CLI 登录状态：

- `Z_AI_API_KEY`
- `DEEPSEEK_API_KEY`
- `OPENCODE_GO_WORKSPACE_ID`
- `OPENCODE_GO_AUTH_COOKIE`
- `codex` CLI 登录状态
- `gh` CLI 登录状态

扩展不得将密钥写入日志或通知。错误信息在展示前应清理请求头、Cookie、Token 和响应中的敏感字段。

如果桌面会话没有继承 shell 环境，可以读取以下位置：

- `/etc/environment`
- `~/.config/environment.d/*.conf`
- `~/.config/quota-glance/env`

不建议默认启动交互式 shell 读取环境，因为这会增加延迟、不可预测输出和命令执行风险。

## 4. 架构原则

### 4.1 Provider 不直接创建 GNOME UI

Provider 负责：

- 获取原始数据。
- 将响应转换为稳定的数据模型。
- 根据状态生成 panel、tooltip 和 popup view model。

GNOME 宿主负责：

- 创建和销毁 `St.Widget`。
- 渲染 panel、tooltip 和 popup。
- 管理菜单交互。
- 管理通知、设置和生命周期。

这样可以避免业务计算与 GNOME Shell 控件深度耦合，也为未来复用到 Cinnamon 保留可能性。

### 4.2 建议的数据契约

```ts
export type ProviderPhase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error';

export interface ProviderState<TData> {
  id: string;
  enabled: boolean;
  phase: ProviderPhase;
  data: TData | null;
  lastSuccessfulData: TData | null;
  error: ProviderError | null;
  updatedAt: number | null;
}

export interface PanelItem {
  type: 'icon' | 'text' | 'separator' | 'badge';
  text?: string;
  iconPath?: string;
  priority: number;
}

export interface TooltipSection {
  title: string;
  lines: string[];
}

export interface MetricViewModel {
  id: string;
  label: string;
  value: string;
  progress?: number;
  detail?: string;
  resetAt?: number;
  tone?: 'green' | 'blue' | 'amber' | 'neutral';
}

export type ProviderErrorCode =
  | 'missing-config'
  | 'executable-not-found'
  | 'not-authenticated'
  | 'timeout'
  | 'http'
  | 'invalid-response'
  | 'process-exited'
  | 'internal';

export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  debugMessage?: string;
  retryable: boolean;
}

export interface ProviderViewModel {
  title: string;
  subtitle?: string;
  badge?: string;
  metrics: MetricViewModel[];
  details: string[];
  footer?: string;
  phase: ProviderPhase;
  stale: boolean;
  error?: ProviderError;
}

export interface UsageProvider<TData> {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly enabledByDefault: boolean;

  collect(cancellable: Gio.Cancellable): Promise<TData>;
  getPanelItems(state: ProviderState<TData>): PanelItem[];
  getTooltipSections(state: ProviderState<TData>): TooltipSection[];
  getPopupViewModel(state: ProviderState<TData>): ProviderViewModel;
  dispose(): void;
}
```

具体实现可以对字段做调整，但需要保持以下边界：

- collector 不访问 UI。
- renderer 不发起网络请求。
- provider 不直接管理全局刷新定时器。
- controller 不理解 provider 私有响应格式。
- 多窗口或多额度通过 `metrics` 表达，不为单个 provider 定制宿主 UI。
- `lastSuccessfulData` 被使用时必须显式标记 `stale`，不能伪装成本轮成功数据。
- 用户错误使用稳定的错误码和简短文案，详细错误只进入清理后的日志。

### 4.3 生命周期

`extension.ts` 只负责 GNOME Extension 的入口生命周期：

```text
enable()
  ├─ 创建 settings
  ├─ 创建 controller
  ├─ 创建 panel indicator
  ├─ 注册 provider
  ├─ 连接信号
  └─ 启动刷新计划

disable()
  ├─ 停止所有 GLib source
  ├─ 取消 Gio.Cancellable
  ├─ 终止仍在运行的子进程
  ├─ 断开全部信号
  ├─ dispose providers
  ├─ destroy indicator/menu
  └─ 清空所有对象引用
```

模块加载和扩展类构造期间不得创建 GObject、连接信号或修改 GNOME Shell。

## 5. 推荐目录

```text
quota-glance/
├── src/
│   ├── extension.ts
│   ├── core/
│   │   ├── controller.ts
│   │   ├── scheduler.ts
│   │   ├── state-store.ts
│   │   ├── provider.ts
│   │   ├── types.ts
│   │   └── errors.ts
│   ├── host/
│   │   ├── panel-indicator.ts
│   │   ├── popup-view.ts
│   │   ├── tooltip.ts
│   │   ├── notifications.ts
│   │   └── settings.ts
│   ├── runtime/
│   │   ├── http-client.ts
│   │   ├── subprocess.ts
│   │   ├── environment.ts
│   │   ├── redaction.ts
│   │   └── logger.ts
│   ├── providers/
│   │   ├── registry.ts
│   │   ├── codex/
│   │   │   ├── provider.ts
│   │   │   ├── app-server-client.ts
│   │   │   ├── model.ts
│   │   │   └── strings.ts
│   │   ├── copilot/
│   │   ├── deepseek/
│   │   ├── zai/
│   │   └── opencode-go/
│   ├── ui/
│   │   ├── provider-card.ts
│   │   ├── progress-meter.ts
│   │   └── styles.ts
│   └── shared/
│       ├── formatters.ts
│       └── i18n.ts
├── schemas/
│   └── org.gnome.shell.extensions.quota-glance.gschema.xml
├── assets/
├── types/
│   └── gnome-shell/
├── metadata.json
├── stylesheet.css
├── tsconfig.json
├── package.json
├── LICENSE
└── README.md
```

是否加入 `prefs.ts` 可以在核心功能稳定后决定。首版也可以直接在 popup 菜单内完成 provider 启停，只用 GSettings 保存状态。

## 6. 核心模块职责

### 6.1 Controller

- 保存 provider 注册表。
- 协调单次刷新。
- 防止重复刷新。
- 并发刷新已启用 provider。
- 将结果写入 State Store。
- 刷新结束后触发统一渲染。
- 产生手动刷新结果通知。

Controller 不应持有 `St.Widget`。

### 6.2 State Store

- 初始化 provider 状态。
- 标记 loading、ready 和 error。
- 保存最后一次成功数据。
- 计算最近更新时间。
- 保存 provider 是否启用。

首版状态仅保存在内存；启用状态和刷新间隔写入 GSettings。

### 6.3 Scheduler

- 初次启用后延迟刷新。
- 按 GSettings 的间隔刷新。
- 设置变化时重建 timer。
- `disable()` 时无条件移除 GLib source。

### 6.4 HTTP Client

- 基于 LibSoup 3。
- 支持 GET、POST 和自定义请求头。
- 支持超时和 `Gio.Cancellable`。
- 检查 HTTP 状态码。
- 统一 JSON 解码和错误格式。
- 使用系统代理配置。
- 禁止记录敏感请求头。

### 6.5 Subprocess Runtime

- 只接受 argv 数组，不拼接 shell 命令。
- 使用 `Gio.Subprocess` 和管道。
- 支持 stdout、stderr 和退出码。
- 支持超时与取消。
- `disable()` 时终止未退出进程。
- 对进程输出设置合理的大小上限。

### 6.6 Environment Loader

- 读取允许列表中的环境变量。
- 解析简单的 `KEY=VALUE` 格式。
- 支持代理变量大小写归一化。
- 合并规则必须确定且可测试。
- 不执行环境文件中的命令或变量展开。

## 7. Provider 实现要求

### 7.1 DeepSeek、Z.ai、OpenCode Go

这三个 provider 应首先实现，用来验证：

- LibSoup 请求封装。
- 环境变量加载。
- JSON 数据归一化。
- provider 状态和 popup 渲染。
- 错误清理与超时。

每个 provider 的网络响应类型与 UI view model 分开定义。

### 7.2 GitHub Copilot

通过以下等价命令获取数据：

```text
gh api -H ... /copilot_internal/user
```

实现要求：

- 启动前检查 `gh` 是否可执行。
- 不自行读取 GitHub token。
- 设置超时。
- 正确解析非零退出码和 stderr。
- 对 quota snapshot 做稳定的类型归一化。

### 7.3 Codex

通过以下方式获取数据：

```text
codex app-server --listen stdio://
```

需要实现一个受控的 JSON-RPC client：

- 启动并跟踪子进程。
- 逐行读取 stdout JSON。
- 独立读取 stderr，避免管道阻塞。
- 发送 `initialize` 和 `initialized`。
- 调用 `account/read`。
- 调用 `account/rateLimits/read`。
- 根据 request ID 匹配响应。
- 忽略或处理与当前请求无关的通知。
- 支持请求超时、取消和进程退出。
- 保留当前兼容旧响应格式的 fallback。
- 网络瞬时错误允许有限次数重试。
- `disable()` 时必须终止 app-server。

Codex provider 是首版技术风险最高的部分，应单独测试，不应与 UI 开发交织。

## 8. 设置模型

建议首版 GSettings keys：

```xml
<key name="refresh-interval-minutes" type="i">
  <default>5</default>
</key>

<key name="enabled-providers" type="as">
  <default>['codex', 'copilot', 'zai', 'deepseek', 'opencode-go']</default>
</key>

<key name="codex-show-primary-window" type="b">
  <default>false</default>
</key>
```

刷新间隔运行时仍应限制在 `1–240` 分钟，即使 GSettings 中出现异常值也不能直接使用。

不要把 API Key、Cookie 或访问令牌放进普通 GSettings。

## 9. UI 方案

首版使用独立的 GNOME Panel Indicator，而不是 Quick Settings：

- Panel 中显示第一个启用 provider 的图标。
- 后面显示 provider contribution 排序后的文本。
- 左键打开详情 popup。
- Popup 顶部显示整体同步状态和刷新间隔。
- 中间按顺序显示启用 provider 的卡片。
- 底部提供刷新操作和 provider 启停开关。

需要验证：

- 深色和浅色主题。
- GNOME 默认主题下的间距。
- 125%、150%、200% 缩放。
- 超长账号名和错误信息。
- 没有 provider、首次加载、部分失败和全部失败状态。

样式尽量使用 GNOME 主题颜色和透明度，避免写死亮色背景或正文颜色。

## 10. 错误处理

错误分为：

- 配置缺失。
- 外部命令缺失。
- 未登录。
- 网络超时。
- HTTP 错误。
- 响应格式错误。
- 子进程异常退出。
- 扩展内部错误。

展示给用户的错误应简短、可行动，例如：

- `codex executable not found`
- `GitHub CLI is not logged in`
- `DEEPSEEK_API_KEY is not configured`
- `Request timed out`

完整错误写入日志，但必须经过敏感信息清理。provider 刷新失败不得清空最后一次成功快照。

## 11. 测试策略

### 11.1 纯逻辑测试

优先覆盖：

- provider 响应归一化。
- 配额百分比计算。
- 时间格式化。
- provider 状态转换。
- JSON-RPC 消息匹配。
- fallback 响应提取。
- 环境文件解析。
- 敏感信息清理。

这些模块应尽量避免直接依赖 GNOME Shell UI，以便通过普通 GJS 或 JavaScript 测试运行。

### 11.2 集成测试

- Mock HTTP 服务器测试 LibSoup collector。
- Fake subprocess 测试 stdout、stderr、超时和取消。
- Fake Codex app-server 测试消息乱序、通知、错误和进程退出。
- GSettings 默认值和变化信号。

### 11.3 GNOME Shell 验证

- 扩展可安装、启用、禁用和再次启用。
- 重复执行 enable/disable 不残留 panel item。
- 禁用时没有残留子进程。
- 禁用时没有残留 GLib source。
- 锁屏和解锁后行为符合默认 `user` session mode。
- GNOME Shell 日志没有 critical warning。

首个正式版本至少在 GNOME Shell 50 上完成全部验证。声明支持其他版本前，应在对应版本中实际测试。

## 12. 构建与发布

建议 npm scripts：

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "oxlint --deny-warnings src scripts tests",
    "build": "node scripts/build.mjs",
    "package": "node scripts/package.mjs",
    "install:local": "node scripts/install-local.mjs",
    "test": "node scripts/test.mjs"
  }
}
```

构建步骤：

1. TypeScript 类型检查。
2. 编译为 GNOME Shell 可加载的 ESM。
3. 复制 `metadata.json`、stylesheet、schemas 和 assets。
4. 校验 metadata 和 schema。
5. 生成标准 ZIP。

发布包中只包含运行所需文件，不包含 TypeScript 源码、测试、开发配置、安装脚本或未使用资源。是否附带 source map 需要根据 GNOME Extensions 审核习惯再决定。

## 13. Agent 工作包

工作包按依赖关系组织。每个 Agent 应只修改分配给自己的文件范围，并以对应验收条件作为完成标准。

### W0：项目骨架

目标：

- TypeScript 可编译为 GNOME ESM。
- 扩展可安装、启用和禁用。
- Panel Indicator 和空 popup 可显示。
- 本地开发脚本可用。

验收：

- GNOME Shell 50 无加载错误。
- 连续启停五次无残留 indicator。

### W1：核心状态与宿主

目标：

- Controller、State Store、Scheduler。
- Panel Indicator、popup 和基本卡片 UI。
- 手动刷新和定时刷新。
- 定义供 provider 使用的稳定接口。

验收：

- 使用 fake provider 可以完成完整刷新和渲染。
- 部分失败不影响其他 provider。
- 失败后保留最后成功快照。

### W2：HTTP Runtime 与 HTTP provider

目标：

- HTTP Client、Environment Loader。
- DeepSeek、Z.ai、OpenCode Go。
- 统一 HTTP 错误和敏感信息清理。

验收：

- 三个 provider 可独立启停。
- HTTP 超时和取消可以稳定复现并正确处理。
- 请求日志和错误信息不包含密钥或 Cookie。

### W3：Subprocess Runtime 与 Copilot

目标：

- 通用 Subprocess Runtime。
- `gh api` collector。
- Copilot panel、tooltip 和 popup model。

验收：

- 缺少 `gh`、未登录、超时和成功状态都能正确展示。
- 禁用扩展时可取消正在运行的命令。

### W4：Codex

目标：

- Codex app-server JSON-RPC client。
- 账户、rate limit、fallback 和重试。
- Codex panel、tooltip 和 popup model。

验收：

- 正常响应和 fallback 响应都能解析。
- 超时后进程能被终止。
- 连续刷新不会遗留 app-server。

### W5：设置与产品完善

目标：

- GSettings schema。
- Provider 启停。
- 刷新间隔。
- Codex 主窗口显示选项。
- 中英文文案。
- 完整错误清理。

验收：

- 设置在扩展重启后保留。
- 设置变化无需重启 GNOME Shell。

### W6：测试与发布准备

目标：

- GNOME 50 完整回归。
- Oxlint 和类型检查清零。
- README、安装、隐私和依赖说明。
- 生成可提交 ZIP。
- 对照 GNOME Extensions Review Guidelines 自检。

验收：

- 安装包中不包含 Python。
- JavaScript 未压缩、未混淆且可读。
- 所有对象、信号、定时器和进程均在 `disable()` 中清理。

### 工作包依赖

```text
W0
├─ W1
│  ├─ W2
│  ├─ W3
│  │  └─ W4
│  └─ W5
└──────── W6（持续接入，最终收口）
```

W2 与 W3 可以在 W1 的接口稳定后并行执行。W4 复用 W3 的 Subprocess Runtime。W5 可以在 provider 接口稳定后与 W2、W3 并行。W6 中的测试应随各工作包持续补充，最终由单独的集成任务完成全量验证。

## 14. 详细实施方案

### 14.1 总体迁移策略

本项目采用“GNOME 原生重写、复用旧版业务语义”的方式实施，不逐行翻译 Cinnamon 代码。

从旧项目复用：

- 五个 provider 的响应字段、归一化规则和显示顺序。
- 百分比、余额、计划名称、重置时间等格式化规则。
- Codex app-server 调用顺序、旧响应 fallback 和瞬时错误判定。
- Copilot quota snapshot 数据结构。
- provider 图标、文案及刷新失败后保留最后成功快照的产品行为。

必须重写：

- `appletCore.js` 及 Cinnamon Applet 生命周期。
- Cinnamon 的 Panel、Popup、Tooltip、Settings 宿主。
- `imports.*`、CommonJS `require()` 和动态 provider 加载。
- 全部 Python collector。
- 基于 Cinnamon `Util.spawnCommandLineAsyncIO` 的进程调用。
- provider 内直接创建 `St.Widget` 的渲染代码。
- Cinnamon 专用 CSS、右键菜单和设置存储。

迁移时应以旧代码和旧 collector 的输出作为 fixture 来源，而不是让新代码在运行时依赖旧项目。

### 14.2 目标运行结构

```text
Extension
  ├─ SettingsAdapter
  ├─ EnvironmentLoader
  ├─ ProviderRegistry（静态注册）
  ├─ StateStore
  ├─ RefreshController
  │    ├─ HttpClient
  │    ├─ CommandRunner
  │    └─ CodexAppServerClient
  ├─ Scheduler
  └─ PanelIndicator
       ├─ PanelRenderer
       ├─ PopupRenderer
       └─ TooltipRenderer
```

对象依赖方向固定为：

```text
extension -> host/controller -> provider/runtime -> pure model/shared
```

底层模块不得反向引用上层模块：

- `shared` 和 provider model 不导入 GNOME Shell UI。
- runtime 不引用具体 provider。
- provider 不引用 Controller、Scheduler 或 Widget。
- Controller 只通过 `UsageProvider` 接口调用 provider。
- UI 只消费 Store snapshot 和 Provider view model。

### 14.3 TypeScript 与构建约定

采用 `tsc` 直接编译，不使用 bundler：

- 使用 TypeScript 7 稳定版和 Oxlint，不保留 ESLint 兼容层。
- `package.json` 设置 `"type": "module"`。
- `module` 和 `moduleResolution` 使用 `NodeNext`。
- `target` 使用 GNOME Shell 50 当前支持的现代 ECMAScript 目标。
- TypeScript 源码中的相对导入写 `.js` 后缀。
- 使用 `@girs/gjs` 和 `@girs/gnome-shell` 提供类型。
- `strict` 开启，构建产物不压缩、不混淆。
- `rootDir` 为 `src`，保持输出目录中的模块结构。
- 纯逻辑模块不得产生 `gi://` runtime import，以便用 Node 直接测试。
- GNOME 类型如 `Gio.Cancellable` 应通过接口边界或 `import type` 隔离。

建议构建目录：

```text
build/
└── quota-glance@geequlim/
    ├── extension.js
    ├── metadata.json
    ├── stylesheet.css
    ├── schemas/
    ├── assets/
    ├── core/
    ├── host/
    ├── runtime/
    └── providers/
```

ZIP 根目录必须直接包含 `extension.js` 和 `metadata.json`，不能再嵌套一层 UUID 目录。

### 14.4 Extension 生命周期实现

`extension.ts` 默认导出继承 GNOME `Extension` 的类，不在构造函数或模块顶层创建运行时对象。

`enable()` 顺序：

1. 读取 GSettings。
2. 创建 Environment Loader。
3. 创建 HTTP、Subprocess runtime。
4. 静态创建 provider registry。
5. 初始化 State Store。
6. 创建 Controller 和 Scheduler。
7. 创建 Panel Indicator。
8. 连接 Store、Settings 和菜单信号。
9. 启动一次延迟刷新。

`disable()` 顺序：

1. 将 extension/controller 标记为 disposed。
2. 停止初次刷新和周期刷新 GLib source。
3. 取消当前刷新使用的 `Gio.Cancellable`。
4. 终止所有仍在运行的子进程和 Codex app-server。
5. 断开 Settings、Store、菜单和 Actor 信号。
6. 调用所有 provider 的 `dispose()`。
7. 销毁 Indicator、Popup 和 Tooltip。
8. 清空对象引用。

每次刷新分配单调递增的 generation ID。异步操作完成时必须同时检查：

- Controller 尚未 disposed。
- generation 仍是当前刷新代次。
- provider 仍处于启用状态。

任何一项不满足都丢弃结果，防止扩展禁用或设置变化后的旧请求回写 Store 或访问已销毁 UI。

### 14.5 State Store 与刷新状态机

Store 应提供不可变 snapshot 或只读视图，状态转换只能通过明确方法执行：

```text
idle -> loading -> ready
idle -> loading -> error
ready -> loading -> ready
ready -> loading -> error(stale=true)
error -> loading -> ready
```

规则：

- `markLoading()` 不清除最后成功数据。
- `markReady()` 同时更新当前数据和最后成功数据。
- `markError()` 清除本轮当前数据，但保留最后成功数据。
- UI 获取有效数据时使用 `data ?? lastSuccessfulData`。
- 使用 `lastSuccessfulData` 时，view model 的 `stale` 必须为 `true`。
- 禁用 provider 不删除其内存快照；重新启用后立即单独刷新。
- 只有 enabled provider 参与 panel、tooltip 和 popup 汇总。

### 14.6 Controller 刷新语义

Controller 对外提供：

```ts
refreshAll(options?: { manual?: boolean }): Promise<RefreshSummary>;
refreshProvider(providerId: string): Promise<RefreshResult>;
cancelCurrentRefresh(): void;
dispose(): void;
```

行为约定：

- 已有全量刷新运行时，不再启动第二轮全量刷新。
- 用户重复点击手动刷新时给出“刷新进行中”反馈。
- 全量刷新通过 `Promise.allSettled()` 并发采集所有 enabled provider。
- 每个 provider 完成后立即更新 Store，使 UI 不必等待最慢请求。
- 单个 provider 失败不影响其他 provider。
- provider 开启时只刷新该 provider，不强制刷新全部服务。
- 手动刷新完成后汇总成功数、失败数；自动刷新不弹普通成功通知。
- Store 更新和 UI render 由订阅关系连接，Controller 不持有 `St.Widget`。

### 14.7 Scheduler

Scheduler 只管理刷新时间，不执行 provider 逻辑：

- enable 后延迟 8–12 秒执行首次刷新。
- 周期值从 GSettings 读取，并限制在 1–240 分钟。
- 设置变化时先移除旧 source，再创建新 source。
- 使用 GLib timeout API，不使用废弃的 `Mainloop`。
- 保存每个 source ID，dispose 时逐一移除并清零。
- 回调捕获异常并记录，不能让异常退出 GNOME Shell 主循环。

### 14.8 Environment Loader

只读取以下 allowlist：

- `PATH`
- `HTTP_PROXY` / `http_proxy`
- `HTTPS_PROXY` / `https_proxy`
- `NO_PROXY` / `no_proxy`
- `Z_AI_API_KEY`
- `DEEPSEEK_API_KEY`
- `OPENCODE_GO_WORKSPACE_ID`
- `OPENCODE_GO_AUTH_COOKIE`

建议优先级从高到低：

```text
~/.config/quota-glance/env
> 当前 GNOME 会话环境
> ~/.config/environment.d/*.conf
> /etc/environment
```

解析约束：

- 只接受简单 `KEY=VALUE` 和可选的 `export KEY=VALUE`。
- 支持空行和以 `#` 开头的注释。
- 支持去除一层匹配的单引号或双引号。
- 不执行命令、不做 `$VAR` 展开、不处理 shell substitution。
- 不把未知键加入子进程环境。
- 日志只记录环境来源和缺失键名，不记录值。
- PATH 查找应使用最终合并环境，而不是只使用 GNOME Shell 原始 PATH。

### 14.9 HTTP Runtime

`HttpClient` 基于 LibSoup 3，建议接口：

```ts
interface HttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: Uint8Array | string;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}
```

实现要求：

- 使用异步 API 和 `Gio.Cancellable`。
- 超时通过独立 cancellable/timer 落实，不能只依赖调用方。
- 检查 HTTP 状态码并限制响应体大小。
- JSON 解析错误映射为 `invalid-response`。
- 错误响应正文先截断、单行化、清理敏感信息再展示。
- `Authorization`、`Cookie`、API Key 永不写入日志。
- 复用一个受控的 Soup Session，并在 dispose 时取消相关请求。
- 保留系统代理行为。

### 14.10 HTTP Provider 迁移

#### DeepSeek

第一优先实现，用于打通最简单的 HTTP 完整链路：

- 请求 `https://api.deepseek.com/user/balance`。
- 使用 `DEEPSEEK_API_KEY`。
- 归一化 `is_available` 和 balance infos。
- Panel 展示首个有效币种余额。
- Popup 展示各币种总余额、赠送余额和充值余额。

#### Z.ai

- 请求 `https://api.z.ai/api/monitor/usage/quota/limit`。
- 使用 `Z_AI_API_KEY`。
- 原样保留 limit type/unit/number/usage/currentValue/percentage/reset time。
- parser 独立于 collector，并使用旧响应 fixture 测试。
- 对 5h、7d 等窗口分类逻辑编写单元测试。

#### OpenCode Go

- 请求 `https://opencode.ai/workspace/{workspaceId}/go`。
- 使用 Workspace ID 和 Cookie。
- Cookie 同时支持原始 token 和完整 Cookie header。
- 将 HTML 解析器放入独立 `parser.ts`。
- 为 rolling、weekly、monthly 两种字段顺序分别建立 fixture。
- 页面中不存在任何已知窗口时返回 `invalid-response`。

OpenCode Go 是页面抓取而非稳定 API。站点结构变化会使正则失效，因此错误文案必须明确为“无法解析当前页面”，不能误报成认证失败。

### 14.11 Subprocess Runtime

通用命令执行接口：

```ts
interface CommandOptions {
  environment?: Record<string, string>;
  timeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  cancellable: Gio.Cancellable;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

实现约束：

- argv 数组直接传给 `Gio.SubprocessLauncher`，不经过 shell。
- 默认不继承未清理的敏感环境。
- stdout/stderr 分别设置大小上限。
- cancellable 被取消后必须主动终止进程。
- 超时后先取消 I/O，再终止进程。
- 非零退出码转换为结构化错误。
- stderr 进入日志前统一 redaction。
- runtime 保存 active process 集合，dispose 时全部终止。

### 14.12 GitHub Copilot

通过以下 argv 调用：

```text
gh api
  -H "Accept: application/json"
  -H "Editor-Version: vscode/1.96.2"
  -H "X-Github-Api-Version: 2025-04-01"
  /copilot_internal/user
```

实现步骤：

1. 使用合并后的 PATH 查找 `gh`。
2. 以 20 秒超时执行命令。
3. 解析 login、plan、quota reset 和 quota snapshots。
4. 对 chat、completions 等已知 quota 建立稳定 view model。
5. 保留未知 quota，但只在 details 中展示。
6. 将常见 gh 登录错误映射为 `not-authenticated`。

`/copilot_internal/user` 是内部接口，响应 parser 必须容忍字段缺失和额外字段，并通过 fixture 锁定当前已知格式。

### 14.13 Codex App Server

首版每次 provider 刷新启动一个新的 app-server，采集完成后立即终止，不复用长驻连接。这样可以降低跨刷新请求、通知和进程状态污染的风险。

协议顺序：

```text
spawn codex app-server --listen stdio://
  -> initialize
  -> initialized notification
  -> account/read
  -> account/rateLimits/read
  -> normalize
  -> terminate process
```

`CodexAppServerClient` 必须实现：

- stdout 按行异步读取并逐行 JSON 解码。
- stderr 独立持续读取，避免管道阻塞。
- 递增 request ID。
- `Map<requestId, PendingRequest>` 匹配响应。
- 忽略或记录与当前请求无关的通知。
- RPC error 转换为结构化异常。
- 每个请求独立超时。
- 子进程提前退出时 reject 全部 pending request。
- stderr 使用大小受限的环形缓冲。
- 取消或 dispose 时 reject pending、关闭 stdin 并终止进程。

fallback 顺序：

1. 优先读取 JSON-RPC error 的结构化 `data`。
2. 兼容 `rateLimitsByLimitId.codex`。
3. 兼容 `rateLimits`。
4. 最后兼容旧错误文本中 `body=` 后的 WHAM JSON。

重试要求：

- 只重试明确的瞬时网络错误和超时。
- 首版最多三次。
- 每次重试创建全新的 app-server 进程。
- 使用异步 GLib timer 延迟，不阻塞主线程。
- 取消后不得继续下一次重试。

### 14.14 UI 实施

Panel Indicator 使用 `PanelMenu.Button`，包含：

- 第一个启用 provider 的 symbolic icon。
- 按 provider order 和 item priority 排序后的文本。
- 无 provider 时的 muted 状态。
- loading 时的轻量视觉反馈，避免持续动画增加资源消耗。

Popup 结构：

```text
Header
  标题 / 整体状态 / 最近更新时间

Provider Stack
  Provider Card
    标题 / badge / stale 或 error 状态
    Metric Rows
    details / footer

Footer
  Refresh Now
  Open Preferences
```

渲染约束：

- Provider 只返回 view model。
- `ProviderCard` 统一渲染所有 provider。
- 卡片可以包含任意数量的 metric。
- 长文本启用 `Pango.WrapMode.WORD_CHAR`。
- 错误正文设置最大展示长度。
- stale 数据仍显示指标，同时显示“上次成功数据”标记。
- 样式优先使用主题颜色和透明度。
- 为 Indicator 和操作按钮设置 accessible name/description。
- Hover tooltip 由宿主统一管理，provider 只提供文本 section。

### 14.15 设置界面

核心稳定后提供 `prefs.ts`，使用 GTK4/Libadwaita：

- 刷新间隔。
- provider 启停。
- Codex panel 是否显示主窗口。
- 环境配置文件路径说明。
- 外部命令状态说明。

Shell 进程中的 `extension.ts` 不导入 Gtk、Gdk 或 Adw；preferences 进程不导入 St、Clutter、Shell 或 Shell UI 模块。

Popup 保留“立即刷新”和“打开设置”，provider 启停以 Preferences 为主。若首个内部开发版本暂不提供 `prefs.ts`，可以先在 Popup 中加入开关，但正式首版应统一到 Preferences。

### 14.16 测试分层

#### Node 纯逻辑测试

- Provider JSON/HTML 响应归一化。
- 百分比和金额计算。
- 时间、计划名称和单行错误格式化。
- State Store 状态转换。
- Environment 文件解析和优先级。
- Redaction。
- Codex RPC message dispatcher。
- Codex fallback JSON 提取。

#### GJS Runtime 测试

- LibSoup HTTP success/error/timeout/cancel。
- Gio Subprocess success/nonzero/timeout/cancel。
- GSettings 默认值和 change signal。
- Environment Loader 文件读取。

#### Fake 服务集成测试

- 本地 HTTP fixture server。
- Fake command 输出 stdout/stderr。
- Fake Codex app-server：
  - 响应乱序。
  - 请求间插入 notification。
  - 非 JSON 行。
  - 大量 stderr。
  - RPC error。
  - 旧 WHAM fallback。
  - 进程提前退出。
  - 超时和取消。

#### GNOME Shell 回归

- 安装、启用、禁用、再次启用。
- 连续 enable/disable 五次。
- 每种 provider 组合。
- 首次加载、部分失败、全部失败。
- Popup 打开时刷新。
- Settings 实时变化。
- 锁屏/解锁。
- 缩放 100%、125%、150%、200%。
- 深色和浅色主题。
- 无残留 indicator、GLib source 和子进程。
- GNOME Shell 日志无 extension 产生的 critical warning。

### 14.17 每阶段交付门禁

#### Gate 0：骨架可运行

- `npm run typecheck`、`lint`、`build`、`package` 全部成功。
- ZIP 可由 `gnome-extensions` 安装。
- GNOME Shell 50 可显示空 Indicator 和 Popup。
- 连续启停五次无残留。

#### Gate 1：核心闭环

- Fake provider 可完成成功、超时、失败和 stale 展示。
- 手动与定时刷新可工作。
- 重复刷新不会并发执行。
- disable 后异步结果不会回写。

#### Gate 2：HTTP Provider

- DeepSeek、Z.ai、OpenCode Go 可独立启停。
- 所有敏感字段通过 redaction 测试。
- HTTP timeout/cancel 可稳定复现。
- OpenCode parser fixture 完整。

#### Gate 3：CLI Provider

- Copilot 成功、缺少 gh、未登录、超时和非零退出均有正确状态。
- disable 可终止运行中的 gh。

#### Gate 4：Codex

- 正常响应和所有 fallback 可解析。
- 请求乱序和通知不影响匹配。
- 超时、取消、重试不会遗留 app-server。

#### Gate 5：发布候选

- Settings 重启后保留。
- 中英文文案完整。
- GNOME 50 完整回归通过。
- ZIP 不含 Python、TypeScript、测试、构建脚本和未使用资源。
- JavaScript 可读、未压缩、未混淆。

### 14.18 风险与处理顺序

风险从高到低：

1. **OpenCode Go 页面抓取不稳定**  
   使用独立 parser、HTML fixture 和明确的解析失败错误；不能把解析失败误判为认证失败。

2. **Copilot 内部接口可能变化**  
   parser 容忍缺失和新增字段，保留原始 fixture，未知 quota 降级展示。

3. **Codex app-server 协议兼容**  
   单独工作包实施，以 fake server 覆盖乱序、通知、fallback、退出和取消。

4. **GNOME disable 后异步回调访问已销毁对象**  
   generation ID、disposed flag、统一 cancellable 和 active process registry 从 W1 起强制使用。

5. **桌面会话缺少 shell 环境**  
   使用确定性的 Environment Loader，不启动交互式 shell。

6. **品牌图标审核与授权**  
   发布前确认品牌素材授权；无法确认时使用通用 symbolic icon。

### 14.19 推荐开发里程碑

#### M1：可运行骨架

W0 + W1，使用 fake provider 打通 build、install、刷新、stale 和 disable 生命周期。

#### M2：HTTP 可用版本

完成 DeepSeek、Z.ai、OpenCode Go。此阶段已经形成可以日常使用的内部版本。

#### M3：Copilot

完成 CommandRunner 和 Copilot，并补齐缺少命令、未登录、超时等错误路径。

#### M4：Codex

单独完成 app-server client、fallback、重试和进程清理。

#### M5：正式首版

完成 Preferences、国际化、视觉回归、文档、审核自检和发布 ZIP。

开发过程中每个里程碑都必须生成可安装 ZIP 并在 GNOME Shell 50 实际启停验证，不能只以 TypeScript 编译成功作为完成标准。

## 15. 与 Cinnamon 项目的边界

新项目可以参考和迁移以下内容：

- Provider 响应字段和归一化规则。
- 配额计算规则。
- 格式化和中英文文案。
- 图标和视觉方向。
- 最后成功快照语义。
- Codex fallback 和重试策略。

不直接复制以下内容：

- Cinnamon `Applet` 生命周期。
- Cinnamon settings API。
- Cinnamon popup menu 和 context menu。
- CommonJS 模块加载方式。
- 直接创建 Cinnamon/GNOME UI 的 provider 实现。
- Python collector 的进程封装。

两个项目暂时独立发布和版本管理。至少完成一个稳定 GNOME 版本后，再根据实际重复量决定是否抽取共享协议或生成式共享代码。

## 16. 首个版本完成定义

首个可发布版本必须满足：

- 支持 GNOME Shell 50。
- 五个内置 provider 均可工作。
- 扩展自身不依赖 Python。
- HTTP provider 不依赖 curl。
- Codex 和 Copilot 分别只依赖 `codex` 与 `gh`。
- 支持手动和定时刷新。
- 支持 provider 启停。
- 支持刷新间隔设置。
- 支持最后成功快照。
- 所有异步操作可取消。
- 禁用扩展后无残留 UI、timer、signal 或 subprocess。
- 构建产物可读、未压缩、未混淆。
- README 清楚说明凭据、外部命令、隐私和故障排查。

## 17. 项目启动后的第一批任务

1. 创建仓库和许可证。
2. 确认 UUID 与 GNOME Shell 目标版本。
3. 建立 TypeScript/GJS 类型和 ESM 构建。
4. 实现最小 Panel Indicator。
5. 实现 `disable()` 清理验证。
6. 定义 provider、state 和 view model 类型。
7. 实现 State Store 与 Controller。
8. 实现 LibSoup HTTP Client。
9. 迁移 DeepSeek 作为第一个端到端 provider。
10. 完成 Z.ai 和 OpenCode Go。
11. 实现通用 Subprocess Runtime。
12. 迁移 Copilot。
13. 最后迁移 Codex JSON-RPC。

建议将 Codex 放在最后，因为它最复杂；在此之前先把生命周期、错误模型、取消机制和 UI 协议稳定下来。
