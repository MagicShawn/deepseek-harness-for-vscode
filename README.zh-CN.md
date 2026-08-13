# DeepSeek Harness UI for VS Code

一款非官方、local-first 的 VS Code 可视化工作台，用于承接 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 官方 Web UI。

插件把官方 Harness 的会话、流式输出、工具、审批、提问、子代理、Skills、模型设置和工作区完整放进编辑器侧栏，并补充选区上下文、文件跳转、Diff、进程管理与诊断能力；它不会重写 Harness 协议。

英文说明随包提供：`README.md`。

## 功能

- Activity Bar 侧栏与编辑器页签两种工作台形态。
- 管理本地 Harness，或连接到已有 Web URL。
- 自动发现运行时：自定义命令 → PATH 中的 `dsh` → `npx @deepseek-ai/dsh`。
- 启动、停止、重启、刷新、浏览器打开、日志和状态栏控制。
- 将当前选区或完整文件添加到官方 composer。
- 自动注入前始终复制到剪贴板；官方页面结构变化也不会丢失上下文。
- 点击 Harness 中的 `file://` 链接，在 VS Code 指定行列打开文件。
- 使用 VS Code 原生 Diff 比较任意两个本地文件。
- 适配 VS Code 主题、键盘操作和窄侧栏。
- 认证的回环代理，支持 HTTP、SSE 和 WebSocket。

## 环境要求

- VS Code 1.90 或更高版本。
- DeepSeek Harness 当前版本所支持的 Node.js；目前开发者预览要求 Node.js 22.19+ 或 24+。
- 已在 Harness 中配置好模型/Provider。插件不会读取或保存 API Key。

若系统已安装 `dsh`，插件会直接使用；否则回退到：

```sh
npx --yes @deepseek-ai/dsh web --host 127.0.0.1 --port 0
```

首次启动可能需要 npm 下载官方包，因此耗时会更长。

## 快速开始

1. 在 VS Code 中打开 **扩展 → … → 从 VSIX 安装…**。
2. 点击 Activity Bar 的 DeepSeek Harness 图标。
3. 等待官方 Web UI 就绪。
4. 在代码编辑器选中文字，右键选择 **DeepSeek Harness: Add Selection to Context**。

常用命令：

| 命令 | 用途 |
| --- | --- |
| `DeepSeek Harness: Focus Chat` | 聚焦侧栏 |
| `DeepSeek Harness: Open in Editor` | 在编辑器页签打开持久工作台 |
| `DeepSeek Harness: New Session` | 触发官方 UI 的新会话流程 |
| `DeepSeek Harness: Add Selection to Context` | 复制并注入选区代码 |
| `DeepSeek Harness: Add File to Context` | 复制并注入完整活动文件 |
| `DeepSeek Harness: Compare Files` | 打开 VS Code 双文件 Diff |
| `Start / Stop / Restart` | 管理由插件启动的本地运行时 |
| `Show Logs` | 查看启动与诊断日志 |

## 配置

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `deepseekHarness.connectionMode` | `auto` | `auto`、`managed` 或 `external` |
| `deepseekHarness.externalUrl` | 空 | auto/external 模式使用的现有 Web URL |
| `deepseekHarness.command` | 空 | 自定义可执行文件及前置参数 |
| `deepseekHarness.port` | `0` | 托管 Web 端口；`0` 自动选择空闲端口 |
| `deepseekHarness.startupTimeout` | `60` | 启动超时秒数 |
| `deepseekHarness.openOnStartup` | `false` | 打开工作区时自动聚焦侧栏 |

连接到已有实例：

```jsonc
{
  "deepseekHarness.connectionMode": "external",
  "deepseekHarness.externalUrl": "http://127.0.0.1:3080"
}
```

Windows 自定义命令：

```jsonc
{
  "deepseekHarness.connectionMode": "managed",
  "deepseekHarness.command": "\"C:\\Tools\\dsh.cmd\""
}
```

## 故障排查

**首次启动超时**

执行 **DeepSeek Harness: Show Logs**。若 npm 仍在下载官方包，提高 `deepseekHarness.startupTimeout` 后重试，并确认 `node --version` 满足 Harness 要求。

**浏览器能打开，VS Code 内无法显示**

依次执行 **Restart** 和 **Refresh UI**。确认安全软件允许访问 `127.0.0.1` 回环地址；插件不会监听局域网地址。

**选区没有自动进入输入框**

格式化后的上下文已经提前写入剪贴板。聚焦 Harness 输入框并粘贴即可，插件也会显示回退通知。bridge 有意保持轻量，因此官方 composer 结构变化不会造成文本丢失。

**文件链接无法打开**

插件只接受实际存在的普通文件；相对路径必须位于已打开的 VS Code 工作区内。HTTP 链接和目录穿越不会被当作文件打开。

## 架构与安全

插件启动或连接官方 Web Server，然后在随机 `127.0.0.1` 端口创建认证反向代理。iframe 首次访问携带高熵令牌，后续请求必须同源；代理支持流式响应和 WebSocket，仅注入一个受限 IDE bridge。

凭据继续由 DeepSeek Harness 管理。插件不会记录 Authorization、Cookie、API Key 或带凭据的 URL。插件不会终止外部实例，只清理自己启动的子进程树。

## 状态说明

DeepSeek Harness 仍处于开发者预览阶段，可能出现破坏性变化。插件复用官方 UI，以尽量规避协议漂移；自动注入和“新会话”UI 定位若受上游结构变化影响，仍有剪贴板或手动操作回退。

本项目是非官方社区作品，与 DeepSeek 无隶属或背书关系。DeepSeek 与 DeepSeek Harness 商标归各自权利人所有。

## 许可证

MIT，详见随包提供的 `LICENSE` 文件。
