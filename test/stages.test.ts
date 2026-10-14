import { describe, expect, it } from 'vitest';
import { stagesFromStore } from '../app/core/stages';

// A pipeline store file is a flat object keyed by `run:<cliSessionId>`; a
// cleared run is stored as null.
const store = {
  'run:aab05bda-62eb-4dd9-845a-259e428d9d2d': {
    kind: 'feature',
    title: 'HBR-480 Client create/update tools',
    stages: [
      { id: 'plan', label: 'Plan (grilling)', status: 'done', note: 'One PR, 3 pts · G2: go' },
      { id: 'implement', label: 'Implement, test-first', status: 'done', note: '18 specs green · 4 commits' },
      { id: 'review', label: 'Ready for review', status: 'active' },
      { id: 'pr', label: 'File PR', status: 'pending' },
      { id: 'feedback', label: 'Reviewer feedback', status: 'pending' },
    ],
  },
  'run:0000-cleared': null,
};

describe('stagesFromStore', () => {
  it('returns the run entry for a session with its kind, title and stages', () => {
    const entry = stagesFromStore(store, 'aab05bda-62eb-4dd9-845a-259e428d9d2d');
    expect(entry).toEqual({
      kind: 'feature',
      title: 'HBR-480 Client create/update tools',
      stages: [
        { id: 'plan', label: 'Plan', status: 'done', note: 'One PR, 3 pts · G2: go' },
        { id: 'implement', label: 'Implement', status: 'done', note: '18 specs green · 4 commits' },
        { id: 'review', label: 'Review', status: 'active', note: '' },
        { id: 'pr', label: 'File PR', status: 'pending', note: '' },
        { id: 'feedback', label: 'Feedback', status: 'pending', note: '' },
      ],
    });
  });

  it('returns null for a cleared run and for an unknown session', () => {
    expect(stagesFromStore(store, '0000-cleared')).toBeNull();
    expect(stagesFromStore(store, 'nope')).toBeNull();
  });

  it('labels a bug run’s first stage Fix', () => {
    const bug = { 'run:b': { kind: 'bug', title: 'HBR-512 Booked hours double-count PTO', stages: [{ id: 'implement', label: 'Fix, test-first', status: 'active' }] } };
    expect(stagesFromStore(bug, 'b')?.stages[0]).toEqual({ id: 'implement', label: 'Fix', status: 'active', note: '' });
  });
});
