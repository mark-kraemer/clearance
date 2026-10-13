import { describe, expect, it } from 'vitest';
import { desktopHeldState, findImported, type DesktopView } from '../app/core/handoff';
import type { Gate } from '../app/core/types';

const cwd = '/Users/me/Sites/app/.claude/worktrees/fix-label-a1b2c3';

describe('findImported', () => {
  it('picks the session file the desktop created at the run worktree after the handoff', () => {
    const sessions = [
      { sessionId: 'local_other', cliSessionId: 'other', cwd: '/Users/me/Sites/app', createdAt: 2000 },
      { sessionId: 'local_new', cliSessionId: 'new', cwd, createdAt: 1500 },
    ];
    expect(findImported(sessions, { cwd, since: 1000 })?.sessionId).toBe('local_new');
  });

  it('ignores a session at the worktree from before the handoff, so a second handoff keeps the known id', () => {
    const sessions = [{ sessionId: 'local_known', cliSessionId: 'known', cwd, createdAt: 500 }];
    expect(findImported(sessions, { cwd, since: 1000 })).toBeNull();
  });

  it('takes the earliest import when the worktree has more than one since the handoff', () => {
    const sessions = [
      { sessionId: 'local_later', cliSessionId: 'later', cwd, createdAt: 3000 },
      { sessionId: 'local_first', cliSessionId: 'first', cwd, createdAt: 1200 },
    ];
    expect(findImported(sessions, { cwd, since: 1000 })?.sessionId).toBe('local_first');
  });

  it('skips a session file that has no cli session id yet', () => {
    expect(findImported([{ sessionId: 'local_half', cwd, createdAt: 1200 }], { cwd, since: 1000 })).toBeNull();
  });
});

describe('desktopHeldState', () => {
  const gate: Gate = { id: 'G4', name: 'Review triage', since: 10, summary: 'Reply go', text: 'Reply go to take rows 1-7' };
  const view = (over: Partial<DesktopView>): DesktopView => ({ open: true, busy: false, gate: null, activity: [], ...over });

  it('reads as handed over and held before the desktop has written anything', () => {
    expect(desktopHeldState(null, false, 5)).toMatchObject({ status: 'idle', statusLabel: 'Handed to Claude Code', desktopOpen: true });
  });

  it('is working while the desktop process is busy', () => {
    expect(desktopHeldState(view({ busy: true, gate }), false, 5)).toMatchObject({ status: 'working', gate: null, desktopOpen: true });
  });

  it('shows the desktop gate, open or archived', () => {
    expect(desktopHeldState(view({ gate }), false, 5)).toMatchObject({ status: 'needs', statusLabel: 'G4 Review triage', gate, desktopOpen: true });
    expect(desktopHeldState(view({ gate, open: false }), false, 5)).toMatchObject({ status: 'needs', desktopOpen: false });
  });

  it('is idle without a gate, saying whether the desktop still holds it', () => {
    expect(desktopHeldState(view({}), false, 5).statusLabel).toBe('In Claude Code');
    expect(desktopHeldState(view({ open: false }), false, 5).statusLabel).toBe('Archived in Claude Code');
  });

  it('is done once every stage closed', () => {
    expect(desktopHeldState(view({ lastActivity: 99 }), true, 5)).toMatchObject({ status: 'done', done: { label: 'Done', when: 99 } });
  });
});
