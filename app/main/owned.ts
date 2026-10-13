import { EventEmitter } from 'node:events';

import type { Run, RunKind } from '../core/types';

export interface StartRunInput {
  kind: RunKind;
  task: string;
  repoPath: string;
  openInClaude?: boolean;
}

/**
 * Runs that Clearance starts and owns. This stage ships the observed board
 * only; starting, answering and permissions land in the next commit.
 */
export class OwnedRuns extends EventEmitter {
  runs: Run[] = [];

  async start(): Promise<void> {
    // Nothing to restore yet.
  }

  shutdown(): void {
    // No child processes yet.
  }

  async begin(_input: StartRunInput): Promise<{ ok: false; error: string }> {
    return { ok: false, error: 'Starting runs from Clearance is not built yet. Start the pipeline in Claude Code and it appears here.' };
  }

  async answer(_id: string, _text: string, _answers?: Record<string, string>): Promise<{ ok: false; error: string }> {
    return { ok: false, error: 'This run belongs to the Claude desktop app. Open it there to answer.' };
  }

  async decidePermission(_id: string, _requestId: string, _allow: boolean): Promise<{ ok: false; error: string }> {
    return { ok: false, error: 'No owned runs yet.' };
  }

  async clear(_id: string): Promise<{ ok: boolean }> {
    return { ok: false };
  }
}
