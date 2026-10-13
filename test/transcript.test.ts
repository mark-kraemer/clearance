import { describe, expect, it } from 'vitest';
import { activityFromTranscript, gateFromTranscript, parseJsonl } from '../app/core/transcript';

// Line shapes copied from a real ~/.claude/projects transcript. Each content
// block of one API message is its own line sharing message.id.
const t0 = '2026-10-13T19:57:20.000Z';
const t1 = '2026-10-13T19:57:22.189Z';
const t2 = '2026-10-13T19:58:00.000Z';
const t3 = '2026-10-13T20:05:00.000Z';

const askText = { type: 'assistant', uuid: 'a1', parentUuid: 'u0', isSidechain: false, timestamp: t0, message: { id: 'msg_1', role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'text', text: 'Interview answered. Two questions before I write PRODUCT.md.' }] } };
const askTool = { type: 'assistant', uuid: 'a2', parentUuid: 'a1', isSidechain: false, timestamp: t1, message: { id: 'msg_1', role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'toolu_014d', name: 'AskUserQuestion', input: { questions: [{ question: 'What should this session deliver?', header: 'Deliverable', multiSelect: false, options: [{ label: 'HTML prototype', description: 'Fast' }, { label: 'SwiftUI', description: 'Native' }] }] } }] } };
const askResult = { type: 'user', uuid: 'u1', parentUuid: 'a2', isSidechain: false, timestamp: t2, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_014d', content: 'Your questions have been answered: "What should this session deliver?"="HTML prototype"' }] } };
const planText = { type: 'assistant', uuid: 'a3', parentUuid: 'u1', isSidechain: false, timestamp: t3, message: { id: 'msg_2', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: '**What ships:** the service object.\n\n**Test seams:** the closer.\n\nImplement?' }] } };
const reportText = { type: 'assistant', uuid: 'a4', parentUuid: 'u1', isSidechain: false, timestamp: t3, message: { id: 'msg_3', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Committed as 5c12d9a. Nothing was pushed.' }] } };
const bashTool = { type: 'assistant', uuid: 'a5', parentUuid: 'u1', isSidechain: false, timestamp: t2, message: { id: 'msg_4', role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'toolu_b', name: 'Bash', input: { command: 'pnpm vitest run', description: 'Run the tests' } }] } };
const sidechain = { type: 'assistant', uuid: 's1', parentUuid: 'a2', isSidechain: true, timestamp: t3, message: { id: 'msg_s', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'subagent noise' }] } };
const system = { type: 'system', subtype: 'stop_hook_summary', timestamp: t3 };

describe('parseJsonl', () => {
  it('parses one object per line and skips blank or broken lines', () => {
    expect(parseJsonl('{"a":1}\n\nnot json\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

describe('gateFromTranscript', () => {
  it('finds a pending AskUserQuestion and carries its questions, text and tool_use id', () => {
    const gate = gateFromTranscript([askText, askTool, sidechain], { activeStage: 'plan', blocked: false, needsAction: '' });
    expect(gate).toMatchObject({
      id: 'G1',
      name: 'Scope',
      since: Date.parse(t1),
      toolUseId: 'toolu_014d',
      text: 'Interview answered. Two questions before I write PRODUCT.md.',
      summary: 'What should this session deliver?',
    });
    expect(gate?.questions?.[0].options.map((o) => o.label)).toEqual(['HTML prototype', 'SwiftUI']);
  });

  it('ignores an AskUserQuestion that already has a result', () => {
    expect(gateFromTranscript([askText, askTool, askResult, reportText], { activeStage: 'plan', blocked: false, needsAction: '' })).toBeNull();
  });

  it('treats a final end_turn text as the gate when the session reports blocked, naming the gate from the stage and the text', () => {
    const gate = gateFromTranscript([askText, askTool, askResult, planText, system], { activeStage: 'plan', blocked: true, needsAction: 'Implement?' });
    expect(gate).toMatchObject({ id: 'G2', name: 'Plan', since: Date.parse(t3), summary: 'Implement?' });
    expect(gate?.text).toContain('What ships');
  });

  it('returns no gate for a final report when the session is not blocked', () => {
    expect(gateFromTranscript([askText, askTool, askResult, reportText], { activeStage: 'review', blocked: false, needsAction: '' })).toBeNull();
  });

  it('names the gate G3, G4 or G5 from the stage and the text', () => {
    const at = (text: string, stage: 'implement' | 'review' | 'feedback' | 'pr') =>
      gateFromTranscript([{ ...planText, message: { ...planText.message, content: [{ type: 'text', text }] } }], { activeStage: stage, blocked: true, needsAction: text })?.id;
    expect(at('Screenshot on dev data. Two compromises: …', 'implement')).toBe('G3');
    expect(at('Findings: 1 fix, 2 skip, 3 ask. Which?', 'review')).toBe('G4');
    expect(at('Pushing to release/2026-10 will deploy staging. Proceed?', 'review')).toBe('G5');
    expect(at('Replying to Shawn in your name: "Kept the timeout." Post it?', 'feedback')).toBe('G5');
  });

  it('uses the summary needs_action as the gate summary when the text has no question line', () => {
    const gate = gateFromTranscript([{ ...planText, message: { ...planText.message, content: [{ type: 'text', text: 'Plan written.' }] } }], { activeStage: 'plan', blocked: true, needsAction: 'Approve the plan' });
    expect(gate?.summary).toBe('Approve the plan');
  });
});

describe('activityFromTranscript', () => {
  it('lists only what Claude said on the main chain, newest first, one line each; tool calls and subagents are left out', () => {
    const items = activityFromTranscript([askText, askTool, askResult, bashTool, sidechain, reportText], 3);
    expect(items.map((i) => i.text)).toEqual([
      'Committed as 5c12d9a. Nothing was pushed.',
      'Interview answered. Two questions before I write PRODUCT.md.',
    ]);
    expect(items[1].at).toBe(Date.parse(t0));
  });
});
