import { GATE_NAME, firstLine, inferGateId, normalizeQuestions, questionLine } from './transcript';
import type { Activity, Gate, StageId } from './types';

/** What the app knows about an owned run from its stream-json so far. */
export interface StreamState {
  /** True between our message going in and the `result` event coming back. */
  turnOpen: boolean;
  gate: Gate | null;
  /** Text blocks of the current assistant message, for the gate's body. */
  currentText: string;
  currentMessageId: string | null;
  activity: Activity[];
  lastError: string | null;
}

export const initialStream = (): StreamState => ({ turnOpen: false, gate: null, currentText: '', currentMessageId: null, activity: [], lastError: null });

interface Block {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
}
interface Event {
  type?: string;
  subtype?: string;
  session_id?: string;
  result?: string;
  is_error?: boolean;
  text?: string;
  message?: { id?: string; content?: Block[] | string };
}

const ACTIVITY_LIMIT = 40;

function push(state: StreamState, item: Activity): Activity[] {
  return [item, ...state.activity].slice(0, ACTIVITY_LIMIT);
}

/**
 * Folds one stream-json event (or one of the app's own `clearance:*` events)
 * into the owned run's state. Pure, so the gate logic is testable without a
 * process.
 */
export function reduceStream(state: StreamState, raw: unknown, ctx: { now: number; activeStage: StageId | null }): StreamState {
  const e = (raw && typeof raw === 'object' ? raw : {}) as Event;
  if (e.type === 'system' && e.subtype === 'init') {
    return { ...state, turnOpen: true };
  }
  if (e.type === 'clearance:sent') {
    return { ...state, turnOpen: true, gate: null, currentText: '', currentMessageId: null, activity: push(state, { at: ctx.now, text: `You · ${firstLine(e.text || '')}` }) };
  }
  if (e.type === 'assistant') {
    const blocks = Array.isArray(e.message?.content) ? (e.message!.content as Block[]) : [];
    let next: StreamState = { ...state, turnOpen: true };
    if (e.message?.id && e.message.id !== state.currentMessageId) next = { ...next, currentMessageId: e.message.id, currentText: '' };
    for (const b of blocks) {
      if (b.type === 'text' && b.text?.trim()) {
        next = { ...next, currentText: [next.currentText, b.text.trim()].filter(Boolean).join('\n\n'), activity: push(next, { at: ctx.now, text: firstLine(b.text) }) };
      } else if (b.type === 'tool_use' && b.name) {
        if (b.name === 'AskUserQuestion' && b.id) {
          const questions = normalizeQuestions(b.input?.questions);
          const id = inferGateId(next.currentText + ' ' + questions.map((q) => q.question).join(' '), ctx.activeStage);
          next = { ...next, gate: { id, name: GATE_NAME[id], since: ctx.now, summary: questions[0]?.question || 'Question', text: next.currentText, questions, toolUseId: b.id } };
        }
      }
    }
    return next;
  }
  if (e.type === 'user') {
    const blocks = Array.isArray(e.message?.content) ? (e.message!.content as Block[]) : [];
    const answered = blocks.some((b) => b.type === 'tool_result' && b.tool_use_id && state.gate?.toolUseId === b.tool_use_id);
    return answered ? { ...state, gate: null } : state;
  }
  if (e.type === 'result') {
    const text = typeof e.result === 'string' ? e.result : state.currentText;
    if (e.is_error) return { ...state, turnOpen: false, lastError: text || 'The run ended with an error.' };
    const q = questionLine(text);
    if (q) {
      const id = inferGateId(text, ctx.activeStage);
      return { ...state, turnOpen: false, gate: { id, name: GATE_NAME[id], since: ctx.now, summary: q, text } };
    }
    return { ...state, turnOpen: false, gate: null };
  }
  return state;
}
