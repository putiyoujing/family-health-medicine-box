const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('demo data starts with only the owner profile and no seeded health records', () => {
  const demo = loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))
  const home = demo.getHome()

  assert.equal(home.members.length, 1)
  assert.equal(home.family.memberCount, 1)
  assert.equal(home.medicines.length, 0)
  assert.equal(home.illnessRecords.length, 0)
  assert.equal(home.courseEvents.length, 0)
  assert.equal(home.medicationLogs.length, 0)
  assert.equal(home.reminders.length, 0)
})

test('demo AI query reports an empty health record without exposing seeded examples', () => {
  const demo = loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))
  const result = demo.assistantQuery('')

  assert.equal(typeof result.safetyNotice, 'string')
  assert.ok(result.safetyNotice.length > 0)
  assert.equal(Object.hasOwn(result, 'reminders'), false)
  assert.equal(result.facts.length, 0)
  assert.ok(result.answer)
})

test('assistant input starts empty and uses a placeholder example', () => {
  let pageDefinition
  loadCjsModule(path.join(root, 'miniprogram/pages/assistant/index.js'), {
    stubs: {
      '../../services/api': {},
      '../../utils/constants': { SAFETY_NOTICE: 'notice' },
      '../../utils/operation-guards': {},
    },
    globals: { Page: (definition) => { pageDefinition = definition } },
  })

  const template = fs.readFileSync(path.join(root, 'miniprogram/pages/assistant/index.wxml'), 'utf8')
  assert.equal(pageDefinition.data.question, '')
  assert.ok(template.includes('placeholder='))
})
