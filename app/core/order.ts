import type { Run } from './types';

export interface Grouped {
  needs: Run[];
  working: Run[];
  done: Run[];
  flat: Run[];
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * The board's one ranking rule: whatever is blocked on the human comes
 * first, longest wait first. Working runs (busy, then idle) follow by recent
 * activity; done runs trail, newest first, and drop off after the horizon.
 */
export function groupRuns(runs: Run[], now: number, doneHorizonMs = DAY): Grouped {
  const needs = runs.filter((r) => r.status === 'needs' && r.gate).sort((a, b) => a.gate!.since - b.gate!.since);
  const busy = runs.filter((r) => r.status === 'working').sort((a, b) => b.lastActivity - a.lastActivity);
  const idle = runs.filter((r) => r.status === 'idle').sort((a, b) => b.lastActivity - a.lastActivity);
  const working = [...busy, ...idle];
  const done = runs
    .filter((r) => r.status === 'done' && (r.done?.when ?? r.lastActivity) >= now - doneHorizonMs)
    .sort((a, b) => (b.done?.when ?? b.lastActivity) - (a.done?.when ?? a.lastActivity));
  return { needs, working, done, flat: [...needs, ...working, ...done] };
}
