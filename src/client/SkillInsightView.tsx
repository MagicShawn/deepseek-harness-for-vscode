import { useEffect, useMemo, useState } from 'react'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'

import type {
  InsightIssue,
  InsightRunStatus,
  InsightRunView,
} from '../shared/types.js'
import { EMPTY_INSIGHT_SNAPSHOT } from './projection.js'

export interface SkillInsightViewInjected {
  runCommand: (line: string) => Promise<void>
}

type ViewProps = ConvViewProps & SkillInsightViewInjected

const CSS = `
.si-root{--si-bg:var(--background,#0f1115);--si-panel:color-mix(in srgb,var(--si-bg) 88%,white 12%);--si-line:color-mix(in srgb,currentColor 16%,transparent);--si-muted:color-mix(in srgb,currentColor 62%,transparent);--si-accent:#5b8cff;--si-good:#3ccf91;--si-warn:#f3b84b;--si-bad:#f26d78;box-sizing:border-box;height:100%;min-height:420px;color:var(--foreground,currentColor);background:var(--si-bg);font:13px/1.5 var(--vscode-font-family,Inter,system-ui,sans-serif);overflow:auto}
.si-root *{box-sizing:border-box}.si-shell{max-width:1180px;margin:0 auto;padding:28px}.si-top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:24px}.si-brand{display:flex;gap:13px;align-items:center}.si-logo{display:grid;place-items:center;width:38px;height:38px;border:1px solid color-mix(in srgb,var(--si-accent) 45%,transparent);border-radius:12px;background:linear-gradient(145deg,color-mix(in srgb,var(--si-accent) 28%,transparent),transparent);color:#91adff;font-weight:800}.si-title{font-size:20px;font-weight:720;letter-spacing:-.02em}.si-subtitle{color:var(--si-muted);margin-top:2px}.si-button{border:1px solid var(--si-line);border-radius:9px;padding:8px 12px;color:inherit;background:var(--si-panel);font:inherit;font-weight:600;cursor:pointer}.si-button:hover{border-color:color-mix(in srgb,var(--si-accent) 62%,transparent);background:color-mix(in srgb,var(--si-accent) 12%,var(--si-panel))}.si-button:disabled{opacity:.5;cursor:not-allowed}.si-button-primary{background:var(--si-accent);border-color:var(--si-accent);color:#fff}.si-button-danger{border-color:color-mix(in srgb,var(--si-bad) 55%,transparent);color:#ffabb2}.si-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:18px}.si-history,.si-card{border:1px solid var(--si-line);border-radius:14px;background:var(--si-panel)}.si-history{padding:9px;height:max-content;position:sticky;top:16px}.si-history-title{padding:7px 9px 9px;color:var(--si-muted);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}.si-history-item{width:100%;text-align:left;border:0;border-radius:9px;padding:10px;background:transparent;color:inherit;cursor:pointer}.si-history-item:hover,.si-history-item[data-active=true]{background:color-mix(in srgb,var(--si-accent) 12%,transparent)}.si-history-skill{display:block;overflow:hidden;text-overflow:ellipsis;font-weight:650}.si-history-meta{display:flex;justify-content:space-between;color:var(--si-muted);font-size:11px;margin-top:3px}.si-content{min-width:0}.si-card{padding:18px;margin-bottom:14px}.si-hero{padding:21px}.si-eyebrow{display:flex;align-items:center;gap:8px;color:var(--si-muted);font-size:12px}.si-status{border:1px solid var(--si-line);border-radius:999px;padding:2px 8px;text-transform:capitalize}.si-status[data-status=running]{color:#91adff}.si-status[data-status=completed],.si-status[data-status=reverted]{color:var(--si-good)}.si-status[data-status=failed]{color:var(--si-bad)}.si-status[data-status=applied]{color:#c6a7ff}.si-hero-row{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-top:12px}.si-skill{font-size:23px;font-weight:740;letter-spacing:-.025em}.si-summary{color:var(--si-muted);max-width:760px;margin-top:7px}.si-actions{display:flex;gap:8px;flex-wrap:wrap}.si-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.si-metric{border:1px solid var(--si-line);border-radius:12px;padding:14px;background:color-mix(in srgb,var(--si-panel) 88%,transparent)}.si-metric-value{font:700 22px/1.15 var(--vscode-editor-font-family,ui-monospace,monospace)}.si-metric-label{color:var(--si-muted);font-size:11px;margin-top:5px}.si-section-title{font-size:14px;font-weight:700;margin-bottom:12px}.si-issue{border-top:1px solid var(--si-line);padding:15px 0}.si-issue:first-of-type{border-top:0;padding-top:0}.si-issue-head{display:flex;gap:9px;align-items:center}.si-severity{width:8px;height:8px;border-radius:50%;background:var(--si-muted)}.si-severity[data-level=critical]{background:var(--si-bad);box-shadow:0 0 0 4px color-mix(in srgb,var(--si-bad) 15%,transparent)}.si-severity[data-level=warning]{background:var(--si-warn)}.si-severity[data-level=info]{background:var(--si-accent)}.si-issue-title{font-weight:700}.si-source{margin-left:auto;color:var(--si-muted);font-size:11px}.si-explanation{color:var(--si-muted);margin:7px 0}.si-recommend{border-left:2px solid color-mix(in srgb,var(--si-accent) 55%,transparent);padding-left:10px}.si-evidence{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.si-chip{border:1px solid var(--si-line);border-radius:7px;padding:3px 7px;background:color-mix(in srgb,var(--si-bg) 58%,transparent);font:11px/1.4 var(--vscode-editor-font-family,ui-monospace,monospace)}.si-diff{overflow:auto;border:1px solid var(--si-line);border-radius:10px;background:color-mix(in srgb,var(--si-bg) 82%,black 18%);font:12px/1.55 var(--vscode-editor-font-family,ui-monospace,monospace)}.si-diff-line{display:block;white-space:pre;padding:0 12px;min-height:19px}.si-diff-line[data-kind=add]{background:color-mix(in srgb,var(--si-good) 14%,transparent);color:#9be6bd}.si-diff-line[data-kind=remove]{background:color-mix(in srgb,var(--si-bad) 13%,transparent);color:#ffacb3}.si-diff-line[data-kind=hunk]{color:#91adff;background:color-mix(in srgb,var(--si-accent) 10%,transparent)}.si-notice{border:1px solid color-mix(in srgb,var(--si-warn) 35%,transparent);border-radius:10px;padding:10px 12px;color:#f7cc79;background:color-mix(in srgb,var(--si-warn) 8%,transparent);margin-bottom:8px}.si-validation{display:flex;gap:8px;align-items:flex-start;margin:6px 0;color:var(--si-muted)}.si-check{color:var(--si-good)}.si-error{border-color:color-mix(in srgb,var(--si-bad) 45%,transparent);color:#ffabb2;background:color-mix(in srgb,var(--si-bad) 8%,transparent)}.si-empty{min-height:390px;display:grid;place-items:center;text-align:center;padding:35px}.si-empty-inner{max-width:550px}.si-empty-logo{width:62px;height:62px;margin:0 auto 17px;border-radius:19px;font-size:22px}.si-empty h2{font-size:22px;margin:0 0 8px}.si-empty p{color:var(--si-muted);margin:0 auto 18px}.si-command{display:inline-block;border:1px solid var(--si-line);border-radius:8px;background:color-mix(in srgb,var(--si-bg) 70%,transparent);padding:7px 10px;margin-bottom:17px;font-family:var(--vscode-editor-font-family,ui-monospace,monospace);color:#a9bcff}.si-footer{color:var(--si-muted);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.si-spinner{display:inline-block;width:11px;height:11px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:si-spin .8s linear infinite}@keyframes si-spin{to{transform:rotate(360deg)}}
@media(max-width:800px){.si-shell{padding:16px}.si-layout{grid-template-columns:1fr}.si-history{position:static;display:flex;overflow:auto}.si-history-title{display:none}.si-history-item{min-width:160px}.si-metrics{grid-template-columns:repeat(2,1fr)}.si-hero-row,.si-top{flex-direction:column}.si-top>.si-button{align-self:flex-start}}
`

