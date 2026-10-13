import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { WORKTREES_REGISTRY } from './paths';

export interface RepoChoice {
  /** Repository root on disk. */
  path: string;
  /** Short label, e.g. "rolemodel/almanac". */
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
 * Repositories the desktop app has made worktrees in, newest first. The
 * registry is the one place that knows both the root and the base branch.
 */
export async function listRepos(): Promise<RepoChoice[]> {
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
        const parts = root.split('/').filter(Boolean);
        byRoot.set(root, { path: root, label: parts.slice(-2).join('/') || basename(root), baseBranch: w.sourceBranch || 'main', at });
      }
    }
    return [...byRoot.values()].sort((a, b) => b.at - a.at).map(({ at: _at, ...r }) => r);
  } catch {
    return [];
  }
}
