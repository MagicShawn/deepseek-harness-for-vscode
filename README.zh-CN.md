# DeepSeek Harness Skill Insight

一个面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的本地优先、显式触发插件。它会冻结当前 Session 的 trace，找出有证据支持的问题，并为本次运行使用的 Skill 生成可审查、可回滚的优化提案。

这是原生 Harness bundle，不是 VS Code 插件。可视化界面以 **Skill Insight** 标签页直接出现在 DeepSeek Harness Web UI 中；未来的 VS Code 适配器可以直接消费版本化的 `report.json`，无需改动分析内核。

[English](README.md)

![DeepSeek Harness 中的 Skill Insight 分析界面](media/skill-insight-dashboard.png)

## 核心能力

- 只在用户点击**开始分析**或显式输入 `/skill-insight …` 后运行，不做后台自动分析。
- 提供可搜索的 Skill 选择器：优先展示当前 Session 使用过的 Skills，并通过 Harness Skills API 加载全部已安装 Skills。
- 以可视化控件选择 Hybrid 或 Rules 模式，默认使用 Hybrid。
- 在固定 seq 截止点读取不可变 Session 事件日志，避免分析期间 trace 漂移。
- 分析前脱敏密钥、邮箱和用户主目录标识，并限制事件与文本大小。
- 通过确定性规则发现重复工具调用、工具失败、缺少恢复动作、Skill 加载过晚和目标 Skill 不匹配。
- 默认可调用当前 Session 已选择的 Provider/Model，生成结构化二次分析与 Skill 正文提案；失败时自动退回规则结果。
- 在 Harness UI 中呈现指标、问题、trace 证据、安全校验与 unified diff。
- 只对文件型 `SKILL.md` 执行带 SHA-256 基线校验的应用和回滚。
- 原样保留 YAML frontmatter 与原始换行风格。
- 将稳定 JSON 报告和本地快照保存到 `$DSH_HOME/skill-insight/`。
- 通过显式命令和 UI 确认，安全清理当前 Session 的单条或全部本地分析产物。
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
dsh plugin --profile web add ./deepseek-harness-skill-insight-0.1.2.tgz
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

先让 Agent 完成或尝试一次调用了 Skill 的任务，然后打开会话中的 **Skill Insight** 标签页：

1. 点击**新建分析**；如果还没有历史分析，表单会直接展开。
2. 选择当前 Session 的 Skill，或搜索全部已安装 Skills。检测到一个 Skill 时自动选中；检测到多个时必须明确选择；没有检测结果时使用**自动检测**。
3. 保持 **Hybrid** 可获得模型辅助分析，或选择 **Rules** 执行完全确定性、无额外模型调用的诊断。
4. 点击**开始分析**；新结果到达后会自动选中。

检查证据和 diff 后，可直接通过**应用提案**、**回滚修改**和清理按钮完成操作。可视化操作仍通过 Harness 官方命令生命周期持久化，但不会在主聊天区增加命令卡片。

手工 CLI 仍可用于脚本和排障；手工输入的命令会继续显示在会话审计轨迹中：

```text
/skill-insight analyze
```

若 trace 中出现多个 Skill，请显式选择：

```text
/skill-insight analyze --skill my-skill
```

若希望从 CLI 执行完全确定性、完全不调用模型的诊断：

```text
/skill-insight analyze --skill my-skill --mode rules
```

完整的手工命令如下：

| 命令 | 用途 |
| --- | --- |
| `/skill-insight analyze [--skill <name>] [--mode hybrid\|rules]` | 冻结并分析当前 trace |
| `/skill-insight apply <analysis-id>` | 应用带哈希保护的提案 |
| `/skill-insight revert <analysis-id>` | 恢复分析时捕获的原始快照 |
| `/skill-insight clear <analysis-id>` | 永久删除当前 Session 中某次分析的本地产物 |
| `/skill-insight clear --all --confirm` | 永久删除当前 Session 中全部有效分析的本地产物 |
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

清理会永久删除选中分析的本地报告、标准化 trace、diff 与 Skill 快照，并在当前 Session 的界面中隐藏这些分析。它不会删除或改写 Harness Session 事件：命令审计轨迹以及历史命令载荷仍保留在只追加的 Session 日志中。清理也**不会**回滚已经应用到 `SKILL.md` 的提案；如果仍需回滚，请先执行 revert 再清理。其他 Session 不受影响。

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
