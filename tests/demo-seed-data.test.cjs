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
