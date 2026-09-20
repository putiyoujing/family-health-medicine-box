const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const healthApi = loadCjsModule(path.join(__dirname, '..', 'cloudfunctions/healthApi/index.js'), {
  stubs: {
    'wx-server-sdk': {
      DYNAMIC_CURRENT_ENV: 'test',
      init() {},
      database() {
        return { command: {} }
      },
    },
  },
})

test('vision output accepts nested and Chinese field aliases without losing readable content', () => {
  const output = healthApi.normalizeVisionOutput('medical_record', {
    result: {
      诊断: '急性支气管炎',
      医嘱: ['多饮水', '按医嘱用药'],
      原文: '门诊病历原文',
      置信度: 0.92,
    },
  })

  assert.equal(output.doctorDiagnosis, '急性支气管炎')
  assert.equal(output.doctorAdvice, '多饮水；按医嘱用药')
  assert.equal(output.summary, '门诊病历原文')
  assert.equal(output.rawText, '门诊病历原文')
  assert.equal(output.confidence, 0.92)
})

test('vision output keeps structured English fields and nested objects readable', () => {
  const output = healthApi.normalizeVisionOutput('prescription', {
    fields: {
      doctorDiagnosis: '呼吸道感染',
      doctorAdvice: { treatment: '按医嘱服用', duration: '3天' },
      medicinesText: ['药品 A 5ml', '药品 B 每日两次'],
    },
  })

  assert.equal(output.doctorDiagnosis, '呼吸道感染')
  assert.equal(output.doctorAdvice, 'treatment：按医嘱服用；duration：3天')
  assert.equal(output.medicinesText, '药品 A 5ml；药品 B 每日两次')
})
