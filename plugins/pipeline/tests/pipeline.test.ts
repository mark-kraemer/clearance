import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import type { PipelineRun } from '../types'

// Answers the nouns the plugin reaches beneath it, and hands back the run it
// stored, so each test reads what the pane would draw.
function world(on: On) {
  const store = new Map<string, unknown>()
  on('session.cwd', () => ({ value: '/wt/abc-1' }))
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => {
    store.set(e.key, e.value)

    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('tool.call', { tool: 'Skill' }, () => ({ result: { success: true, commandName: 'x' } }) as never)

  const run = () => store.get('run:/wt/abc-1') as PipelineRun | undefined

  return {
    run,
    keys: () => [...store.keys()],
    statuses: () => run()?.stages.map(stage => `${stage.id}:${stage.status}`),
  }
}

test('a feature starts at plan and follows its skills to an opened PR', async ($, on) => {
  const { run, statuses } = world(on)
  on('tool.call', { tool: 'Bash' }, () =>
    ({ result: { stdout: '', stderr: '' }, text: 'https://github.com/acme/harbor/pull/269' }) as never,
  )

  await $.tool.call({ tool: 'mcp__pipeline__start', kind: 'feature', title: 'ABC-480' } as never)
  expect(statuses()).toEqual(['plan:active', 'implement:pending', 'review:pending', 'pr:pending', 'feedback:pending'])

  await $.tool.call({ tool: 'Skill', skill: 'ready-for-review' })
  expect(statuses()).toEqual(['plan:done', 'implement:done', 'review:active', 'pr:pending', 'feedback:pending'])

  await $.tool.call({ tool: 'Bash', command: 'gh pr create --title x --body y' })
  expect(statuses()).toEqual(['plan:done', 'implement:done', 'review:done', 'pr:done', 'feedback:pending'])
  expect(run()?.stages.find(stage => stage.id === 'pr')?.note).toBe('https://github.com/acme/harbor/pull/269')

  await $.tool.call({ tool: 'Skill', skill: 'pr-comments' })
  expect(statuses()).toEqual(['plan:done', 'implement:done', 'review:done', 'pr:done', 'feedback:active'])
})

test('a bug starts at the fix, and a skipped stage stays skipped', async ($, on) => {
  const { statuses } = world(on)

  await $.tool.call({ tool: 'mcp__pipeline__start', kind: 'bug', title: 'Target modal 404' } as never)
  expect(statuses()).toEqual(['implement:active', 'review:pending', 'pr:pending', 'feedback:pending'])

  await $.tool.call({ tool: 'mcp__pipeline__advance', stage: 'review', status: 'skipped' } as never)
  await $.tool.call({ tool: 'mcp__pipeline__advance', stage: 'pr', status: 'active' } as never)
  expect(statuses()).toEqual(['implement:done', 'review:skipped', 'pr:active', 'feedback:pending'])

  await $.tool.call({ tool: 'mcp__pipeline__advance', stage: 'feedback', status: 'skipped', note: 'merged without comments' } as never)
  expect(statuses()).toEqual(['implement:done', 'review:skipped', 'pr:done', 'feedback:skipped'])
})

test('a skill outside the pipeline leaves it alone', async ($, on) => {
  const { statuses } = world(on)

  await $.tool.call({ tool: 'mcp__pipeline__start', kind: 'bug', title: 'x' } as never)
  await $.tool.call({ tool: 'Skill', skill: 'grilling' })
  expect(statuses()).toEqual(['implement:active', 'review:pending', 'pr:pending', 'feedback:pending'])
})

test('advance refuses a stage the pipeline does not have', async ($, on) => {
  world(on)

  await $.tool.call({ tool: 'mcp__pipeline__start', kind: 'bug', title: 'x' } as never)
  const answer = await $.tool.call({ tool: 'mcp__pipeline__advance', stage: 'plan', status: 'done' } as never)

  expect(answer.deny).toContain('no "plan" stage')
})

test('grill-with-docs reaches plan through domain-modeling', async ($, on) => {
  const { statuses } = world(on)

  await $.tool.call({ tool: 'mcp__pipeline__start', kind: 'feature', title: 'x' } as never)
  await $.tool.call({ tool: 'mcp__pipeline__advance', stage: 'plan', status: 'done' } as never)
  await $.tool.call({ tool: 'Skill', skill: 'domain-modeling' })
  expect(statuses()).toEqual(['plan:active', 'implement:pending', 'review:pending', 'pr:pending', 'feedback:pending'])
})

test('show clears the run when asked', async ($, on) => {
  const { run } = world(on)

  await $.tool.call({ tool: 'mcp__pipeline__start', kind: 'bug', title: 'x' } as never)
  const shown = await $.tool.call({ tool: 'mcp__pipeline__show' } as never)
  expect(shown.result).toBe('Pipeline pane opened.')

  await $.tool.call({ tool: 'mcp__pipeline__show', clear: true } as never)
  expect(run()).toBeNull()
})

test('the run is stored under the worktree, so a later session there resumes it', async ($, on) => {
  const { keys, statuses } = world(on)

  await $.tool.call({ tool: 'mcp__pipeline__start', kind: 'feature', title: 'ABC-522' } as never)
  await $.tool.call({ tool: 'mcp__pipeline__advance', stage: 'pr', status: 'done', note: 'pull/285' } as never)

  expect(keys()).toEqual(['run:/wt/abc-1'])
  expect(statuses()).toEqual(['plan:done', 'implement:done', 'review:done', 'pr:done', 'feedback:pending'])
})
