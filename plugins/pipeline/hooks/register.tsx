import type { EngineInterface, Register } from 'claude-code'

import type { PipelineKind, PipelineRun, Stage, StageId, StageStatus } from '../types'

const PANE = 'pipeline'
const START = 'mcp__pipeline__start'
const ADVANCE = 'mcp__pipeline__advance'
const SHOW = 'mcp__pipeline__show'

// $.store is kept across sessions and keyed by the worktree, not the session:
// a session started later in the same checkout (the feedback stage runs in a
// fresh one, see the pipeline skill) finds the run and reopens the pane.
// (This build's $.state is not reachable from hooks.)
async function runKey($: EngineInterface): Promise<string> {
  return `run:${await $.session.cwd()}`
}

async function readRun($: EngineInterface): Promise<PipelineRun | null> {
  const stored = await $.store.get(await runKey($))

  return (stored as PipelineRun | undefined) ?? null
}

async function changeRun($: EngineInterface, change: (now: PipelineRun | null) => PipelineRun | null) {
  const changed = change(await readRun($))
  await $.store.set(await runKey($), changed)
  $.ui.invalidate('ui.render')
}

const STAGES: Record<PipelineKind, readonly [StageId, string][]> = {
  feature: [
    ['plan', 'Plan (grilling)'],
    ['implement', 'Implement, test-first'],
    ['review', 'Ready for review'],
    ['pr', 'File PR'],
    ['feedback', 'Reviewer feedback'],
  ],
  bug: [
    ['implement', 'Fix, test-first'],
    ['review', 'Ready for review'],
    ['pr', 'File PR'],
    ['feedback', 'Reviewer feedback'],
  ],
}

// The rules that tell Claude when to start a pipeline live in the bundled
// skills/pipeline skill, not in a prompt.context hook: some builds bypass a
// user plugin's prompt.context hook.

// A Skill call for one of these opens its stage, so the pane keeps up even
// when the model forgets to call advance.
const SKILL_STAGE: Record<string, StageId> = {
  grilling: 'plan',
  'domain-modeling': 'plan',
  tdd: 'implement',
  'ready-for-review': 'review',
  'file-pr': 'pr',
  'pr-comments': 'feedback',
}

export function startRun(kind: PipelineKind, title: string): PipelineRun {
  const stages = STAGES[kind].map(([id, label], index): Stage => ({
    id,
    label,
    status: index === 0 ? 'active' : 'pending',
  }))

  return { kind, title, stages }
}

// Moving a stage to active closes every unfinished stage before it: work
// only moves forward, and a skipped stage stays skipped.
export function advanceRun(
  current: PipelineRun,
  id: StageId,
  status: StageStatus,
  note?: string,
): PipelineRun {
  const target = current.stages.findIndex(stage => stage.id === id)
  if (target === -1) return current

  const stages = current.stages.map((stage, index): Stage => {
    if (index === target) return { ...stage, status, note: note ?? stage.note }
    const isBehind = index < target && status !== 'pending'
    if (isBehind && (stage.status === 'pending' || stage.status === 'active')) {
      return { ...stage, status: 'done' }
    }

    return stage
  })

  return { ...current, stages }
}

const MARK: Record<StageStatus, string> = {
  pending: '○',
  active: '●',
  done: '✓',
  skipped: '–',
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'start',
      description:
        'Starts the work pipeline for a feature or bug fix and shows its stages in a pane.',
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['feature', 'bug'] },
          title: { type: 'string', description: 'Short name, e.g. "ABC-480 Client create/update tools"' },
        },
        required: ['kind', 'title'],
      },
    })
    await $.tool.register({
      name: 'advance',
      description: 'Marks a pipeline stage active, done or skipped.',
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          stage: { type: 'string', enum: ['plan', 'implement', 'review', 'pr', 'feedback'] },
          status: { type: 'string', enum: ['active', 'done', 'skipped'] },
          note: { type: 'string', description: 'One line: what happened, or the PR link' },
        },
        required: ['stage', 'status'],
      },
    })
    await $.tool.register({
      name: 'show',
      description: 'Reopens the pipeline pane, or clears the run and closes it.',
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: { clear: { type: 'boolean', description: 'Clear the run and close the pane' } },
      },
    })
    if (await readRun($)) await $.ui.open({ id: PANE, title: 'Pipeline' }).catch(() => undefined)

    return next(e)
  })

  on('tool.call', { tool: START }, async ($, e) => {
    const input = e as unknown as { kind: PipelineKind; title: string }
    if (!(input.kind in STAGES)) return { deny: `kind must be "feature" or "bug"` }

    const started = startRun(input.kind, input.title)
    await changeRun($, () => started)
    // The run is stored either way; a pane the surface will not seat now
    // opens later from /pipeline show.
    await $.ui.open({ id: PANE, title: 'Pipeline' }).catch(() => undefined)

    return { result: `Pipeline started: ${started.stages.map(stage => stage.label).join(' → ')}` }
  })

  on('tool.call', { tool: ADVANCE }, async ($, e) => {
    const input = e as unknown as { stage: StageId; status: StageStatus; note?: string }
    const current = await readRun($)
    if (!current) return { deny: `No pipeline is running; call ${START} first.` }
    if (!current.stages.some(stage => stage.id === input.stage)) {
      return { deny: `The ${current.kind} pipeline has no "${input.stage}" stage.` }
    }

    await changeRun($, now => (now ? advanceRun(now, input.stage, input.status, input.note) : now))

    return { result: `${input.stage}: ${input.status}` }
  })

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const stage = SKILL_STAGE[e.skill]
    if (stage) await changeRun($, now => (now ? advanceRun(now, stage, 'active') : now))

    return next(e)
  })

  // A PR that opened closes the pr stage, whether or not the model says so;
  // reviewer feedback stays pending until a comment arrives or the PR merges.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    const hasOpenedPr = /\bgh pr create\b/.test(e.command) && ran.deny === undefined && !ran.isError
    if (hasOpenedPr) {
      const link = ran.text?.match(/https:\/\/github\.com\/\S+\/pull\/\d+/)?.[0]
      await changeRun($, now => (now ? advanceRun(now, 'pr', 'done', link) : now))
    }

    return ran
  })

  on('tool.call', { tool: SHOW }, async ($, e) => {
    const input = e as unknown as { clear?: boolean }
    if (input.clear) {
      await changeRun($, () => null)
      await $.ui.close({ id: PANE }).catch(() => undefined)

      return { result: 'Pipeline cleared.' }
    }

    await $.ui.open({ id: PANE, title: 'Pipeline' }).catch(() => undefined)

    return { result: (await readRun($)) ? 'Pipeline pane opened.' : 'No pipeline is running.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const current = await readRun($)

    if (!current) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No pipeline running. Ask for a feature or bug fix to start one.</Text>
        </Box>
      )
    }

    const doneCount = current.stages.filter(s => s.status === 'done' || s.status === 'skipped').length

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>{current.title}</Text>
          <Text dimColor>
            {current.kind} · {doneCount} of {current.stages.length} stages
          </Text>
        </Box>
        <Box flexDirection="column">
          {current.stages.map(stage => (
            <Box flexDirection="column">
              <Text
                bold={stage.status === 'active'}
                color={stage.status === 'done' ? 'success' : stage.status === 'active' ? 'claude' : undefined}
                dimColor={stage.status === 'pending' || stage.status === 'skipped'}
              >
                {MARK[stage.status]} {stage.label}
              </Text>
              {stage.note && <Text dimColor>  {stage.note}</Text>}
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
