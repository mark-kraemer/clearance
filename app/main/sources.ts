import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';

import { allStoreEntries } from '../core/stages';
import { observedRun, type RegistryEntry, type SessionFile } from '../core/run';
import { activityFromTranscript, gateFromTranscript, parseJsonl } from '../core/transcript';
import type { Run, StoreEntry } from '../core/types';
import { DESKTOP_SESSIONS_DIR, PLUGIN_STORE_DIR, SESSIONS_REGISTRY_DIR, projectDirFor } from './paths';

const TAIL_BYTES = 768 * 1024;
const DEBOUNCE_MS = 350;

interface Cached<T> {
  mtimeMs: number;
  size: number;
  value: T;
}

/**
 * Watches the four observed sources and merges them into runs. Emits
 * `runs` with the full list whenever something changed. Reads are cached by
 * mtime so a refresh costs only the files that moved.
 */
export class ObservedSources extends EventEmitter {
  private store = new Map<string, StoreEntry>();
  private sessions = new Map<string, Cached<SessionFile>>();
  private registry = new Map<string, RegistryEntry>();
  private transcripts = new Map<string, Cached<unknown[]>>();
  private watchers: FSWatcher[] = [];
  private transcriptWatcher: FSWatcher | null = null;
  private watchedProjectDirs = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private refreshing = false;
  private pendingRefresh = false;
  runs: Run[] = [];

  storeEntry(cliSessionId: string): StoreEntry | null {
    return this.store.get(cliSessionId) ?? null;
  }

