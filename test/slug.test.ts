import { describe, expect, it } from 'vitest';
import { slug } from '../app/core/slug';

describe('slug', () => {
  it('turns a task title into a worktree-safe name, issue key first', () => {
    expect(slug('ALM-520 Partner pulse digest email')).toBe('alm-520-partner-pulse-digest-email');
  });

  it('collapses punctuation and trims dashes', () => {
    expect(slug('  Fix: PTO double-count (booked hours)! ')).toBe('fix-pto-double-count-booked-hours');
  });

  it('clips to 40 characters without ending in a dash', () => {
    const s = slug('ALM-521 Milestone close emails the project manager twice on Fridays');
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith('-')).toBe(false);
  });
});