const TEXT = {
  en: {
    subtitle: 'Trace analysis and evidence-backed Skill optimization',
    analyze: 'Analyze trace',
    rules: 'Rules only',
    history: 'Analyses',
    emptyTitle: 'Turn a trace into a better Skill',
    emptyBody: 'Run an explicit analysis after the agent has used a Skill. Nothing runs in the background.',
    apply: 'Apply proposal',
    revert: 'Revert change',
    events: 'Trace events',
    calls: 'Tool calls',
    errors: 'Tool failures',
    repeats: 'Repeated calls',
    issues: 'Evidence-backed findings',
    proposal: 'Proposed Skill change',
    checks: 'Safety checks',
    noIssues: 'No deterministic or model-backed issues were reported.',
  },
  zh: {
    subtitle: 'Trace 分析与证据驱动的 Skill 优化',
    analyze: '分析 Trace',
    rules: '仅规则分析',
    history: '分析记录',
    emptyTitle: '把一次 Trace 变成更好的 Skill',
    emptyBody: '在 Agent 使用过 Skill 后显式触发分析；插件不会在后台自动运行。',
    apply: '应用提案',
    revert: '回滚修改',
    events: 'Trace 事件',
    calls: '工具调用',
    errors: '工具失败',
    repeats: '重复调用',
    issues: '有证据的发现',
    proposal: 'Skill 修改提案',
    checks: '安全检查',
    noIssues: '没有发现确定性或模型支持的问题。',
  },
} as const

