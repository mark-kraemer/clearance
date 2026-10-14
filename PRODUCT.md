# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The target is a macOS desktop app. This session's deliverable is an interactive HTML prototype of it (user's choice, 2026-10-13), so the prototype follows macOS desktop conventions (window chrome, sidebar, keyboard-first) while being built as a web page. A later native build (SwiftUI, Tauri, or Electron) was deliberately left undecided.

## Stack

Interactive HTML prototype, single page, no framework (user's choice). Sample runs are authored at full fidelity and labeled synthetic.

## Users

One primary user: a software director at a consulting shop (RoleModel Software) who runs three to six Claude Code sessions at once in the Claude desktop app's Code tab, mostly one Linear issue per session, each in its own worktree. Their time is split between active development and mentoring, so they are rarely watching any single session. They return to the set of sessions in short bursts between meetings and need to know, in one glance, which run is waiting on them and which is still working.

## Product Purpose

A control room for concurrent Claude Code pipeline runs. Every run follows the fixed stages of the `pipeline` plugin (`plugins/pipeline` in this repository): plan, implement, review, file PR, reviewer feedback for a feature; the same minus plan for a bug. The pipeline stops only at five human gates (G1 scope, G2 plan, G3 visual, G4 review triage, G5 side effects).

The app exists so the user can:

1. See every running task at once, with the stage each is on and whether it is working or blocked.
2. See which runs are waiting at a gate and need a human answer, sorted so the one waiting longest is first.
3. Read the gate's question, screenshot, or triage table and answer it from the app, in a line, without opening the full session.
4. Jump into any session when a line is not enough.

Success: no gate waits unnoticed, and switching between runs costs one keystroke, not a hunt through a sidebar.

## Positioning

The Claude desktop app's sidebar lists sessions by title and unread state; it knows nothing about pipeline stages or gates. This app reads the pipeline's own state (the stage list and notes the `mcp__pipeline__*` tools store, the gate question text) and turns the sidebar into a board of runs ordered by what needs the human. It answers gates as a first-class action, not as a chat reply buried in a transcript.

## Operating Context

- Sessions run in the Claude desktop app (Code tab), three to six concurrently, typically in app-managed worktrees. The user answers gates in a single line ("go", "fix 1 and 3", "keep the defaults").
- The pipeline plugin stores one run per session: kind (feature or bug), title with the Linear issue ID first ("HBR-480 Client create/update tools"), and a stage list where each stage is pending, active, done, or skipped with an optional one-line note (the PR link lands as the File PR note).
- Gate content the user needs to read: G1 is a PR split with points plus up to three expensive-to-reverse questions each tagged with reversal cost; G2 is a plan summary ending in "Implement?"; G3 is a screenshot on real dev data plus listed visual compromises; G4 is a table of verified findings each with a fix / skip / ask line; G5 is one line naming an action and its visible consequence.
- Work also surfaces PR state (open, CI, review comments) and Linear issue IDs; both are secondary context, not the app's job.
- The user works at a Mac, usually with the Claude desktop app open beside this one, often returning after 20 to 60 minutes away.

## Capabilities and Constraints

Confirmed for the prototype:

- Run list with stage, status, elapsed time, and a "needs you" signal; a gate inbox ordered by waiting time.
- Per-run detail: the stage rail with notes, the current gate's full content, an inline answer composer with the gate's quick replies, and a "open in Claude Code" action.
- Keyboard switching between runs (number keys or Cmd+1..9, j/k, Cmd+K palette).
- Both a feature run (five stages) and a bug run (four stages) must render.
- States to show: a run working between gates, a run waiting at each of G1 to G5, a run done, a run with a stage skipped, and an empty state with no runs.

Integration facts (researched 2026-10-13, see memory and the report in this session):

- A personal app may drive the user's subscription only by spawning the unmodified `claude` CLI the user has already signed into. It must never read, copy, store, or proxy the OAuth credentials. The Agent SDK is documented as an API-key path for products. Bare mode never reads subscription credentials.
- Detection of a waiting gate comes from the CLI's hook events (`Notification` with `permission_prompt` / `idle_prompt`, `PreToolUse` on `AskUserQuestion`) and the stream-json output; answering goes back through stdin stream-json or by resuming the session.
- Undecided: whether the app replaces the Claude desktop app for these sessions or sits beside it. The prototype assumes beside it ("open in Claude Code" is the escape hatch).

Terminology: run (one pipeline session), stage (plan, implement, review, PR, feedback), gate (G1 to G5), note (the one-line stage summary), waiting (a run blocked at a gate), working (a run between gates).

## Brand Commitments

- Standing visual preference (user's choice, 2026-10-13): the category standard for a macOS productivity tool, played straight. No invented visual world. Quality bar: Linear, Raycast, and Apple's own Mail / Things 3 grammar (split views, a flat sidebar list, system font, native selection and toolbar).
- The pipeline's existing marks (○ pending, ● active, ✓ done, – skipped) and the gate numbering G1 to G5 are product vocabulary and are kept.
- Name: "Clearance" (chosen 2026-10-13). Air-traffic sense: every run holds at a gate until you clear it.

## Evidence on Hand

- The pipeline plugin source and skill: `plugins/pipeline` (stage list, gate definitions, pane rendering, hook mechanics).
- No real session data, screenshots, or transcripts are on hand. All runs in the prototype are synthetic and labeled.

## Product Principles

1. The waiting run is the headline. Anything blocked on the human outranks anything working, everywhere in the interface.
2. Answer in place. A gate is answered where it is read, in one line, with the gate's own quick replies; the full session is one step away, never required.
3. One glance, whole fleet. Stage and status for every run fit in the first viewport at the app's default size.
4. The pipeline's vocabulary, unchanged. Stages, gates, marks, and notes keep the names and meanings the plugin gives them.
5. Honest timing. Elapsed and waiting times are shown plainly so the user can triage by cost of delay.

## Accessibility & Inclusion

Keyboard operation for every action (switch run, answer gate, open session). Status is never carried by color alone; each state has a mark and a word.
