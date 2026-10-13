import type { RunKind, Stage, StageId, StageStatus, StoreEntry } from './types';

// The pane labels ("Plan (grilling)", "Implement, test-first") describe the
// skill each stage runs; the board shows the stage itself.
const LABEL: Record<StageId, string> = {
  plan: 'Plan',
  implement: 'Implement',
  review: 'Review',
  pr: 'File PR',
  feedback: 'Feedback',
};

const STAGE_IDS = new Set<string>(Object.keys(LABEL));

/** The board's label for a stage; a bug run's implement stage is "Fix". */
export function stageLabel(id: StageId, kind: RunKind): string {
  return id === 'implement' && kind === 'bug' ? 'Fix' : LABEL[id];
}

/** The stage ids in pipeline order for a run kind. */
export function stageOrder(kind: RunKind): StageId[] {
  const all: StageId[] = ['plan', 'implement', 'review', 'pr', 'feedback'];
  return kind === 'bug' ? all.filter((s) => s !== 'plan') : all;
}
const STATUSES = new Set<string>(['pending', 'active', 'done', 'skipped']);

/** Reads one session's run out of the pipeline plugin's store file. */
export function stagesFromStore(store: unknown, cliSessionId: string): StoreEntry | null {
  if (!store || typeof store !== 'object') return null;
  const raw = (store as Record<string, unknown>)[`run:${cliSessionId}`];
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as { kind?: unknown; title?: unknown; stages?: unknown };
  const kind: RunKind = entry.kind === 'bug' ? 'bug' : 'feature';
  const title = typeof entry.title === 'string' ? entry.title : '';
  const stages: Stage[] = Array.isArray(entry.stages)
    ? entry.stages
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && STAGE_IDS.has(String((s as Record<string, unknown>).id)))
        .map((s) => {
          const id = s.id as StageId;
          const status = STATUSES.has(String(s.status)) ? (s.status as StageStatus) : 'pending';
          const label = stageLabel(id, kind);
          return { id, label, status, note: typeof s.note === 'string' ? s.note : '' };
        })
    : [];
  return { kind, title, stages };
}

/** Every entry in the store, keyed by cliSessionId; cleared runs are omitted. */
export function allStoreEntries(store: unknown): Map<string, StoreEntry> {
  const out = new Map<string, StoreEntry>();
  if (!store || typeof store !== 'object') return out;
  for (const key of Object.keys(store as object)) {
    if (!key.startsWith('run:')) continue;
    const id = key.slice(4);
    const entry = stagesFromStore(store, id);
    if (entry) out.set(id, entry);
  }
  return out;
}
