---
name: pipeline
description: Implementation pipeline with a progress pane and five human gates. Feature: grill, implement, ready-for-review, file-pr, reviewer feedback. Bug: fix, ready-for-review, file-pr, reviewer feedback. Use when the user asks to implement an issue, build a feature, or fix a bug.
argument-hint: "[feature|bug] <task> | show | clear"
---

# Pipeline

Implementation work runs through fixed stages. This plugin's hooks draw them in a pane and serve the `mcp__pipeline__*` tools. The pane shows progress; the **gates** below are where the human comes in, and they are the only places to stop for a decision.

A run's state lives in two places a later session can read, so no session re-derives it from the conversation: the plugin stores the pane's stages per worktree, and the branch's **review log** (`scripts/review_log.sh` in this skill's directory, written under `.git/claude-reviews/<branch>/`) holds the gate records: `plan` (G2), `visual` (G3), the review reports and their triages (G4), and the screenshot and PR-description marks. The log, not memory or the transcript, is what says where a branch stands.

## Arguments

- `feature <task>` or `bug <task>`: run that pipeline.
- `<task>` alone, or nothing: classify the task named here or in the conversation. A **bug** is existing behavior that is broken; anything that adds or changes behavior is a **feature**. Ask only when it is genuinely both.
- `show`: call `mcp__pipeline__show` and stop. `clear`: call it with `clear: true` and stop.

## Steps

1. **Check the work doesn't already exist, or is a resume.** Run `review_log.sh status` on the checked-out branch first. A `plan` entry means a pipeline ran here before: read it with `review_log.sh show plan`, then `show visual` and the triages the status table lists, and go to step 2 as a resume. Without one, for a tracked issue read its status and attachments for an open PR; otherwise search open PRs and branches. When the work exists and nothing is asked of it, report the PR and stop.
2. **Start.** Call `mcp__pipeline__start` with the kind and a short title, issue ID first (`ABC-480 Client create/update tools`). On a resume, mark every stage the log proves done with `advance`, say in one line what the log says the branch is waiting on (the `next:` line, an open PR, reviewer comments), and continue from there: the plan is settled, so no grilling, and tests, reviews and screenshots already recorded for HEAD are not redone.
3. **Run each stage in order.** Call `mcp__pipeline__advance` as each stage finishes or is skipped, with a one-line note. Starting a stage's skill, or a successful `gh pr create`, moves the pane on its own.

| Stage | Feature | Bug | Done when |
| --- | --- | --- | --- |
| plan | Skill `grilling`; add `domain-modeling` when the plan names or renames domain terms or makes a decision worth an ADR | none | **G1** and **G2** passed |
| implement | Skill `tdd`, seams taken from the plan | Skill `tdd`, started right away; stop to ask only when the right fix itself is ambiguous | the suite and linters are green, the work is committed with `commit-messages`, and **G3** passed when the diff touches UI |
| review | Skill `ready-for-review` | same | **G4** passed and it reports the branch ready |
| pr | Skill `file-pr` | same | the PR is open; its link is the note. **The session ends here**: report the link and stop |
| feedback | Skill `pr-comments` when a reviewer comments; `advance feedback skipped` when the PR merges without any | same | every comment has a reply or a commit, a re-review of the fix diff is clean, and the screenshots and description match HEAD |

The stage skills are not bundled with this plugin. When one of them is not installed, do that stage's work directly until its **Done when** column holds: plan by questioning the task until G1 and G2 can be asked, implement test-first, review the diff against the plan and for bugs (Claude Code's built-in `code-review` covers the second), and open the PR with `gh pr create`. The gates below apply either way.

Everything after the PR opens (reviewer comments, conflicts with the base branch, a tweak the user asks for after trying it) runs in a **new session** started with `/pipeline <issue>`, which resumes from the log. The session that built the PR is at 250k to 350k tokens of context by then, and every call after that re-reads all of it; the resumed session starts near the baseline and reads only the log and the diff it needs. When the user asks for post-PR work in the old session anyway, do it, and say in one line that a new session would cost a fraction.

## The five gates

Each gate is one message that ends with a question and then **waits**. The user answers in a line ("go", "fix 1 and 3", "keep the defaults"). Nothing else in the pipeline stops for input.

**G1 Scope** (plan, first round). The PR split with points, then at most three questions, each a decision that is expensive to reverse: architecture, the shape of the UI, a product rule. Tag each with its reversal cost. Everything cheaper is listed under *Decided unless you object* with the answer taken. No question goes out while a fact-finding sub-agent whose result could change the recommended answer is still running.

**G2 Plan** (plan, last round). The plan summary: what ships in this PR, what is deferred, the seams the tests sit at. A one-line "Implement?" closes the plan stage. Once the user answers, write the plan as agreed (the G2 message with their amendments applied) to a scratch file and run `review_log.sh save plan <file>` before `advance plan done`. It is what the implement stage takes its seams from, what the review checks the diff against, and what a resumed session reads instead of re-planning. Anything found later that is beyond this plan goes to a follow-up issue, not into the PR.

**G3 Visual** (implement, before `advance implement done`). Only when `git diff --name-only <base>...HEAD` touches views, components, stylesheets, or frontend JavaScript. Screenshot the change running on real development data, send the image to the user, and list every visual compromise found while building as a question. A compromise is a question, not a footnote in the report. Without a dev server, fall back to a throwaway test seeded with real-world values and say so. Wait for the user's look before moving on. Then record their answers, one line per compromise (kept, fixed, or deferred to which issue), with `review_log.sh save visual <file>`, so a reviewer comment on a kept compromise gets the reason that was already decided.

**G4 Review triage** (review). The review checks the diff against the plan and for bugs, verifies each finding, drafts a fix / skip / ask line per finding, and stops with that table before making any fix. A finding that changes product behavior, or goes beyond the plan, is never `fix` on Claude's own call: it is `ask`, or it becomes a follow-up issue. The user's answer sets the fix list; the fixes then run to the PR without another stop.

**G5 Side effects** (any stage). Before a push to a branch someone else works on, a force-push, a restack, a merge, a write to the issue tracker, a review reply in the user's name, or anything else visible outside this machine: one line naming the action and its visible consequence ("fast-forwarding #259 will mark #263 merged"), then wait. After the action, re-read the remote state (`gh pr view`, the stack, CI) before reporting it done. When an automated event (an autofix bot, a CI monitor, a notification) contradicts something the user said, stop and ask; the event never wins on its own.

## Not gates

These used to stop the pipeline and gave nothing back:

- Confirming test seams with the user. They come from the plan (G2). The implement stage confirms them only when the plan did not list any.
- "Should I commit?" and "Should I push?". `commit` means commit. Push only when told, or when the PR is filed.
- Questions whose recommended answer rests on the code or the conventions (where a filter lives, a ticket id, whether to add an unrequested field). Proceed with the recommended answer and show it as one line in the stage report, so the user can object cheaply.
- `AskUserQuestion` outside G1 to G5. Inside a gate it is fine; between gates it blocks a session the user may not be watching.

## Before asking

A grilling question is drafted only after checking the nearest local pattern and the memory index. The answer is often already there (a neighboring model already shows the pattern; worktrees use the issue's branch name), and asking for it costs a round trip and makes the user supply what the repo already says.
