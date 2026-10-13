import type { Activity, Gate, GateId, GateQuestion, StageId } from './types';

/** Parses JSONL text into objects, skipping blank and broken lines. */
export function parseJsonl(text: string): unknown[] {
  const out: unknown[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // A torn last line while the file is being written; ignore it.
    }
  }
  return out;
}

interface Block {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
}
interface Line {
  type?: string;
  isSidechain?: boolean;
  timestamp?: string;
  message?: { id?: string; stop_reason?: string; content?: Block[] | string };
}

const asLine = (x: unknown): Line | null => (x && typeof x === 'object' ? (x as Line) : null);
const blocksOf = (l: Line): Block[] => (Array.isArray(l.message?.content) ? (l.message!.content as Block[]) : []);
const at = (l: Line): number => (l.timestamp ? Date.parse(l.timestamp) : 0);

export interface GateContext {
  activeStage: StageId | null;
  /** The desktop app's post-turn summary says the session is blocked on the user. */
  blocked: boolean;
  needsAction: string;
}

export const GATE_NAME: Record<GateId, string> = { G1: 'Scope', G2: 'Plan', G3: 'Visual', G4: 'Review triage', G5: 'Side effects', Q: 'Question', P: 'Permission' };

/** Names the gate from the stage the run is on and what the text asks about. */
export function inferGateId(text: string, stage: StageId | null): GateId {
  const t = text.toLowerCase();
  if (/\b(push|force-push|merge|restack|in your name|post it|linear write|deploy)\b/.test(t)) return 'G5';
  if (stage === 'plan') return /\bimplement\?/.test(t) || /\bwhat ships\b/.test(t) ? 'G2' : 'G1';
  if (stage === 'implement') return 'G3';
  if (stage === 'review') return 'G4';
  if (stage === 'feedback' || stage === 'pr') return 'G5';
  return 'Q';
}

/** AskUserQuestion input as the gate carries it. */
export function normalizeQuestions(raw: unknown): GateQuestion[] {
  return (Array.isArray(raw) ? (raw as GateQuestion[]) : []).map((q) => ({ question: q.question, header: q.header, multiSelect: !!q.multiSelect, options: (q.options || []).map((o) => ({ label: o.label, description: o.description })) }));
}

/** The last line of the text that ends in a question mark, for a one-line summary. */
export function questionLine(text: string): string {
  const lines = text.split('\n').map((l) => l.replace(/[*_`#>]/g, '').trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].endsWith('?')) return lines[i].slice(0, 160);
  return '';
}

/**
 * Reads the transcript tail for an open gate: either a pending
 * AskUserQuestion call, or (when the desktop app reports the session blocked)
 * the final text of the last turn.
 */
export function gateFromTranscript(lines: unknown[], ctx: GateContext): Gate | null {
  const main = lines.map(asLine).filter((l): l is Line => !!l && !l.isSidechain);
  const answered = new Set<string>();
  for (const l of main) if (l.type === 'user') for (const b of blocksOf(l)) if (b.type === 'tool_result' && b.tool_use_id) answered.add(b.tool_use_id);

  let last: Line | null = null;
  for (let i = main.length - 1; i >= 0; i--) if (main[i].type === 'assistant') { last = main[i]; break; }
  if (!last) return null;
  const msgId = last.message?.id;
  const group = main.filter((l) => l.type === 'assistant' && l.message?.id === msgId);
  const textOf = group.flatMap(blocksOf).filter((b) => b.type === 'text' && b.text).map((b) => b.text!.trim()).join('\n\n');

  const pending = group.flatMap((l) => blocksOf(l).filter((b) => b.type === 'tool_use' && b.name === 'AskUserQuestion' && b.id && !answered.has(b.id)).map((b) => ({ b, l })));
  if (pending.length) {
    const { b, l } = pending[pending.length - 1];
    const questions = normalizeQuestions(b.input?.questions);
    const id = inferGateId(textOf + ' ' + questions.map((q) => q.question).join(' '), ctx.activeStage);
    return { id, name: GATE_NAME[id], since: at(l), summary: questions[0]?.question || ctx.needsAction || 'Question', text: textOf, questions, toolUseId: b.id };
  }

  if (!ctx.blocked || last.message?.stop_reason !== 'end_turn' || !textOf) return null;
  const id = inferGateId(textOf + ' ' + ctx.needsAction, ctx.activeStage);
  return { id, name: GATE_NAME[id], since: at(last), summary: questionLine(textOf) || ctx.needsAction || 'Waiting on you', text: textOf };
}

/** The latest things Claude said on the main chain, newest first. Tool calls are not activity the user reads. */
export function activityFromTranscript(lines: unknown[], limit = 8): Activity[] {
  const out: Activity[] = [];
  const main = lines.map(asLine).filter((l): l is Line => !!l && !l.isSidechain && l.type === 'assistant');
  for (let i = main.length - 1; i >= 0 && out.length < limit; i--) {
    const l = main[i];
    for (const b of blocksOf(l).reverse()) {
      if (out.length >= limit) break;
      if (b.type === 'text' && b.text?.trim()) out.push({ at: at(l), text: firstLine(b.text) });
    }
  }
  return out;
}

/** The first non-empty line, markdown marks stripped, clipped to 140 chars. */
export function firstLine(s: string): string {
  const line = s.split('\n').map((x) => x.replace(/[*_`#>]/g, '').trim()).find(Boolean) || '';
  return line.length > 140 ? line.slice(0, 139) + '…' : line;
}
