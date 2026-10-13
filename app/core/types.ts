// The vocabulary comes from the pipeline plugin: a run moves through stages
// and stops only at the five human gates. Nothing here renames it.

export type RunKind = 'feature' | 'bug';
export type StageId = 'plan' | 'implement' | 'review' | 'pr' | 'feedback';
export type StageStatus = 'pending' | 'active' | 'done' | 'skipped';

export interface Stage {
  id: StageId;
  label: string;
  status: StageStatus;
  note: string;
}

export interface StoreEntry {
  kind: RunKind;
  title: string;
  stages: Stage[];
}

export type GateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'Q' | 'P';

export interface GateQuestion {
  question: string;
  header?: string;
  multiSelect?: boolean;
  options: { label: string; description?: string }[];
}

export interface Gate {
  id: GateId;
  name: string;
  /** Epoch ms when the run started waiting. */
  since: number;
  /** One line for list rows and notifications. */
  summary: string;
  /** The gate's full text as Claude wrote it (markdown). */
  text: string;
  /** Structured questions when the gate is an AskUserQuestion call. */
  questions?: GateQuestion[];
  /** The tool_use id to answer, for owned runs. */
  toolUseId?: string;
  /** Permission escalation from auto mode, for owned runs. */
  permission?: { toolName: string; input: unknown; requestId: string };
}

export interface Activity {
  at: number;
  text: string;
  live?: boolean;
}

export type RunStatus = 'needs' | 'working' | 'idle' | 'done';

export interface Run {
  id: string;
  source: 'observed' | 'owned';
  cliSessionId: string;
  hostSessionId?: string;
  key: string;
  title: string;
  kind: RunKind | null;
  cwd: string;
  worktree?: string;
  branch?: string;
  repo?: string;
  pr?: { number: number; url: string; state: string };
  started: number;
  lastActivity: number;
  status: RunStatus;
  statusLabel: string;
  stages: Stage[];
  gate: Gate | null;
  activity: Activity[];
  done?: { label: string; when: number; text?: string };
  /** Who holds an owned run's session: Clearance's own process, or the desktop app. */
  heldBy?: 'clearance' | 'desktop';
  /** While the desktop holds the run, whether it still has it open (Clearance cannot answer until it is archived). */
  desktopOpen?: boolean;
}
