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
      symptoms: ['咳嗽', '发热'],
      诊断: '急性支气管炎',
      医嘱: ['多饮水', '按医嘱用药'],
      原文: '门诊病历原文',
      置信度: 0.92,
    },
  })

  assert.equal(output.doctorDiagnosis, '急性支气管炎')
  assert.deepEqual(Array.from(output.symptoms), ['咳嗽', '发热'])
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

test('vision output fills visible form fields when the model only returns raw OCR text', () => {
  const output = healthApi.normalizeVisionOutput('medical_record', {
    summary: '测试病例摘要',
    rawText: [
      '主诉：咳嗽三天，体温 37.8℃',
      '医生记录：咽部轻度充血，呼吸平稳',
      '医嘱：多饮温水，按医嘱复诊',
    ].join('\n'),
    confidence: 0.99,
  })

  assert.equal(output.doctorDiagnosis, '咽部轻度充血，呼吸平稳')
  assert.equal(output.doctorAdvice, '多饮温水，按医嘱复诊')
  assert.equal(output.summary, '测试病例摘要')
})

test('vision output keeps top-level OCR text when structured fields are nested', () => {
  const output = healthApi.normalizeVisionOutput('prescription', {
    rawText: '药品：测试药甲 10mg，每日两次\n医嘱：饭后服用',
    result: {
      doctorDiagnosis: '测试诊断',
    },
  })

  assert.equal(output.doctorDiagnosis, '测试诊断')
  assert.equal(output.doctorAdvice, '饭后服用')
  assert.equal(output.medicinesText, '测试药甲 10mg，每日两次')
})

test('vision output merges all supported nested containers', () => {
  const output = healthApi.normalizeVisionOutput('medicine_box', {
    output: { name: '测试药品' },
    result: { specification: '10mg x 12片' },
    data: { expireDate: '2028-12-31' },
    fields: { manufacturer: '测试制药有限公司' },
  })

  assert.equal(output.name, '测试药品')
  assert.equal(output.specification, '10mg x 12片')
  assert.equal(output.expireDate, '2028-12-31')
  assert.equal(output.manufacturer, '测试制药有限公司')
})

test('empty nested aliases do not overwrite readable top-level fields', () => {
  const output = healthApi.normalizeVisionOutput('medical_record', {
    doctorAdvice: '按医嘱复诊',
    data: { doctorAdvice: { text: '' } },
    fields: { doctorAdvice: ['  '] },
  })

  assert.equal(output.doctorAdvice, '按医嘱复诊')
})

test('raw OCR text alone is not treated as a successful visible-field result', () => {
  assert.equal(healthApi.hasVisionContent({ rawText: '没有字段标签的原始文字', confidence: 0.9 }), false)
  assert.equal(healthApi.hasVisionContent({ name: '测试药品', rawText: '原始文字' }), true)
})
