import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

import { APP_SUPPORT_DIR, WORKTREES_REGISTRY } from './paths';

const execFileP = promisify(execFile);
const CHOSEN_FILE = join(APP_SUPPORT_DIR, 'repos.json');

export interface RepoChoice {
  /** Repository root on disk. */
  path: string;
  /** Short label, e.g. "acme/harbor". */
  label: string;
  /** Branch new worktrees start from. */
  baseBranch: string;
}

interface WorktreeRecord {
  baseRepo?: string;
  originTopLevel?: string;
  sourceBranch?: string;
  createdAt?: number;
}

/**
 * Folders chosen in the New Run sheet, newest first, then the repositories
 * the desktop app has made worktrees in.
 */
export async function listRepos(): Promise<RepoChoice[]> {
  const chosen = await readChosen();
  const known = new Set(chosen.map((r) => r.path));
  return [...chosen, ...(await desktopRepos()).filter((r) => !known.has(r.path))];
}

/**
 * Resolves a folder picked in the sheet to its repository root and
 * remembers it, so the next New Run lists it first.
 */
export async function chooseRepo(folder: string): Promise<{ ok: true; repo: RepoChoice } | { ok: false; error: string }> {
  let root: string;
  try {
    root = (await execFileP('git', ['-C', folder, 'rev-parse', '--show-toplevel'])).stdout.trim();
  } catch {
    return { ok: false, error: `${basename(folder)} is not in a git repository.` };
  }
  const repo: RepoChoice = { path: root, label: labelFor(root), baseBranch: await defaultBranch(root) };
  const chosen = (await readChosen()).filter((r) => r.path !== root);
  try {
    await mkdir(APP_SUPPORT_DIR, { recursive: true });
    await writeFile(CHOSEN_FILE, JSON.stringify([repo, ...chosen], null, 2));
  } catch {
    // Not remembered; the run still starts.
  }
  return { ok: true, repo };
}

/** The branch a new worktree starts from: the remote's HEAD, else the current branch. */
export async function defaultBranch(repo: string): Promise<string> {
  try {
    const { stdout } = await execFileP('git', ['-C', repo, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
    return stdout.trim().replace(/^origin\//, '');
  } catch {
    const { stdout } = await execFileP('git', ['-C', repo, 'rev-parse', '--abbrev-ref', 'HEAD']);
    return stdout.trim();
  }
}

async function readChosen(): Promise<RepoChoice[]> {
  try {
    const list = JSON.parse(await readFile(CHOSEN_FILE, 'utf8')) as RepoChoice[];
    return list.filter((r) => existsSync(join(r.path, '.git')));
  } catch {
    return [];
  }
}

function labelFor(root: string): string {
  return root.split('/').filter(Boolean).slice(-2).join('/') || basename(root);
}

/**
 * Repositories the desktop app has made worktrees in, newest first. The
 * registry is the one place that knows both the root and the base branch.
 */
async function desktopRepos(): Promise<RepoChoice[]> {
  if (!existsSync(WORKTREES_REGISTRY)) return [];
  try {
    const json = JSON.parse(await readFile(WORKTREES_REGISTRY, 'utf8')) as { worktrees?: Record<string, WorktreeRecord> | WorktreeRecord[] };
    const records = Array.isArray(json.worktrees) ? json.worktrees : Object.values(json.worktrees || {});
    const byRoot = new Map<string, RepoChoice & { at: number }>();
    for (const w of records) {
      const root = w.originTopLevel || w.baseRepo;
      if (!root) continue;
      const prev = byRoot.get(root);
      const at = w.createdAt || 0;
      if (!prev || at > prev.at) {
        byRoot.set(root, { path: root, label: labelFor(root), baseBranch: w.sourceBranch || 'main', at });
      }
    }
    return [...byRoot.values()].sort((a, b) => b.at - a.at).map(({ at: _at, ...r }) => r);
  } catch {
    return [];
  }
}
