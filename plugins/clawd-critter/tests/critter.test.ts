import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'clawd-critter',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 12,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 11 },
    view: {},
  },
} as const

test('the critter draws itself above the prompt', async $ => {
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Raster', key: 'critter' })).toBeDefined()
  await ui.unmount()
})

test('a git commit gets its own act', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '', interrupted: false } }) as never)
  await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: snacks"' })
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /git commit -m/ })).toBeDefined()
  await ui.unmount()
})

test('a failing test run makes it dizzy', async ($, on) => {
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: 'boom', interrupted: false }, isError: true }) as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: /tests failed/ })).toBeDefined()
  await ui.unmount()
})

test('/critter hide clears the band', async ($, on) => {
  mock.store(on)
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, 'engine band') as never
  })
  await $.command.run({ command: 'critter', args: 'hide' } as never)
  const ui = await $.ui.mount(BAND)
  expect(await ui.find({ type: 'Text', text: 'engine band' })).toBeDefined()
  expect(await ui.find({ type: 'Raster', key: 'critter' })).toBeUndefined()
  await ui.unmount()
})
