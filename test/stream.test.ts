import { describe, expect, it } from 'vitest';
import { initialStream, reduceStream, type StreamState } from '../app/core/stream';

// Event shapes follow `claude -p --output-format stream-json`: one JSON
// object per line, each carrying the session_id.
const sid = '7c0a7d3e-1111-4222-8333-444455556666';
const init = { type: 'system', subtype: 'init', session_id: sid, cwd: '/wt', tools: ['Bash'], model: 'claude-opus-5-5' };
const text = { type: 'assistant', session_id: sid, message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: 'Checked Linear: nothing open. One PR, 3 pts.' }] } };
const ask = { type: 'assistant', session_id: sid, message: { id: 'm1', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_q1', name: 'AskUserQuestion', input: { questions: [{ question: 'Where does the rollover live?', header: 'A', options: [{ label: 'Service object' }, { label: 'Callback' }] }] } }] } };
const askResult = { type: 'user', session_id: sid, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_q1', content: 'Your questions have been answered: "Where does the rollover live?"="Service object"' }] } };
const bash = { type: 'assistant', session_id: sid, message: { id: 'm2', role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_b1', name: 'Bash', input: { command: 'bundle exec rspec', description: 'Run the suite' } }] } };
const planText = { type: 'assistant', session_id: sid, message: { id: 'm3', role: 'assistant', content: [{ type: 'text', text: '**What ships:** the closer.\n\nImplement?' }] } };
const result = { type: 'result', subtype: 'success', session_id: sid, result: '**What ships:** the closer.\n\nImplement?', duration_ms: 1200, is_error: false };

const run = (events: unknown[], stage: 'plan' | 'implement' | 'review' = 'plan') => events.reduce<StreamState>((s, e) => reduceStream(s, e, { now: 1000, activeStage: stage }), initialStream());

describe('reduceStream', () => {
  it('marks the run working on init', () => {
    const s = run([init]);
    expect(s.turnOpen).toBe(true);
    expect(s.gate).toBeNull();
  });

  it('opens a gate with the questions and tool_use id when AskUserQuestion is called', () => {
    const s = run([init, text, ask]);
    expect(s.gate).toMatchObject({ id: 'G1', toolUseId: 'toolu_q1', summary: 'Where does the rollover live?', text: 'Checked Linear: nothing open. One PR, 3 pts.', since: 1000 });
    expect(s.gate?.questions?.[0].options.map((o) => o.label)).toEqual(['Service object', 'Callback']);
  });

  it('closes the question gate once its tool_result arrives', () => {
    const s = run([init, text, ask, askResult, bash]);
    expect(s.gate).toBeNull();
    expect(s.turnOpen).toBe(true);
  });

  it('opens a gate from the final text when the turn ends on a question', () => {
    const s = run([init, text, ask, askResult, planText, result]);
    expect(s.turnOpen).toBe(false);
    expect(s.gate).toMatchObject({ id: 'G2', name: 'Plan', summary: 'Implement?' });
    expect(s.gate?.text).toContain('What ships');
  });

  it('ends idle, with no gate, when the turn ends on a plain report', () => {
    const report = { type: 'assistant', session_id: sid, message: { id: 'm4', role: 'assistant', content: [{ type: 'text', text: 'PR opened: almanac#1284.' }] } };
    const s = run([init, report, { ...result, result: 'PR opened: almanac#1284.' }], 'review');
    expect(s.turnOpen).toBe(false);
    expect(s.gate).toBeNull();
  });

  it('keeps a newest-first feed of what Claude said, leaving tool calls out', () => {
    const s = run([init, text, ask, askResult, bash]);
    expect(s.activity.map((a) => a.text)).toEqual(['Checked Linear: nothing open. One PR, 3 pts.']);
  });

  it('reopens the turn and clears the gate when the user answers', () => {
    const s = reduceStream(run([init, text, ask, askResult, planText, result]), { type: 'clearance:sent', text: 'go' }, { now: 2000, activeStage: 'plan' });
    expect(s.turnOpen).toBe(true);
    expect(s.gate).toBeNull();
    expect(s.activity[0]).toMatchObject({ text: 'You · go', at: 2000 });
  });
});
