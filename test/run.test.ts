import { describe, expect, it } from 'vitest';
import { observedRun } from '../app/core/run';
import type { Gate, StoreEntry } from '../app/core/types';

// Shapes copied from real files on disk: a desktop-app session file, the live
// process registry entry, and the pipeline store entry for the same session.
const session = {
  sessionId: 'local_07bec961-7bd9-4559-b066-c21256348928',
  cliSessionId: 'aab05bda-62eb-4dd9-845a-259e428d9d2d',
  cwd: '/Users/me/Sites/acme/harbor/.claude/worktrees/client-create-update-mcp-3c9604',
  originCwd: '/Users/me/Sites/acme/harbor',
  worktreePath: '/Users/me/Sites/acme/harbor/.claude/worktrees/client-create-update-mcp-3c9604',
  worktreeName: 'client-create-update-mcp-3c9604',
  sourceBranch: 'master',
  branch: 'claude/client-index-design-bb488f',
  createdAt: 1791903372783,
  lastActivityAt: 1791910060756,
  title: 'Client index design updates',
  isArchived: false,
  prs: [{ prNumber: 297, repo: 'acme/harbor', url: 'https://github.com/acme/harbor/pull/297', state: 'OPEN' }],
  postTurnSummary: { status_category: 'completed', status_detail: 'Clients tab reworked', needs_action: '' },
};
const registry = { pid: 15660, sessionId: 'aab05bda-62eb-4dd9-845a-259e428d9d2d', status: 'idle', hostSessionId: 'local_07bec961-7bd9-4559-b066-c21256348928', updatedAt: 1791910060000 };
const entry: StoreEntry = {
  kind: 'feature',
  title: 'HBR-480 Client create/update tools',
  stages: [
    { id: 'plan', label: 'Plan', status: 'done', note: 'One PR, 3 pts · G2: go' },
    { id: 'implement', label: 'Implement', status: 'done', note: '18 specs green' },
    { id: 'review', label: 'Review', status: 'active', note: '' },
    { id: 'pr', label: 'File PR', status: 'pending', note: '' },
    { id: 'feedback', label: 'Feedback', status: 'pending', note: '' },
  ],
};
const gate: Gate = { id: 'G4', name: 'Review triage', since: 1791910060756, summary: '3 findings', text: '…' };

describe('observedRun', () => {
  it('builds a run from the store entry, session file and registry, taking the issue key from the title', () => {
    const run = observedRun({ entry, session, registry, gate: null, activity: [] });
    expect(run).toMatchObject({
      id: 'aab05bda-62eb-4dd9-845a-259e428d9d2d',
      source: 'observed',
      hostSessionId: 'local_07bec961-7bd9-4559-b066-c21256348928',
      key: 'HBR-480',
      title: 'Client create/update tools',
      kind: 'feature',
      cwd: session.cwd,
      worktree: 'client-create-update-mcp-3c9604',
      branch: 'claude/client-index-design-bb488f',
      repo: 'acme/harbor',
      pr: { number: 297, url: 'https://github.com/acme/harbor/pull/297', state: 'OPEN' },
      started: 1791903372783,
      lastActivity: 1791910060756,
    });
  });

  it('is idle when the process is alive and idle with no gate and an open stage', () => {
    const run = observedRun({ entry, session, registry, gate: null, activity: [] });
    expect(run.status).toBe('idle');
    expect(run.statusLabel).toBe('Clients tab reworked');
  });

  it('needs you when a gate is open and the process is idle', () => {
    const run = observedRun({ entry, session, registry, gate, activity: [] });
    expect(run.status).toBe('needs');
    expect(run.gate).toBe(gate);
  });

  it('is working while the process is busy, even if a stale gate was parsed', () => {
    const run = observedRun({ entry, session, registry: { ...registry, status: 'busy' }, gate, activity: [] });
    expect(run.status).toBe('working');
    expect(run.gate).toBeNull();
  });

  it('is done when every stage is closed, with the PR link as the done text', () => {
    const closed: StoreEntry = { ...entry, stages: entry.stages.map((s) => ({ ...s, status: s.id === 'feedback' ? 'skipped' : 'done' })) };
    const run = observedRun({ entry: closed, session, registry, gate: null, activity: [] });
    expect(run.status).toBe('done');
    expect(run.done?.label).toBe('Done');
  });

  it('is done as Stopped when no process is alive and a stage is still open', () => {
    const run = observedRun({ entry, session, registry: null, gate: null, activity: [] });
    expect(run.status).toBe('done');
    expect(run.done?.label).toBe('Stopped');
  });

  it('falls back to the session title and no key when the store title has no issue id', () => {
    const run = observedRun({ entry: { ...entry, title: 'Client tools' }, session, registry, gate: null, activity: [] });
    expect(run.key).toBe('');
    expect(run.title).toBe('Client tools');
  });
});