  async start(): Promise<void> {
    const watch = (path: string, opts: Record<string, unknown> = {}) => {
      if (!existsSync(path)) return;
      const w = chokidar.watch(path, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }, ...opts });
      w.on('all', () => this.schedule());
      this.watchers.push(w);
    };
    watch(PLUGIN_STORE_DIR, { depth: 0 });
    watch(SESSIONS_REGISTRY_DIR, { depth: 0 });
    watch(DESKTOP_SESSIONS_DIR, { depth: 2 });
    this.transcriptWatcher = chokidar.watch([], { ignoreInitial: true, depth: 0, awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 } });
    this.transcriptWatcher.on('all', () => this.schedule());
    await this.refresh();
  }

  async stop(): Promise<void> {
    await Promise.all([...this.watchers, this.transcriptWatcher].filter(Boolean).map((w) => w!.close()));
  }

  schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(), DEBOUNCE_MS);
  }

  async refresh(): Promise<void> {
    if (this.refreshing) {
      this.pendingRefresh = true;
      return;
    }
    this.refreshing = true;
    try {
      await Promise.all([this.loadStore(), this.loadRegistry(), this.loadSessions()]);
      const runs: Run[] = [];
      for (const [id, entry] of this.store) {
        const session = this.sessions.get(id)?.value ?? null;
        if (session?.isArchived) continue;
        const registry = this.registry.get(id) ?? null;
        const cwd = session?.cwd || registry?.cwd;
        const lines = cwd ? await this.loadTranscript(id, cwd) : [];
        const active = entry.stages.find((s) => s.status === 'active')?.id ?? null;
        const summary = session?.postTurnSummary;
        const blocked = summary?.status_category === 'blocked' || !!summary?.needs_action;
        const gate = lines.length ? gateFromTranscript(lines, { activeStage: active, blocked, needsAction: summary?.needs_action || '' }) : null;
        const activity = lines.length ? activityFromTranscript(lines, 12) : [];
        runs.push(observedRun({ entry, session, registry, gate, activity }));
      }
      this.runs = runs;
      this.emit('runs', runs);
    } catch (err) {
      this.emit('error', err);
    } finally {
      this.refreshing = false;
      if (this.pendingRefresh) {
        this.pendingRefresh = false;
        this.schedule();
      }
    }
  }

  private async loadStore(): Promise<void> {
    const merged = new Map<string, StoreEntry>();
    if (!existsSync(PLUGIN_STORE_DIR)) return;
    for (const name of await readdir(PLUGIN_STORE_DIR)) {
      if (!name.startsWith('pipeline') || !name.endsWith('.json')) continue;
      try {
        const json = JSON.parse(await readFile(join(PLUGIN_STORE_DIR, name), 'utf8'));
        for (const [id, entry] of allStoreEntries(json)) merged.set(id, entry);
      } catch {
        // A half-written store file; the next change re-reads it.
      }
    }
    this.store = merged;
  }

  private async loadRegistry(): Promise<void> {
    const next = new Map<string, RegistryEntry & { cwd?: string }>();
    if (!existsSync(SESSIONS_REGISTRY_DIR)) return;
    for (const name of await readdir(SESSIONS_REGISTRY_DIR)) {
      if (!name.endsWith('.json')) continue;
      try {
        const e = JSON.parse(await readFile(join(SESSIONS_REGISTRY_DIR, name), 'utf8')) as RegistryEntry & { cwd?: string };
        if (!e.sessionId || !e.pid || !isAlive(e.pid)) continue;
        next.set(e.sessionId, e);
      } catch {
        // Stale or torn registry file.
      }
    }
    this.registry = next;
  }

  private async loadSessions(): Promise<void> {
    if (!existsSync(DESKTOP_SESSIONS_DIR)) return;
    const seen = new Set<string>();
    const files: string[] = [];
    for (const account of await readdir(DESKTOP_SESSIONS_DIR)) {
      const accountDir = join(DESKTOP_SESSIONS_DIR, account);
      let orgs: string[];
      try {
        orgs = await readdir(accountDir);
      } catch {
        continue;
      }
      for (const org of orgs) {
        const orgDir = join(accountDir, org);
        try {
          for (const f of await readdir(orgDir)) if (f.startsWith('local_') && f.endsWith('.json')) files.push(join(orgDir, f));
        } catch {
          // Not a directory.
        }
      }
    }
    const byPath = new Map<string, Cached<SessionFile>>();
    for (const [, c] of this.sessions) byPath.set((c.value as SessionFile & { __path?: string }).__path || '', c);
    for (const path of files) {
      try {
        const st = await stat(path);
        const prev = byPath.get(path);
        let cached = prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size ? prev : null;
        if (!cached) {
          const raw = JSON.parse(await readFile(path, 'utf8')) as SessionFile;
          const value: SessionFile & { __path?: string } = {
            sessionId: raw.sessionId, cliSessionId: raw.cliSessionId, cwd: raw.cwd, originCwd: raw.originCwd, worktreePath: raw.worktreePath,
            worktreeName: raw.worktreeName, branch: raw.branch, createdAt: raw.createdAt, lastActivityAt: raw.lastActivityAt, title: raw.title,
            isArchived: raw.isArchived, prs: raw.prs, postTurnSummary: raw.postTurnSummary, __path: path,
          };
          cached = { mtimeMs: st.mtimeMs, size: st.size, value };
        }
        if (cached.value.cliSessionId) {
          this.sessions.set(cached.value.cliSessionId, cached);
          seen.add(cached.value.cliSessionId);
        }
      } catch {
        // Torn write; keep the previous parse.
      }
    }
    for (const id of [...this.sessions.keys()]) if (!seen.has(id)) this.sessions.delete(id);
  }

  private async loadTranscript(id: string, cwd: string): Promise<unknown[]> {
    const dir = projectDirFor(cwd);
    const path = join(dir, `${id}.jsonl`);
    if (!existsSync(path)) return [];
    if (!this.watchedProjectDirs.has(dir) && this.transcriptWatcher) {
      this.watchedProjectDirs.add(dir);
      this.transcriptWatcher.add(dir);
    }
    try {
      const st = await stat(path);
      const prev = this.transcripts.get(id);
      if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) return prev.value;
      const lines = parseJsonl(await readTail(path, st.size));
      this.transcripts.set(id, { mtimeMs: st.mtimeMs, size: st.size, value: lines });
      return lines;
    } catch {
      return this.transcripts.get(id)?.value ?? [];
    }
  }
}

/** Reads the last part of a file, dropping the partial first line. */
async function readTail(path: string, size: number): Promise<string> {
  const fh = await open(path, 'r');
  try {
    const start = Math.max(0, size - TAIL_BYTES);
    const len = size - start;
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, start);
    const text = buf.toString('utf8');
    return start === 0 ? text : text.slice(text.indexOf('\n') + 1);
  } finally {
    await fh.close();
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
