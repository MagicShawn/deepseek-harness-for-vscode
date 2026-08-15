import { useEffect, useMemo, useState, type FormEvent } from 'react'

import type { AnalysisMode } from '../shared/types.js'
import type { SkillInsightActions, SkillOption } from './actions.js'
import {
  groupSkillChoices,
  initialSkillSelection,
  type SkillSelection,
} from './analysisFormModel.js'

const CSS = `
.si-analysis-form{border:1px solid var(--si-line);border-radius:14px;padding:18px;background:var(--si-panel)}.si-analysis-head{display:flex;justify-content:space-between;gap:12px;margin-bottom:16px}.si-analysis-title{font-size:16px;font-weight:720}.si-analysis-copy{color:var(--si-muted);font-size:12px;margin-top:3px}.si-field{margin-top:14px}.si-label{display:block;font-size:12px;font-weight:700;margin-bottom:7px}.si-search{width:100%;border:1px solid var(--si-line);border-radius:9px;padding:9px 10px;background:color-mix(in srgb,var(--si-bg) 72%,transparent);color:inherit;font:inherit;outline:none}.si-search:focus{border-color:var(--si-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--si-accent) 24%,transparent)}.si-skill-list{max-height:260px;overflow:auto;margin-top:8px;border:1px solid var(--si-line);border-radius:10px;padding:6px;background:color-mix(in srgb,var(--si-bg) 45%,transparent)}.si-choice-group+.si-choice-group{margin-top:8px;padding-top:8px;border-top:1px solid var(--si-line)}.si-choice-title{padding:3px 7px 6px;color:var(--si-muted);font-size:10px;font-weight:750;text-transform:uppercase;letter-spacing:.08em}.si-skill-option{display:flex;width:100%;align-items:center;gap:10px;border:0;border-radius:8px;padding:8px;text-align:left;background:transparent;color:inherit;font:inherit;cursor:pointer}.si-skill-option:hover,.si-skill-option[aria-selected=true]{background:color-mix(in srgb,var(--si-accent) 13%,transparent)}.si-choice-radio{width:13px;height:13px;flex:0 0 auto;border:1px solid var(--si-muted);border-radius:50%}.si-skill-option[aria-selected=true] .si-choice-radio{border:4px solid var(--si-accent)}.si-choice-body{display:flex;min-width:0;flex-direction:column}.si-choice-name{font-weight:680}.si-choice-description{overflow:hidden;color:var(--si-muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.si-segment{display:inline-flex;border:1px solid var(--si-line);border-radius:9px;padding:3px;background:color-mix(in srgb,var(--si-bg) 46%,transparent)}.si-segment button{border:0;border-radius:6px;padding:6px 11px;background:transparent;color:var(--si-muted);font:inherit;font-weight:650;cursor:pointer}.si-segment button[aria-pressed=true]{background:var(--si-panel);color:var(--si-fg);box-shadow:0 1px 4px #0003}.si-analysis-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px}.si-analysis-status{min-height:18px;color:var(--si-muted);font-size:11px}.si-form-alert{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:9px;border:1px solid color-mix(in srgb,var(--si-bad) 45%,transparent);border-radius:9px;padding:8px 10px;color:#ffabb2;background:color-mix(in srgb,var(--si-bad) 8%,transparent);font-size:12px}.si-empty-choices{padding:13px;color:var(--si-muted);font-size:12px;text-align:center}
`

const TEXT = {
  en: {
    title: 'New analysis',
    copy: 'Choose a Skill and analysis mode. The trace stays local.',
    skill: 'Skill',
    search: 'Search Skills',
    auto: 'Auto-detect',
    autoDescription: 'Use the Skill detected from this session.',
    session: 'Current session',
    installed: 'All installed Skills',
    none: 'No matching Skills.',
    mode: 'Analysis mode',
    hybrid: 'Hybrid',
    rules: 'Rules',
    start: 'Start analysis',
    analyzing: 'Analyzing…',
    loading: 'Loading installed Skills…',
    ready: (count: number) => `${count} installed Skills available`,
    choose: 'Choose one of the Skills detected in this session.',
    retry: 'Retry',
  },
  zh: {
    title: '新建分析',
    copy: '选择 Skill 和分析模式；Trace 始终保留在本地。',
    skill: 'Skill',
    search: '搜索 Skills',
    auto: '自动检测',
    autoDescription: '使用当前 Session 中检测到的 Skill。',
    session: '当前 Session',
    installed: '全部已安装 Skills',
    none: '没有匹配的 Skill。',
    mode: '分析模式',
    hybrid: '混合分析',
    rules: '仅规则',
    start: '开始分析',
    analyzing: '正在分析…',
    loading: '正在加载已安装 Skills…',
    ready: (count: number) => `可用的已安装 Skills：${count}`,
    choose: '请从当前 Session 检测到的 Skills 中选择一个。',
    retry: '重试',
  },
} as const

function isChinese(): boolean {
  return typeof document !== 'undefined'
    && document.documentElement.lang.toLocaleLowerCase().startsWith('zh')
}

