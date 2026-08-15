# DeepSeek Harness Skill Insight

一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的本地优先、显式命令触发插件。它会冻结当前 Session 的 trace，找出有证据支持的问题，并为本次运行使用的 Skill 生成可审查、可回滚的优化提案。

这是原生 Harness bundle，不是 VS Code 插件。可视化界面以 **Skill Insight** 标签页直接出现在 DeepSeek Harness Web UI 中；未来的 VS Code 适配器可以直接消费版本化的 `report.json`，无需改动分析内核。

[English](README.md)

![DeepSeek Harness 中的 Skill Insight 分析界面](media/skill-insight-dashboard.png)

## 核心能力

- 只在用户显式输入 `/skill-insight …` 后运行，不做后台自动分析。
- 在固定 seq 截止点读取不可变 Session 事件日志，避免分析期间 trace 漂移。
- 分析前脱敏密钥、邮箱和用户主目录标识，并限制事件与文本大小。
- 通过确定性规则发现重复工具调用、工具失败、缺少恢复动作、Skill 加载过晚和目标 Skill 不匹配。
- 默认可调用当前 Session 已选择的 Provider/Model，生成结构化二次分析与 Skill 正文提案；失败时自动退回规则结果。
- 在 Harness UI 中呈现指标、问题、trace 证据、安全校验与 unified diff。
- 只对文件型 `SKILL.md` 执行带 SHA-256 基线校验的应用和回滚。
- 原样保留 YAML frontmatter 与原始换行风格。
- 将稳定 JSON 报告和本地快照保存到 `$DSH_HOME/skill-insight/`。
- 通过 Harness 官方 `command/run` 与 `command/done` 生命周期持久化 UI 状态，重启后 Session 仍可安全恢复。

## 环境要求

- DeepSeek Harness `0.1.0-rc.6`。
- Node.js 22 或更高版本。
- 需要 Web profile 才能显示可视化标签页。
- 只有默认 hybrid 模式需要当前 Agent 已选定 Provider/Model；rules 模式无需额外模型调用。

Harness 仍处于预览阶段，插件 API 可能变化。本项目锁定并验证了上述预览版本。

## 安装

### 从本地源码打包安装

```sh
npm ci
npm run package
dsh plugin --profile web add ./deepseek-harness-skill-insight-0.1.0.tgz
dsh --profile web --dump-config
dsh --profile web
```

配置输出中应包含 `deepseek-harness-skill-insight` layer 和 `skill-insight` row。

### 从 GitHub 安装

```sh
dsh plugin --profile web add github:MagicShawn/deepseek-harness-for-vscode#main
```

Git 安装会通过包内 `prepare` 脚本构建 TypeScript。pnpm 10 可能会先拒绝执行构建脚本；请审查源码，按照 `dsh` 输出的准确 `allowBuilds` 条目放行后重试。需要可复现安装时请固定 commit SHA。

发布到 npm 后可直接使用：

```sh
dsh plugin --profile web add deepseek-harness-skill-insight
```

卸载命令：

```sh
dsh plugin --profile web remove deepseek-harness-skill-insight
```

## 使用方法

先让 Agent 完成或尝试一次调用了 Skill 的任务，然后输入：

```text
/skill-insight analyze
```

若 trace 中出现多个 Skill，请显式选择：

```text
/skill-insight analyze --skill my-skill
```

若希望完全确定性、完全不调用模型：

```text
/skill-insight analyze --skill my-skill --mode rules
```

打开会话中的 **Skill Insight** 标签页即可查看报告。Hybrid 分析可能包含修改提案；请先检查证据与 diff，再点击 **应用提案**。界面按钮与输入框中的命令完全等价，都会进入可审计的 Session 日志。

| 命令 | 用途 |
| --- | --- |
| `/skill-insight analyze [--skill <name>] [--mode hybrid\|rules]` | 冻结并分析当前 trace |
| `/skill-insight apply <analysis-id>` | 应用带哈希保护的提案 |
| `/skill-insight revert <analysis-id>` | 恢复分析时捕获的原始快照 |
| `/skill-insight show [analysis-id]` | 在命令结果中查看某次分析摘要 |
| `/skill-insight list` | 列出当前 Session 的分析记录 |

Rules-only 分析绝不会生成可写提案。运行时 Skill 或没有绝对 `SKILL.md` 路径的来源会被明确拒绝，因为插件无法为其建立可验证的修改边界。

## 本地产物与数据契约

每次分析生成：

```text
$DSH_HOME/skill-insight/<session-id>/<analysis-id>/
├── report.json
├── report.md
├── trace.normalized.json
├── proposal.diff                  # 仅 hybrid 提案
└── snapshots/
    ├── SKILL.before.md
    └── SKILL.proposed.md          # 仅 hybrid 提案
```

`report.json` 使用 `schemaVersion: 1`，是未来 VS Code 或其他可视化客户端的稳定集成边界。插件不会把 Harness 原始 trace 复制到该目录，只会保存经过裁剪和脱敏的投影。

## 隐私与安全

Rules 模式完全在本地运行。Hybrid 模式只会把两类输入发送给当前 Agent 已选择的 Provider/Model：脱敏后的标准化 trace 与当前 Skill 正文。原始 Session 日志、本地快照、API Key 和 Harness 凭据都不会被发送。

应用提案前，插件会确认：

1. 提案来自已保存的基线哈希；
2. 当前 `SKILL.md` 仍与该哈希完全一致；
3. YAML frontmatter 保持逐字节不变；
4. 只有当前文件仍匹配应用后哈希时才允许回滚。

如果编辑器或其他进程在分析后修改了 Skill，apply/revert 会失败关闭，并要求重新分析。

## 开发与验证

```sh
npm ci
npm run verify
```

项目使用 TypeScript、Vitest、ESLint 和两个 esbuild target：Node ESM Host 插件与浏览器 module-loader bundle。测试覆盖标准化/脱敏、规则发现、模型结构化降级、哈希安全、产物恢复、命令编排、Client 投影、UI 渲染与浏览器 bundle 交接。

## 功能边界

Skill Insight 只负责一个闭环：**trace → 证据 → Skill 提案 → 受保护的应用/回滚**。它不做全局 Agent 评分、不运行持续遥测、不自动修改 Skill，也不在本包中提供 VS Code 界面。

本项目为非官方社区作品，与 DeepSeek 无隶属或背书关系。

## 许可证

MIT，详见 [LICENSE](LICENSE)。
