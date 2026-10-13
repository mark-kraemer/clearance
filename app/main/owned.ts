import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';

import { desktopHeldState, findImported, type DesktopView } from '../core/handoff';
import { splitTitle, type SessionFile } from '../core/run';
import { slug } from '../core/slug';
import { stageLabel, stageOrder } from '../core/stages';
import { GATE_NAME, inferGateId, normalizeQuestions } from '../core/transcript';
import { initialStream, reduceStream, type StreamState } from '../core/stream';
import type { Gate, GateQuestion, Run, RunKind, Stage, StageId, StoreEntry } from '../core/types';
import { APP_SUPPORT_DIR } from './paths';

const execFileP = promisify(execFile);

export interface StartRunInput {
  kind: RunKind;
  task: string;
  repoPath: string;
  /** The branch the worktree starts from; the sheet shows the one it will use. */
  baseBranch?: string;
}

interface Persisted {
  id: string;
  cliSessionId: string;
  kind: RunKind;
  key: string;
  title: string;
  task: string;
  repoPath: string;
  cwd: string;
  branch: string;
  started: number;
  stageHint: StageId | null;
  /** Absent means Clearance; runs saved before handoff existed are Clearance's. */
  heldBy?: 'clearance' | 'desktop';
  /** When the run was last handed to the desktop, until its import is found. */
  handedAt?: number;
  hostSessionId?: string;
  /** Session ids the desktop re-keyed away from, so earlier store entries still resolve. */
  priorSessionIds?: string[];
}

interface Pending {
  toolName: string;
  input: Record<string, unknown>;
  toolUseId: string | null;
  resolve: (decision: string) => void;
}

interface Live {
  p: Persisted;
  child: ChildProcessWithoutNullStreams | null;
  stream: StreamState;
  pending: Pending | null;
  permissionGate: Gate | null;
  exited: boolean;
  exitCode: number | null;
  lastActivity: number;
}

const SKILL_STAGE: Record<string, StageId> = { grilling: 'plan', 'domain-modeling': 'plan', tdd: 'implement', 'ready-for-review': 'review', 'create-pr': 'pr', 'file-pr': 'pr', 'pr-comments': 'feedback' };

/**
 * Runs that Clearance starts and owns. Each is a `claude -p` child in its own
 * worktree, driven over stream-json. Auto mode decides routine permissions;
 * what it escalates, and every AskUserQuestion, arrives through the
 * permission server and shows as a gate here.
 */
export class OwnedRuns extends EventEmitter {
  private live = new Map<string, Live>();
  private server: Server | null = null;
  private port = 0;
  private storeLookup: (cliSessionId: string) => StoreEntry | null = () => null;
  private desktopView: (cliSessionId: string) => DesktopView | null = () => null;
  private claudeBin = 'claude';
  runs: Run[] = [];

  constructor(private readonly serverScript: string) {
    super();
  }

  /** The pipeline plugin's store, so owned runs show the stages the plugin recorded. */
  useStore(lookup: (cliSessionId: string) => StoreEntry | null): void {
    this.storeLookup = lookup;
  }

  /** The desktop's side of a handed-over session, read by the observed sources. */
  useDesktop(lookup: (cliSessionId: string) => DesktopView | null): void {
    this.desktopView = lookup;
  }

  async start(): Promise<void> {
    mkdirSync(APP_SUPPORT_DIR, { recursive: true });
    this.claudeBin = await resolveClaude();
    for (const p of this.load()) this.live.set(p.id, { p, child: null, stream: initialStream(), pending: null, permissionGate: null, exited: true, exitCode: null, lastActivity: p.started });
    await this.listen();
    this.publish();
  }

  shutdown(): void {
    for (const l of this.live.values()) l.child?.kill();
    this.server?.close();
  }