export interface SkillInsightAnalysisFormProps {
  readonly detectedSkillNames: readonly string[]
  readonly actions: SkillInsightActions
  readonly onCompleted?: () => void
}

function Choice({ name, description, selected, onSelect }: {
  name: string
  description: string
  selected: boolean
  onSelect: () => void
}) {
  return <button
    type="button"
    role="option"
    aria-selected={selected}
    className="si-skill-option"
    onClick={onSelect}
  >
    <span className="si-choice-radio" aria-hidden />
    <span className="si-choice-body">
      <span className="si-choice-name">{name}</span>
      <span className="si-choice-description">{description}</span>
    </span>
  </button>
}

export function SkillInsightAnalysisForm({
  detectedSkillNames,
  actions,
  onCompleted,
}: SkillInsightAnalysisFormProps) {
  const t = TEXT[isChinese() ? 'zh' : 'en']
  const [selection, setSelection] = useState<SkillSelection>(() => (
    initialSkillSelection(detectedSkillNames)
  ))
  const [mode, setMode] = useState<AnalysisMode>('hybrid')
  const [query, setQuery] = useState('')
  const [catalog, setCatalog] = useState<readonly SkillOption[]>([])
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [pending, setPending] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setCatalogState('loading')
    setCatalogError(null)
    void actions.loadSkills()
      .then((skills) => {
        if (!active) return
        setCatalog(skills)
        setCatalogState('ready')
      })
      .catch((error: unknown) => {
        if (!active) return
        setCatalogState('error')
        setCatalogError(error instanceof Error ? error.message : String(error))
      })
    return () => { active = false }
  }, [actions, reload])

  const groups = useMemo(
    () => groupSkillChoices(detectedSkillNames, catalog, query),
    [catalog, detectedSkillNames, query],
  )
  const selectedName = selection?.kind === 'skill' ? selection.name : undefined
  const multipleDetected = detectedSkillNames.length > 1

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending || selection === null) return
    setPending(true)
    setAnalysisError(null)
    void actions.analyze({
      ...(selection.kind === 'skill' ? { skillName: selection.name } : {}),
      mode,
    }).then(() => onCompleted?.())
      .catch((error: unknown) => {
        setAnalysisError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => setPending(false))
  }

  return <form className="si-analysis-form" onSubmit={submit}>
    <style>{CSS}</style>
    <div className="si-analysis-head">
      <div><div className="si-analysis-title">{t.title}</div><div className="si-analysis-copy">{t.copy}</div></div>
    </div>
    <div className="si-field">
      <label className="si-label" htmlFor="si-skill-search">{t.skill}</label>
      <input
        id="si-skill-search"
        className="si-search"
        type="search"
        value={query}
        aria-label={t.search}
        placeholder={t.search}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <div className="si-skill-list" role="listbox" aria-label={t.skill}>
        {!multipleDetected && <Choice
          name={t.auto}
          description={t.autoDescription}
          selected={selection?.kind === 'auto'}
          onSelect={() => setSelection({ kind: 'auto' })}
        />}
        {groups.session.length > 0 && <div className="si-choice-group">
          <div className="si-choice-title">{t.session}</div>
          {groups.session.map((choice) => <Choice
            key={`session-${choice.name}`}
            name={choice.name}
            description={choice.description}
            selected={selectedName === choice.name}
            onSelect={() => setSelection({ kind: 'skill', name: choice.name })}
          />)}
        </div>}
        <div className="si-choice-group">
          <div className="si-choice-title">{t.installed}</div>
          {groups.installed.map((choice) => <Choice
            key={`installed-${choice.name}`}
            name={choice.name}
            description={choice.description}
            selected={selectedName === choice.name}
            onSelect={() => setSelection({ kind: 'skill', name: choice.name })}
          />)}
          {catalogState === 'ready' && groups.session.length + groups.installed.length === 0
            && <div className="si-empty-choices">{t.none}</div>}
        </div>
      </div>
      {multipleDetected && selection === null && <div className="si-analysis-status">{t.choose}</div>}
      {catalogState === 'error' && <div className="si-form-alert" role="alert">
        <span>{catalogError}</span>
        <button className="si-button" type="button" onClick={() => setReload((value) => value + 1)}>{t.retry}</button>
      </div>}
    </div>
    <div className="si-field">
      <span className="si-label">{t.mode}</span>
      <div className="si-segment" role="group" aria-label={t.mode}>
        <button type="button" aria-pressed={mode === 'hybrid'} onClick={() => setMode('hybrid')}>{t.hybrid}</button>
        <button type="button" aria-pressed={mode === 'rules'} onClick={() => setMode('rules')}>{t.rules}</button>
      </div>
    </div>
    {analysisError && <div className="si-form-alert" role="alert">{analysisError}</div>}
    <div className="si-analysis-footer">
      <div className="si-analysis-status" role="status" aria-live="polite">
        {pending ? t.analyzing : catalogState === 'loading' ? t.loading : catalogState === 'ready' ? t.ready(catalog.length) : ''}
      </div>
      <button className="si-button si-button-primary" type="submit" disabled={pending || selection === null}>
        {pending ? t.analyzing : t.start}
      </button>
    </div>
  </form>
}
