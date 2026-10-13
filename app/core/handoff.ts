import type { SessionFile } from './run';
import type { Activity, Gate, Run } from './types';

/*
 * A run Clearance started can be handed to the Claude desktop app and taken
 * back. Only one process may hold a session at a time: a `claude --resume`
 * next to the desktop's live process forks the conversation, and neither side
 * sees the other's turns. So a run has a holder, and Clearance takes it back
 * only once the desktop's process is gone (the user archived the session).
 */

/** What Clearance reads of a session while the desktop app holds it. */
export interface DesktopView {
  hostSessionId?: string;
  /**
   * The desktop holds the session: a live `claude` process, or a session it
   * has open and would resume on the next message. Only archiving releases it.
   */
  open: boolean;
  busy: boolean;
  gate: Gate | null;
  activity: Activity[];
  lastActivity?: number;
}

/**
 * The desktop app re-keys a CLI session the first time it imports one: a new
 * session id, the transcript renamed to match, and a fresh session file whose
 * cwd is the run's worktree and whose createdAt is the import. Every owned run
 * has a worktree of its own, so the first session file at that cwd created
 * since the handoff is the import.
 */
export function findImported(sessions: SessionFile[], { cwd, since }: { cwd: string; since: number }): SessionFile | null {
  const found = sessions.filter((s) => s.cliSessionId && s.cwd === cwd && (s.createdAt ?? 0) >= since);
  return found.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0] ?? null;
}

export type HeldState = Pick<Run, 'status' | 'statusLabel' | 'gate' | 'done' | 'desktopOpen'>;

/**
 * An owned run's status while the desktop holds it, read from the desktop's
 * side of the session. Before the desktop has written anything for it (the
 * import is still landing) the run reads as handed over and held.
 */
export function desktopHeldState(view: DesktopView | null, allClosed: boolean, lastActivity: number): HeldState {
  const desktopOpen = !view || view.open;
  if (view?.busy) return { status: 'working', statusLabel: 'Working in Claude Code', gate: null, desktopOpen };
  if (allClosed) return { status: 'done', statusLabel: 'Done', gate: null, done: { label: 'Done', when: view?.lastActivity || lastActivity, text: 'Every stage closed.' }, desktopOpen };
  if (view?.gate) return { status: 'needs', statusLabel: `${view.gate.id} ${view.gate.name}`, gate: view.gate, desktopOpen };
  return { status: 'idle', statusLabel: !view ? 'Handed to Claude Code' : desktopOpen ? 'In Claude Code' : 'Archived in Claude Code', gate: null, desktopOpen };
}