  async begin(input: StartRunInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    const task = input.task.trim();
    if (!task) return { ok: false, error: 'Name the task.' };
    if (!existsSync(join(input.repoPath, '.git'))) return { ok: false, error: `${input.repoPath} is not a git repository.` };
    const { key, title } = splitTitle(task);
    const name = `${slug(task) || 'run'}-${randomBytes(3).toString('hex')}`;
    const cwd = join(input.repoPath, '.claude', 'worktrees', name);
    const branch = `claude/${name}`;
    try {
      const base = input.baseBranch?.trim() || (await defaultBranch(input.repoPath));
      mkdirSync(join(input.repoPath, '.claude', 'worktrees'), { recursive: true });
      await execFileP('git', ['-C', input.repoPath, 'worktree', 'add', '-b', branch, cwd, base]);
    } catch (err) {
      return { ok: false, error: `Could not create the worktree: ${(err as Error).message.split('\n').pop()}` };
    }
    const p: Persisted = { id: randomUUID(), cliSessionId: randomUUID(), kind: input.kind, key: key || '', title: title || task, task, repoPath: input.repoPath, cwd, branch, started: Date.now(), stageHint: input.kind === 'feature' ? 'plan' : 'implement' };
    const l: Live = { p, child: null, stream: initialStream(), pending: null, permissionGate: null, exited: false, exitCode: null, lastActivity: Date.now() };
    this.live.set(p.id, l);
    this.save();
    this.spawn(l, false);
    this.send(l, `/pipeline ${p.kind} ${task}`);
    this.publish();
    return { ok: true, id: p.id };
  }

  async answer(id: string, text: string, answers: Record<string, string> = {}): Promise<{ ok: boolean; error?: string }> {
    const l = this.live.get(id);
    if (!l) return { ok: false, error: 'This run is not owned by Clearance.' };
    if (l.p.heldBy === 'desktop') return this.takeBack(l, text, answers);
    if (l.pending?.toolName === 'AskUserQuestion') {
      const questions = (l.pending.input.questions as GateQuestion[] | undefined) || [];
      const filled: Record<string, string> = {};
      for (const q of questions) filled[q.question] = answers[q.question] || text || '';
      if (questions.some((q) => !filled[q.question])) return { ok: false, error: 'Answer every question, or write one line that answers them all.' };
      const note = text && Object.keys(answers).length ? `${Object.values(answers).join(', ')} · ${text}` : text || Object.values(answers).join(', ');
      this.resolvePending(l, JSON.stringify({ behavior: 'allow', updatedInput: { questions: l.pending.input.questions, answers: filled } }), note);
      return { ok: true };
    }
    if (l.pending) return { ok: false, error: 'A permission request is open. Allow or deny it first.' };
    if (!text.trim()) return { ok: false, error: 'Write a line to send.' };
    if (l.exited) this.spawn(l, true);
    this.send(l, text.trim());
    return { ok: true };
  }

  /**
   * Hands the run to the desktop app: Clearance's process stops, and the
   * returned `claude://resume` link makes the desktop import the session (or
   * reopen it, if it already knows it). Refused mid-turn, because stopping
   * the process then would cut the turn off or deny an open request.
   */
  async handToDesktop(id: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
    const l = this.live.get(id);
    if (!l) return { ok: false, error: 'This run is not owned by Clearance.' };
    if (l.pending) return { ok: false, error: 'Answer the open request first, then continue in Claude Code.' };
    if (l.child && l.stream.turnOpen) return { ok: false, error: 'The run is mid-turn. Continue in Claude Code once it stops at a gate.' };
    if (l.child) {
      const child = l.child;
      // The desktop must not open the session while this process can still write to it.
      await new Promise<void>((resolve) => {
        const force = setTimeout(() => child.kill('SIGKILL'), 5000);
        child.once('exit', () => {
          clearTimeout(force);
          resolve();
        });
        child.kill();
      });
    }
    l.p.heldBy = 'desktop';
    l.p.handedAt = Date.now();
    this.save();
    this.publish();
    return { ok: true, url: `claude://resume?session=${l.p.cliSessionId}` };
  }

  /** Desktop-held runs, for the observed sources to read. */
  desktopHeld(): { cliSessionId: string; cwd: string }[] {
    return [...this.live.values()].filter((l) => l.p.heldBy === 'desktop').map((l) => ({ cliSessionId: l.p.cliSessionId, cwd: l.p.cwd }));
  }

