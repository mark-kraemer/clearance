export type PipelineKind = 'feature' | 'bug'
export type StageId = 'plan' | 'implement' | 'review' | 'pr' | 'feedback'
export type StageStatus = 'pending' | 'active' | 'done' | 'skipped'
export type Stage = { id: StageId; label: string; status: StageStatus; note?: string }
export type PipelineRun = { kind: PipelineKind; title: string; stages: Stage[] }
