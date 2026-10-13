import { describe, expect, it } from 'vitest';
import { groupRuns } from '../app/core/order';
import type { Run } from '../app/core/types';

const base = (over: Partial<Run>): Run => ({
  id: 'x', source: 'observed', cliSessionId: 'x', key: 'K-1', title: 't', kind: 'feature', cwd: '/', started: 0, lastActivity: 0,
  status: 'idle', statusLabel: '', stages: [], gate: null, activity: [], ...over,
});
const gate = (since: number) => ({ id: 'G1' as const, name: 'Scope', since, summary: 's', text: '' });

describe('groupRuns', () => {
  it('puts needs-you runs first, longest wait first, then working, then idle, then done', () => {
    const runs = [
      base({ id: 'done', status: 'done', lastActivity: 50, done: { label: 'Done', when: 50 } }),
      base({ id: 'short', status: 'needs', gate: gate(900) }),
      base({ id: 'idle', status: 'idle', lastActivity: 10 }),
      base({ id: 'working', status: 'working', started: 5 }),
      base({ id: 'long', status: 'needs', gate: gate(100) }),
    ];
    const g = groupRuns(runs, 1000);
    expect(g.needs.map((r) => r.id)).toEqual(['long', 'short']);
    expect(g.working.map((r) => r.id)).toEqual(['working', 'idle']);
    expect(g.done.map((r) => r.id)).toEqual(['done']);
    expect(g.flat.map((r) => r.id)).toEqual(['long', 'short', 'working', 'idle', 'done']);
  });

  it('orders working before idle, each by most recent activity, and done by most recent first', () => {
    const runs = [
      base({ id: 'd-old', status: 'done', done: { label: 'Done', when: 10 } }),
      base({ id: 'i-new', status: 'idle', lastActivity: 90 }),
      base({ id: 'w-old', status: 'working', lastActivity: 20 }),
      base({ id: 'd-new', status: 'done', done: { label: 'Done', when: 80 } }),
      base({ id: 'w-new', status: 'working', lastActivity: 70 }),
      base({ id: 'i-old', status: 'idle', lastActivity: 30 }),
    ];
    const g = groupRuns(runs, 1000);
    expect(g.working.map((r) => r.id)).toEqual(['w-new', 'w-old', 'i-new', 'i-old']);
    expect(g.done.map((r) => r.id)).toEqual(['d-new', 'd-old']);
  });

  it('drops done runs older than the horizon', () => {
    const runs = [base({ id: 'today', status: 'done', done: { label: 'Done', when: 900 } }), base({ id: 'ancient', status: 'done', done: { label: 'Done', when: 1 } })];
    expect(groupRuns(runs, 1000, 500).done.map((r) => r.id)).toEqual(['today']);
  });
});
