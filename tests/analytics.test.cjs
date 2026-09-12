const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const analyticsPath = path.join(__dirname, '..', 'miniprogram', 'utils', 'analytics.js')

test('analytics buckets and input types are privacy-safe', () => {
  const analytics = loadCjsModule(analyticsPath)

  assert.equal(analytics.inputType({ inputText: '症状原文', imageCount: 0 }), 'text')
  assert.equal(analytics.inputType({ inputText: '', imageCount: 1 }), 'image')
  assert.equal(analytics.inputType({ inputText: 'text', imageCount: 1 }), 'mixed')
  assert.equal(analytics.countBucket(4), '4_5')
  assert.equal(analytics.latencyBucket(12000), '10_20s')
})

test('analytics reports only registered events and whitelisted properties', () => {
  const calls = []
  const analytics = loadCjsModule(analyticsPath, {
    globals: {
      wx: {
        reportEvent(eventId, properties) {
          calls.push({ eventId, properties })
        },
      },
    },
  })

  assert.equal(analytics.track(analytics.EVENT_IDS.RECORD_AI_RESULT, {
    input_type: 'image',
    status: 'success',
    symptom_description: 'must not be sent',
  }), true)
  assert.equal(analytics.track('unknown_event', { status: 'success' }), false)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].eventId, 'record_ai_result')
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].properties)), {
    input_type: 'image',
    status: 'success',
  })
})
