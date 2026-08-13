# DeepSeek Harness VS Code UI 设计规格

## 目标

交付一个可安装的 VSIX，在 VS Code 主侧栏和编辑器页签中承接 DeepSeek Harness 官方 Web UI，并提供编辑器原生上下文与导航能力。插件必须能够管理本地 Harness Web 进程、恢复连接、显示诊断信息，并在不复制 Harness 会话协议的前提下持续兼容官方 UI。

## 已调研事实

- DeepSeek Harness 官方 npm 包是 `@deepseek-ai/dsh`，Web UI 通过 `dsh web` 启动，默认监听 `127.0.0.1:3080`。
- 官方 Web bundle 已拥有会话、流式消息、审批、问题、子代理、工作区、设置、模型选择、技能和工具结果等完整表层。
- Python SDK 是 JSON-RPC stdio 驱动层，公开低层通知与请求响应，但它不是完整 Web Host API 的替代实现。
- OpenChamber 的 VS Code 产品逻辑是薄扩展主机、Webview UI、运行时桥接、右键上下文和文件跳转；本项目借鉴其边界，不复制其代码或品牌。

## 产品范围

### 必须交付

1. Activity Bar 中的 DeepSeek Harness 图标和常驻侧栏。
2. 可在编辑器页签打开的完整 Harness 工作台。
3. 自动连接到配置的外部 URL，或在本机启动官方 `dsh web`。
4. 运行时状态：未连接、启动中、就绪、停止、失败；提供启动、停止、重启、刷新和日志命令。
5. 自动发现用户配置的命令、PATH 中的 `dsh`，并以 `npx --yes @deepseek-ai/dsh web` 作为回退。
6. 反向代理官方 HTML、静态资源、HTTP API、SSE 和 WebSocket，使官方 SPA 在 VS Code Webview 内保持同源运行。
7. 将当前文件或编辑器选区格式化为上下文，复制到剪贴板，并尝试注入官方 composer；注入失败时必须保留剪贴板回退。
8. 捕获 Harness UI 中的本地文件链接，在 VS Code 中打开文件；支持 `path:line:column`。
9. “比较文件”命令：从 UI 或命令面板选择本地文件并打开 VS Code Diff。
10. 中英文界面文本、VS Code 主题适配、键盘可达、窄侧栏可用。
11. README、配置说明、故障排查、开源许可证和可安装 VSIX。

### 明确不做

- 不重写 Harness 的对话、会话、审批、设置或工具协议。
- 不存储 DeepSeek API Key；凭据继续由 Harness 自己管理。
- 不提供远程公共网络暴露或隧道。
- 不复制 OpenChamber 源码、图标或品牌资产。

## 架构

### Extension Host

`HarnessRuntimeManager` 只管理一个本地进程。它解析启动策略，使用当前 VS Code 工作区作为 cwd，监听 stdout/stderr，从官方 `dsh web:` 日志或回退规则识别 URL，执行健康检查，并将状态广播给所有 Webview。进程退出或扩展释放时清理自身启动的子进程；外部 URL 永不由插件终止。

`HarnessProxyServer` 绑定 `127.0.0.1` 随机端口，为 Webview 提供一个同源入口。HTTP 请求转发到 Harness，响应 HTML 时注入 IDE bridge；WebSocket upgrade 透明转发。代理只接受扩展生成的高熵路径令牌，且不绑定 LAN。

### Webview

Webview 外壳先显示轻量启动/错误页；代理就绪后加载 iframe。工具栏包含状态、刷新、在浏览器打开、重启和更多菜单。官方 UI 占据剩余空间。Webview CSP 仅允许自身资源、代理地址与 VS Code 消息桥。

注入 bridge 在代理页面上下文中执行，职责仅限：

- 接收 `insertContext`，查找可见 textarea，设置 draft 并触发 `input` 事件；找不到输入框时回报失败。
- 拦截同源页面中可识别的绝对文件路径点击，向 Webview 外壳发送 `openFile`。
- 转发有限的就绪、焦点与错误诊断事件。

### IDE 动作

编辑器命令读取活动文档/选区，生成 Markdown 上下文块：工作区相对路径、行号范围、语言和代码。文本始终先写入剪贴板，再发给可见 Webview。因此页面结构变化只会降低自动填充能力，不会丢失用户内容。

文件打开必须做路径解析与存在性校验；相对路径按当前工作区解析。协议、目录或不存在路径不得交给编辑器。Diff 仅比较用户明确选择的两个现有文件。

## 配置

- `deepseekHarness.connectionMode`: `auto | managed | external`，默认 `auto`。
- `deepseekHarness.externalUrl`: 外部 Harness URL。
- `deepseekHarness.command`: 自定义可执行文件或命令行。
- `deepseekHarness.port`: 托管模式固定端口，`0` 表示自动选择。
- `deepseekHarness.startupTimeout`: 启动超时秒数，默认 60。
- `deepseekHarness.openOnStartup`: 工作区打开后自动展示侧栏，默认 false。

`auto` 优先使用有效的 `externalUrl`，否则启动托管进程。自定义命令优先于 PATH `dsh`，PATH 不可用时使用 `npx`。

## 错误处理

- 启动超时、端口占用、命令不存在和非零退出都显示可行动错误与“打开日志/设置/重试”。
- 代理上游断开返回 502，并保留外壳工具栏以便重启。
- 页面重载不重复启动进程；多个视图共享一个 manager/proxy。
- 扩展进程重载时不杀死外部实例，只清理自己持有的进程。
- API Key、Authorization、Cookie 和 URL 查询凭据不得写入 Output 日志。

## 测试与验收

- 单元测试覆盖启动策略、URL 识别、上下文格式、文件位置解析、HTML bridge 注入和状态转换。
- 集成测试以本地 fixture HTTP/WebSocket 服务器验证代理的 HTML、静态资源、POST、SSE 和 WebSocket。
- Extension Host 测试验证命令注册、Webview 消息与 VS Code 文件打开行为。
- `npm test`、`npm run lint`、`npm run typecheck`、`npm run build`、`npm run package` 全部通过。
- 手工安装 VSIX 后验证侧栏启动、官方页面显示、选区传递、文件跳转、重启和外部 URL 模式。

## 兼容性与安全

- VS Code 最低版本 1.90；Windows、macOS、Linux。
- Node 运行时使用 VS Code Extension Host 提供的版本；启动官方 Harness 所需 Node 版本由其 CLI 自检并给出诊断。
- 代理仅绑定 loopback，使用不可猜测令牌路径，Webview 禁止任意外部导航。
- 项目使用 MIT 许可证，并明确标注为非官方社区插件。