  /**
   * Follows the desktop's re-key of a first import, then recomputes the runs
   * from the desktop's latest side. Called on every observed refresh.
   */
  sync(sessions: SessionFile[]): void {
    let changed = false;
    for (const l of this.live.values()) {
      if (l.p.heldBy !== 'desktop' || !l.p.handedAt) continue;
      const imported = findImported(sessions, { cwd: l.p.cwd, since: l.p.handedAt });
      if (!imported?.cliSessionId) continue;
      if (imported.cliSessionId !== l.p.cliSessionId) l.p.priorSessionIds = [...(l.p.priorSessionIds || []), l.p.cliSessionId];
      l.p.cliSessionId = imported.cliSessionId;
      l.p.hostSessionId = imported.sessionId;
      l.p.handedAt = undefined;
      changed = true;
    }
    if (changed) this.save();
    this.publish();
  }

  /**
   * Answering a desktop-held run takes it back, but only once the desktop's
   * process is gone: a second process on the session would fork it.
   */
  private takeBack(l: Live, text: string, answers: Record<string, string>): { ok: boolean; error?: string } {
    if ((this.desktopView(l.p.cliSessionId)?.open ?? true)) return { ok: false, error: 'This run is open in Claude Code. Archive it there to answer here.' };
    const chosen = Object.entries(answers).map(([q, a]) => `${q} ${a}`);
    const message = [...chosen, text.trim()].filter(Boolean).join('\n');
    if (!message) return { ok: false, error: 'Write a line to send.' };
    l.p.heldBy = 'clearance';
    l.p.handedAt = undefined;
    this.save();
    this.spawn(l, true);
    this.send(l, message);
    return { ok: true };
  }

  async decidePermission(id: string, requestId: string, allow: boolean): Promise<{ ok: boolean; error?: string }> {
    const l = this.live.get(id);
    if (!l?.pending || l.permissionGate?.permission?.requestId !== requestId) return { ok: false, error: 'That request is no longer open.' };
    this.resolvePending(l, allow ? JSON.stringify({ behavior: 'allow', updatedInput: l.pending.input }) : JSON.stringify({ behavior: 'deny', message: 'Denied in Clearance. Find another way or ask.' }), allow ? `Allowed ${l.pending.toolName}` : `Denied ${l.pending.toolName}`);
    return { ok: true };
  }

  async clear(id: string): Promise<{ ok: boolean }> {
    const l = this.live.get(id);
    if (!l) return { ok: false };
    l.child?.kill();
    l.pending?.resolve(JSON.stringify({ behavior: 'deny', message: 'The run was cleared.' }));
    this.live.delete(id);
    this.save();
    this.publish();
    return { ok: true };
  }

  /* Process */