function isChinese(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.lang) {
    return document.documentElement.lang.toLowerCase().startsWith('zh')
  }
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')
}

function statusText(status: InsightRunStatus): string {
  return status === 'running' ? 'running' : status
}

function Diff({ value }: { value: string }) {
  return <div className="si-diff" aria-label="Unified diff">
    {value.split('\n').map((line, index) => {
      const kind = line.startsWith('+++') || line.startsWith('---')
        ? 'meta'
        : line.startsWith('+')
          ? 'add'
          : line.startsWith('-')
            ? 'remove'
            : line.startsWith('@@')
              ? 'hunk'
              : 'context'
      return <span className="si-diff-line" data-kind={kind} key={`${index}-${line.slice(0, 8)}`}>{line || ' '}</span>
    })}
  </div>
}

function Issue({ issue }: { issue: InsightIssue }) {
  return <article className="si-issue">
    <div className="si-issue-head">
      <span className="si-severity" data-level={issue.severity} />
      <span className="si-issue-title">{issue.title}</span>
      <span className="si-source">{issue.source}</span>
    </div>
    <div className="si-explanation">{issue.explanation}</div>
    <div className="si-recommend">{issue.recommendation}</div>
    <div className="si-evidence">
      {issue.evidence.map((item) => <span className="si-chip" title={item.summary} key={`${item.seq}-${item.type}`}>#{item.seq} · {item.type}</span>)}
    </div>
  </article>
}

function EmptyState({ run, pending }: { run: (line: string) => void; pending: boolean }) {
  const t = TEXT[isChinese() ? 'zh' : 'en']
  return <div className="si-card si-empty">
    <div className="si-empty-inner">
      <div className="si-logo si-empty-logo">SI</div>
      <h2>{t.emptyTitle}</h2>
      <p>{t.emptyBody}</p>
      <code className="si-command">/skill-insight analyze</code>
      <div className="si-actions" style={{ justifyContent: 'center' }}>
        <button className="si-button si-button-primary" disabled={pending} onClick={() => run('/skill-insight analyze')}>{pending && <span className="si-spinner" />} {t.analyze}</button>
        <button className="si-button" disabled={pending} onClick={() => run('/skill-insight analyze --mode rules')}>{t.rules}</button>
      </div>
    </div>
  </div>
}

function RunDetail({ run, execute, pending }: {
  run: InsightRunView
  execute: (line: string) => void
  pending: boolean
}) {
  const t = TEXT[isChinese() ? 'zh' : 'en']
  const report = run.report
  if (!report) {
    return <div className={`si-card ${run.status === 'failed' ? 'si-error' : ''}`}>
      <div className="si-eyebrow"><span className="si-status" data-status={run.status}>{statusText(run.status)}</span> {run.analysisId}</div>
      <div className="si-skill" style={{ marginTop: 10 }}>{run.skillName ?? 'Skill Insight'}</div>
      <p className="si-summary">{run.error ?? (run.status === 'running' ? 'Analyzing the frozen trace…' : 'Waiting for analysis data.')}</p>
    </div>
  }
  const action = run.status === 'applied'
    ? { label: t.revert, line: `/skill-insight revert ${run.analysisId}`, danger: true }
    : report.proposal && run.status !== 'running'
      ? { label: t.apply, line: `/skill-insight apply ${run.analysisId}`, danger: false }
      : null
  const metrics = [
    [t.events, report.metrics.totalEvents],
    [t.calls, report.metrics.toolCalls],
    [t.errors, report.metrics.toolErrors],
    [t.repeats, report.metrics.repeatedToolCalls],
  ] as const

  return <>
    <section className="si-card si-hero">
      <div className="si-eyebrow">
        <span className="si-status" data-status={run.status}>{statusText(run.status)}</span>
        <span>{report.effectiveMode}</span><span>·</span><span>cutoff #{report.cutoffSeq}</span>
      </div>
      <div className="si-hero-row">
        <div><div className="si-skill">{report.skill.name}</div><div className="si-summary">{report.summary}</div></div>
        {action && <div className="si-actions"><button className={`si-button si-button-primary ${action.danger ? 'si-button-danger' : ''}`} disabled={pending} onClick={() => execute(action.line)}>{action.label}</button></div>}
      </div>
    </section>
    <div className="si-metrics">{metrics.map(([label, value]) => <div className="si-metric" key={label}><div className="si-metric-value">{value}</div><div className="si-metric-label">{label}</div></div>)}</div>
    {report.warnings.map((warning) => <div className="si-notice" key={warning}>{warning}</div>)}
    <section className="si-card">
      <div className="si-section-title">{t.issues}</div>
      {report.issues.length > 0 ? report.issues.map((issue) => <Issue issue={issue} key={issue.code} />) : <div className="si-summary">{t.noIssues}</div>}
    </section>
    {report.proposal && <section className="si-card"><div className="si-section-title">{t.proposal}</div><Diff value={report.proposal.unifiedDiff} /></section>}
    <section className="si-card">
      <div className="si-section-title">{t.checks}</div>
      {report.validations.map((item) => <div className="si-validation" key={item.code}><span className="si-check">{item.ok ? '✓' : '!'}</span><span>{item.message}</span></div>)}
      {run.artifactDirectory && <div className="si-footer" title={run.artifactDirectory}>Local artifacts · {run.artifactDirectory}</div>}
    </section>
  </>
}

export function SkillInsightView({ useSession, runCommand }: ViewProps) {
  const t = TEXT[isChinese() ? 'zh' : 'en']
  const snapshot = useSession(value => value.views.get('skill-insight') ?? EMPTY_INSIGHT_SNAPSHOT)
  const [selectedId, setSelectedId] = useState(snapshot.latestAnalysisId)
  const [pending, setPending] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  useEffect(() => {
    if (!snapshot.runs.some((run) => run.analysisId === selectedId)) {
      setSelectedId(snapshot.latestAnalysisId)
    }
  }, [selectedId, snapshot.latestAnalysisId, snapshot.runs])
  const selected = useMemo(
    () => snapshot.runs.find((run) => run.analysisId === selectedId) ?? snapshot.runs[0],
    [selectedId, snapshot.runs],
  )
  const execute = (line: string) => {
    setPending(true)
    setLocalError(null)
    void runCommand(line)
      .catch((error: unknown) => setLocalError(error instanceof Error ? error.message : String(error)))
      .finally(() => setPending(false))
  }

  return <div className="si-root">
    <style>{CSS}</style>
    <div className="si-shell">
      <header className="si-top">
        <div className="si-brand"><div className="si-logo">SI</div><div><div className="si-title">Skill Insight</div><div className="si-subtitle">{t.subtitle}</div></div></div>
        <button className="si-button" disabled={pending} onClick={() => execute('/skill-insight analyze')}>{pending ? <span className="si-spinner" /> : '↗'} {t.analyze}</button>
      </header>
      {localError && <div className="si-notice si-error">{localError}</div>}
      {snapshot.runs.length === 0
        ? <EmptyState run={execute} pending={pending} />
        : <div className="si-layout">
          <aside className="si-history"><div className="si-history-title">{t.history}</div>{snapshot.runs.map((run) => <button className="si-history-item" data-active={run.analysisId === selected?.analysisId} onClick={() => setSelectedId(run.analysisId)} key={run.analysisId}><span className="si-history-skill">{run.report?.skill.name ?? run.skillName ?? run.analysisId}</span><span className="si-history-meta"><span>{run.status}</span><span>{run.report?.effectiveMode ?? run.requestedMode}</span></span></button>)}</aside>
          <main className="si-content">{selected && <RunDetail run={selected} execute={execute} pending={pending} />}</main>
        </div>}
    </div>
  </div>
}
