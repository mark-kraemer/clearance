import type { Activity, Gate, Run, StoreEntry } from './types';

/** The desktop app's per-session file, as far as the board reads it. */
export interface SessionFile {
  sessionId?: string;
  cliSessionId?: string;
  cwd?: string;
  originCwd?: string;
  worktreePath?: string;
  worktreeName?: string;
  branch?: string;
  createdAt?: number;
  lastActivityAt?: number;
  title?: string;
  isArchived?: boolean;
  prs?: { prNumber?: number; repo?: string; url?: string; state?: string }[];
  postTurnSummary?: { status_category?: string | null; status_detail?: string; needs_action?: string } | null;
}

/** One entry of the live process registry at ~/.claude/sessions/<pid>.json. */
export interface RegistryEntry {
  pid?: number;
  sessionId?: string;
  status?: string;
  hostSessionId?: string;
  updatedAt?: number;
}

export interface ObservedInput {
  entry: StoreEntry;
  session: SessionFile | null;
  registry: RegistryEntry | null;
  gate: Gate | null;
  activity: Activity[];
}

const ISSUE_KEY = /^([A-Z][A-Z0-9]+-\d+)\s*(.*)$/;

/** Splits "ALM-480 Partner tools" into its issue key and title. */
export function splitTitle(title: string): { key: string; title: string } {
  const m = title.trim().match(ISSUE_KEY);
  return m ? { key: m[1], title: m[2] || title.trim() } : { key: '', title: title.trim() };
}

const CLOSED = new Set(['done', 'skipped']);

/** Merges the four observed sources for one session into a run. */
export function observedRun({ entry, session, registry, gate, activity }: ObservedInput): Run {
  const cliSessionId = session?.cliSessionId || registry?.sessionId || '';
  const { key, title } = splitTitle(entry.title || session?.title || '');
  const pr = session?.prs?.find((p) => p.url);
  const allClosed = entry.stages.length > 0 && entry.stages.every((s) => CLOSED.has(s.status));
  const alive = !!registry;
  const busy = registry?.status === 'busy';
  const lastActivity = session?.lastActivityAt || registry?.updatedAt || Date.now();

  let status: Run['status'];
  let statusLabel: string;
  let done: Run['done'];
  let openGate: Gate | null = null;
  if (busy) {
    status = 'working';
    statusLabel = activeLabel(entry) || 'working';
  } else if (allClosed) {
    status = 'done';
    statusLabel = 'Done';
    done = { label: 'Done', when: lastActivity, text: pr ? `${pr.repo || ''}#${pr.prNumber} ${String(pr.state || '').toLowerCase()}`.trim() : 'Every stage closed.' };
  } else if (!alive) {
    status = 'done';
    statusLabel = 'Stopped';
    done = { label: 'Stopped', when: lastActivity, text: 'The session is not running. Open it in Claude Code to continue.' };
  } else if (gate) {
    status = 'needs';
    statusLabel = `${gate.id} ${gate.name}`;
    openGate = gate;
  } else {
    status = 'idle';
    statusLabel = session?.postTurnSummary?.status_detail || 'idle';
  }

  return {
    id: cliSessionId,
    source: 'observed',
    cliSessionId,
    hostSessionId: session?.sessionId || registry?.hostSessionId,
    key,
    title: title || session?.title || cliSessionId,
    kind: entry.kind,
    cwd: session?.cwd || '',
    worktree: session?.worktreeName,
    branch: session?.branch,
    repo: pr?.repo || repoFromPath(session?.originCwd),
    pr: pr ? { number: pr.prNumber || 0, url: pr.url || '', state: pr.state || '' } : undefined,
    started: session?.createdAt || lastActivity,
    lastActivity,
    status,
    statusLabel,
    stages: entry.stages,
    gate: openGate,
    activity,
    done,
  };
}

function activeLabel(entry: StoreEntry): string {
  const active = entry.stages.find((s) => s.status === 'active');
  return active ? active.label : '';
}

function repoFromPath(p?: string): string | undefined {
  if (!p) return undefined;
  const parts = p.split('/').filter(Boolean);
  return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : parts[parts.length - 1];
}