  private spawn(l: Live, resume: boolean): void {
    const mcp = { mcpServers: { clearance: { command: process.execPath, args: [this.serverScript], env: { ELECTRON_RUN_AS_NODE: '1', CLEARANCE_PERMISSION_URL: `http://127.0.0.1:${this.port}/permission`, CLEARANCE_RUN: l.p.id } } } };
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'auto', '--permission-prompt-tool', 'mcp__clearance__permission', '--mcp-config', JSON.stringify(mcp), '--name', `${l.p.key} ${l.p.title}`.trim()];
    args.push(resume ? '--resume' : '--session-id', l.p.cliSessionId);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(this.claudeBin, args, { cwd: l.p.cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    l.child = child;
    l.exited = false;
    l.exitCode = null;
    l.stream = { ...initialStream(), turnOpen: true };
    createInterface({ input: child.stdout }).on('line', (line) => this.onLine(l, line));
    createInterface({ input: child.stderr }).on('line', (line) => this.emit('log', `[${l.p.key || l.p.title}] ${line}`));
    child.on('error', (err) => {
      l.stream = { ...l.stream, lastError: `Could not start claude (${this.claudeBin}): ${err.message}`, turnOpen: false };
      this.publish();
    });
    child.on('exit', (code) => {
      l.exited = true;
      l.exitCode = code;
      l.child = null;
      if (l.pending) l.pending.resolve(JSON.stringify({ behavior: 'deny', message: 'The run exited.' }));
      l.pending = null;
      l.permissionGate = null;
      l.stream = { ...l.stream, turnOpen: false };
      this.publish();
    });
  }

  private send(l: Live, text: string): void {
    if (!l.child) return;
    l.child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }) + '\n');
    l.stream = reduceStream(l.stream, { type: 'clearance:sent', text }, { now: Date.now(), activeStage: l.p.stageHint });
    l.lastActivity = Date.now();
    this.publish();
  }

  private onLine(l: Live, line: string): void {
    let ev: unknown;
    try {
      ev = JSON.parse(line);
    } catch {
      return;
    }
    const e = ev as { type?: string; message?: { content?: { type: string; name?: string; input?: { skill?: string } }[] } };
    if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
      for (const b of e.message!.content) {
        const skill = b.type === 'tool_use' && b.name === 'Skill' ? b.input?.skill?.replace(/^[^:]+:/, '') : undefined;
        if (skill && SKILL_STAGE[skill] && l.p.stageHint !== SKILL_STAGE[skill]) {
          l.p.stageHint = SKILL_STAGE[skill];
          this.save();
        }
      }
    }
    l.stream = reduceStream(l.stream, ev, { now: Date.now(), activeStage: l.p.stageHint });
    l.lastActivity = Date.now();
    this.publish();
  }

  /* Permission server */

  private listen(): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req, res) => {
        if (req.method !== 'POST' || req.url !== '/permission') {
          res.writeHead(404).end();
          return;
        }
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          let payload: { run?: string; tool_name?: string; input?: Record<string, unknown>; tool_use_id?: string | null };
          try {
            payload = JSON.parse(body);
          } catch {
            res.writeHead(400).end();
            return;
          }
          const l = payload.run ? this.live.get(payload.run) : undefined;
          if (!l) {
            res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ behavior: 'deny', message: 'Unknown run.' }));
            return;
          }
          const toolName = payload.tool_name || '';
          const input = payload.input || {};
          const pending: Pending = { toolName, input, toolUseId: payload.tool_use_id ?? null, resolve: (decision) => res.writeHead(200, { 'content-type': 'application/json' }).end(decision) };
          // Only an aborted request clears the gate; a finished response has already resolved it.
          res.on('close', () => {
            if (!res.writableFinished && l.pending === pending) {
              l.pending = null;
              l.permissionGate = null;
              this.publish();
            }
          });
          l.pending = pending;
          if (toolName === 'AskUserQuestion') {
            const questions = normalizeQuestions(input.questions);
            const id = inferGateId(l.stream.currentText + ' ' + questions.map((q) => q.question).join(' '), l.p.stageHint);
            l.permissionGate = { id, name: GATE_NAME[id], since: Date.now(), summary: questions[0]?.question || 'Question', text: l.stream.currentText, questions, toolUseId: pending.toolUseId || undefined };
          } else {
            l.permissionGate = { id: 'P', name: 'Permission', since: Date.now(), summary: `${toolName} · ${summarize(input)}`, text: '', permission: { toolName, input, requestId: randomUUID() } };
          }
          this.publish();
        });
      });
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address();
        this.port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  }

  private resolvePending(l: Live, decision: string, note: string): void {
    l.pending?.resolve(decision);
    l.pending = null;
    l.permissionGate = null;
    l.stream = reduceStream({ ...l.stream, gate: null, turnOpen: true }, { type: 'clearance:sent', text: note }, { now: Date.now(), activeStage: l.p.stageHint });
    l.lastActivity = Date.now();
    this.publish();
  }

  /* Runs */

  private toRun(l: Live): Run {
    const p = l.p;
    const entry = [p.cliSessionId, ...[...(p.priorSessionIds || [])].reverse()].map((id) => this.storeLookup(id)).find((e) => e?.stages.length);
    const stages: Stage[] = entry?.stages.length ? entry.stages : hintedStages(p.kind, p.stageHint);
    const allClosed = stages.every((s) => s.status === 'done' || s.status === 'skipped');
    const base = {
      id: p.id, source: 'owned' as const, cliSessionId: p.cliSessionId, key: p.key, title: p.title, kind: p.kind, cwd: p.cwd, worktree: p.cwd.split('/').pop(), branch: p.branch,
      repo: p.repoPath.split('/').slice(-2).join('/'), started: p.started, stages,
    };
    if (p.heldBy === 'desktop') {
      const view = this.desktopView(p.cliSessionId);
      const lastActivity = Math.max(l.lastActivity, view?.lastActivity || 0);
      return { ...base, ...desktopHeldState(view, allClosed, lastActivity), heldBy: 'desktop', hostSessionId: view?.hostSessionId || p.hostSessionId, lastActivity, activity: view?.activity.length ? view.activity : l.stream.activity };
    }
    const gate = l.permissionGate || l.stream.gate;
    let status: Run['status'];
    let statusLabel: string;
    let done: Run['done'];
    if (l.exited) {
      status = 'done';
      statusLabel = allClosed ? 'Done' : 'Stopped';
      done = { label: statusLabel, when: l.lastActivity, text: allClosed ? 'Every stage closed.' : l.stream.lastError || `The run exited${l.exitCode ? ` with code ${l.exitCode}` : ''}. Send a message to resume it.` };
    } else if (gate) {
      status = 'needs';
      statusLabel = `${gate.id} ${gate.name}`;
    } else if (l.stream.turnOpen) {
      status = 'working';
      statusLabel = l.stream.activity[0]?.text || 'working';
    } else {
      status = 'idle';
      statusLabel = l.stream.lastError || l.stream.activity[0]?.text || 'idle';
    }
    return { ...base, heldBy: 'clearance', lastActivity: l.lastActivity, status, statusLabel, gate: status === 'needs' ? gate : null, activity: l.stream.activity, done };
  }

  private publish(): void {
    this.runs = [...this.live.values()].map((l) => this.toRun(l));
    this.emit('runs', this.runs);
  }

  private get file(): string {
    return join(APP_SUPPORT_DIR, 'runs.json');
  }

  private load(): Persisted[] {
    try {
      return existsSync(this.file) ? (JSON.parse(readFileSync(this.file, 'utf8')) as Persisted[]) : [];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      writeFileSync(this.file, JSON.stringify([...this.live.values()].map((l) => l.p), null, 2));
    } catch (err) {
      this.emit('error', err);
    }
  }
}

