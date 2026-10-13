# Clearance

A Mac control room for concurrent Claude Code pipeline runs. Every run holds at a gate until you clear it; Clearance shows which runs are waiting, which gate each is on, and lets you answer in place.

It reads the runs you already have open in the Claude desktop app and can start new ones itself.

## How it works

Runs follow the stages of the `pipeline` plugin (RoleModel/claude-plugins): plan, implement, review, file PR, feedback, stopping only at the five human gates G1 to G5.

**Observed runs** come from four files Claude Code and the desktop app already write:

| Source | What it supplies |
| --- | --- |
| `~/.claude/plugins/store/pipeline_*.json` | stages and notes per session |
| `~/Library/Application Support/Claude/claude-code-sessions/…/local_*.json` | title, worktree, branch, PRs, and whether the session is blocked |
| `~/.claude/sessions/<pid>.json` | busy or idle, for live processes only |
| `~/.claude/projects/<cwd>/<session>.jsonl` | the gate's own text and any pending `AskUserQuestion` |

They can be read but not answered here, because the pending question belongs to the desktop app's interactive process. The composer becomes "Open in Claude Code" (⌘O), which switches the desktop app to that session through its `claude://code/continue?session=<id>` link. ⌃⌥C brings Clearance back from anywhere.

**Owned runs** start from the New Run sheet (⌘N). Clearance creates a worktree under the repository's `.claude/worktrees`, then spawns your signed-in `claude` in auto mode:

```
claude -p --input-format stream-json --output-format stream-json --verbose \
  --permission-mode auto --permission-prompt-tool mcp__clearance__permission \
  --mcp-config '{…}' --session-id <uuid> "/pipeline feature ALM-520 …"
```

Auto mode decides routine permissions. What it escalates, and every `AskUserQuestion`, reaches a small MCP server bundled with the app, which forwards the request to Clearance and returns your decision. Gates that end the turn with a question are answered by sending a message to the run. A run whose process exited resumes with `--resume` when you send to it.

Clearance never reads, stores, or proxies Claude credentials. It only runs the unmodified `claude` binary you are already signed into.

## Develop

```bash
pnpm install
pnpm test        # vitest over app/core
pnpm start       # build and launch
pnpm dist        # unsigned Clearance.app in release/
```

`app/core` holds the pure parsers (store → stages, session → run, transcript → gate, stream-json → gate, ordering) and is the only tested layer. `app/main` is the Electron side: file watching, process spawning, the permission server. `app/renderer` is the UI, ported from the prototype in `clearance.html`.

Dev-only environment variables: `CLEARANCE_WIN=1600x1000` sets the window size, `CLEARANCE_SHOT=<png>` captures the window after load and exits, `CLEARANCE_SMOKE_START='{"kind","task","repoPath"}'` starts an owned run at launch, `CLEARANCE_SMOKE_ANSWER='{"id","text","after"}'` answers one, `CLEARANCE_DEBUG=1` echoes the runs' stderr.

## Design

`PRODUCT.md` holds the product truth, `DESIGN.md` the design system recorded from the built prototype, and `.impeccable/surfaces/` the surface brief. The visual direction is the macOS productivity canon at the craft level of Linear, Raycast, and Apple Mail.
