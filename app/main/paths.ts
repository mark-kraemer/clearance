import { homedir } from 'node:os';
import { join } from 'node:path';

// Where Claude Code and the Claude desktop app keep the files the board reads.
// All paths are the user's own; nothing here touches credentials.
export const HOME = homedir();
export const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(HOME, '.claude');
export const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');
export const SESSIONS_REGISTRY_DIR = join(CLAUDE_DIR, 'sessions');
export const PLUGIN_STORE_DIR = join(CLAUDE_DIR, 'plugins', 'store');
export const DESKTOP_SUPPORT_DIR = join(HOME, 'Library', 'Application Support', 'Claude');
export const DESKTOP_SESSIONS_DIR = join(DESKTOP_SUPPORT_DIR, 'claude-code-sessions');
export const WORKTREES_REGISTRY = join(DESKTOP_SUPPORT_DIR, 'git-worktrees.json');
export const APP_SUPPORT_DIR = join(HOME, 'Library', 'Application Support', 'Clearance');

/** The transcript directory for a cwd: the path with `/` and `.` turned into `-`. */
export function projectDirFor(cwd: string): string {
  return join(PROJECTS_DIR, cwd.replace(/[/.]/g, '-'));
}