function hintedStages(kind: RunKind, hint: StageId | null): Stage[] {
  const ids = stageOrder(kind);
  const at = hint ? ids.indexOf(hint) : 0;
  return ids.map((id, i) => ({ id, label: stageLabel(id, kind), status: i < at ? 'done' : i === at ? 'active' : 'pending', note: '' }));
}

/**
 * A Finder-launched app gets the GUI PATH, which rarely holds `claude`
 * (installed under ~/.local/bin or a version manager). A login shell knows
 * where it is; ask once.
 */
async function resolveClaude(): Promise<string> {
  try {
    const { stdout } = await execFileP('/bin/zsh', ['-lc', 'command -v claude'], { timeout: 8000 });
    const found = stdout.trim().split('\n').pop() || '';
    return found.startsWith('/') ? found : 'claude';
  } catch {
    return 'claude';
  }
}

function summarize(input: Record<string, unknown>): string {
  const s = String(input.command || input.file_path || input.description || input.url || Object.values(input)[0] || '');
  return s.length > 80 ? s.slice(0, 79) + '…' : s;
}

async function defaultBranch(repo: string): Promise<string> {
  try {
    const { stdout } = await execFileP('git', ['-C', repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    return stdout.trim().replace(/^origin\//, '');
  } catch {
    const { stdout } = await execFileP('git', ['-C', repo, 'rev-parse', '--abbrev-ref', 'HEAD']);
    return stdout.trim();
  }
}
