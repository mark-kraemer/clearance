---
version: 1
slug: "clearance-html"
primary_target: "clearance.html"
related_targets: []
---

# Surface: clearance.html (the whole app shell, prototyped as one page)

Scope and mode: Operate. A macOS control room for concurrent pipeline runs; the user completes one task here: find the run that needs them, read its gate, answer in a line.

Audience and job: one software director with 3 to 6 Claude Code sessions running, returning between meetings. Job: no gate waits unnoticed; switching runs costs one keystroke.

Action: Send (Cmd+Return) on the open gate's composer, seeded by the gate's quick replies. Secondary: Open in Claude Code (Cmd+O). Navigation: Cmd+1..9, j/k, Cmd+K palette. New run (Cmd+N, toolbar plus, palette): a sheet with kind, task, repository and the derived worktree; starting one puts the run in Working for the plugin's step 0 check, then opens G1 for a feature or begins the test-first fix for a bug.

Content: run list grouped Needs you / Working / Done, ranked by waiting time inside Needs you; per run a stage rail with notes, the gate's full content (G1 questions with reversal cost, G2 plan summary, G3 screenshot plus compromises, G4 triage table, G5 one-line consequence), an activity feed when working, stage notes history. All run data is synthetic and labeled.

Constraints: category standard, no invented world. Quality bar Linear, Raycast, Apple Mail / Things 3. Pipeline vocabulary (stages, gates, marks) unchanged. Status never by color alone. Follows system appearance, with a toggle.

Chosen direction and memorable moment: a Mac split view whose left list is an inbox of gates. The moment: answer a gate, the run drops to Working, and a notification brings it back when the next gate opens.

Unresolved: native stack (SwiftUI vs Tauri/Electron); whether the app replaces or sits beside the Claude desktop app; the real transport for answers (CLI stdin stream-json vs resume).
