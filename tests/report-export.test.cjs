const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('demo illness report leads with recorded facts and includes the doctor questions', () => {
  const demo = loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))
  const member = demo.saveMember({
    name: '孩子',
    relation: '子女',
  })
  const illness = demo.saveIllness({
    memberId: member.id,
    startedAt: '2026-07-19 08:00',
    symptoms: ['咳嗽', '发热'],
    symptomDescription: '夜间咳嗽加重',
    temperatureMax: '38.6',
    status: '观察中',
    doctorDiagnosis: '上呼吸道感染',
    doctorAdvice: '三天后复诊',
  })

  const report = demo.exportReport({
    illnessRecordId: illness.id,
    doctorQuestions: '多久可以好\n需要注意什么',
  }).reportText

  assert.ok(report.indexOf('## 本次病程') < report.indexOf('## 安全提示'))
  assert.match(report, /主要症状：咳嗽、发热/)
  assert.match(report, /症状描述：夜间咳嗽加重/)
  assert.match(report, /医生诊断：上呼吸道感染/)
  assert.match(report, /1\. 多久可以好/)
  assert.match(report, /2\. 需要注意什么/)
  assert.doesNotMatch(report, /出生日期：未记录/)
})

test('report page renders the summary in a vertical scroll view with one-tap copy', () => {
  const template = fs.readFileSync(
    path.join(root, 'miniprogram/pages/report/export.wxml'),
    'utf8',
  )

  assert.match(template, /<scroll-view[^>]+scroll-y[^>]*>/)
  assert.match(template, />复制全部内容<\/button>/)
  assert.doesNotMatch(template, /<textarea[^>]+value="\{\{reportText\}\}"/)
  assert.doesNotMatch(template, /user-select|长按/)
})

test('generic personal-center export is removed while the illness summary route remains', () => {
  const profileTemplate = fs.readFileSync(
    path.join(root, 'miniprogram/pages/profile/index.wxml'),
    'utf8',
  )
  const profileScript = fs.readFileSync(
    path.join(root, 'miniprogram/pages/profile/index.js'),
    'utf8',
  )
  const reportTemplate = fs.readFileSync(
    path.join(root, 'miniprogram/pages/report/export.wxml'),
    'utf8',
  )

  assert.doesNotMatch(profileTemplate, /就诊导出/)
  assert.doesNotMatch(profileScript, /openReport/)
  assert.doesNotMatch(reportTemplate, /导出范围|最近 30 天/)
  assert.match(reportTemplate, /本次病程复诊摘要/)
})

test('report page can render the complete summary as one long image and open preview', async () => {
  let pageDefinition
  let exportCount = 0
  let exportPayload
  let previewPayload
  const context = createCanvasContext()
  const canvas = {
    width: 0,
    height: 0,
    getContext() {
      return context
    },
  }
  loadCjsModule(path.join(root, 'miniprogram/pages/report/export.js'), {
    stubs: {
      '../../services/api': {},
      '../../utils/operation-guards': { ensureLoginReady: async () => true },
    },
    globals: {
      Page(definition) {
        pageDefinition = definition
      },
      wx: {
        createSelectorQuery() {
          return {
            select() {
              return this
            },
            fields() {
              return this
            },
            exec(callback) {
              callback([{ node: canvas }])
            },
          }
        },
        canvasToTempFilePath(payload) {
          exportCount += 1
          exportPayload = payload
          payload.success({ tempFilePath: `report-${exportCount}.png` })
        },
        hideLoading() {},
        previewImage(payload) {
          previewPayload = payload
        },
        showLoading() {},
        showToast() {},
      },
    },
  })
  const page = createPageInstance(pageDefinition, {
    reportText: [
      '# 我本次病程复诊摘要',
      '',
      '## 本次病程',
      '- 主要症状：咳嗽',
      '',
      '## 时间线',
      ...Array.from({ length: 80 }, (_, index) => `${index + 1}. 病程记录内容`),
      '',
      '## 想问医生的问题',
      '1. 多久可以好',
    ].join('\n'),
  })

  await page.generateReportImage()

  assert.equal(page.data.imageGenerating, false)
  assert.equal(page.data.imageStatus, '已生成 1 张长图')
  assert.equal(exportCount, 1)
  assert.equal(page.data.reportImagePaths.length, 1)
  assert.ok(canvas.height > 1600)
  assert.equal(exportPayload.destHeight, canvas.height)
  assert.deepEqual(Array.from(previewPayload.urls), Array.from(page.data.reportImagePaths))
})

test('old cloud report output still puts the freshly entered questions near the top', async () => {
  let pageDefinition
  let exportPayload
  loadCjsModule(path.join(root, 'miniprogram/pages/report/export.js'), {
    stubs: {
      '../../services/api': {
        async exportReport(payload) {
          exportPayload = payload
          return {
            reportText: [
              '# 我本次病程复诊摘要',
              '',
              '## 安全提示',
              '仅用于记录。',
              '',
              '## 基础信息',
              '- 成员：我',
              '',
              '## 本次病程',
              '- 主要症状：咳嗽',
              '',
              '## 想问医生的问题',
              '暂无手动填写问题',
            ].join('\n'),
          }
        },
      },
      '../../utils/operation-guards': { ensureLoginReady: async () => true },
    },
    globals: {
      Page(definition) {
        pageDefinition = definition
      },
      wx: {
        hideLoading() {},
        showLoading() {},
        showToast() {},
      },
    },
  })
  const page = createPageInstance(pageDefinition, {
    illnessRecordId: 'illness-1',
    doctorQuestions: '多久可以好\n需要注意什么',
  })

  await page.generate()

  assert.ok(page.data.reportText.indexOf('## 本次病程') < page.data.reportText.indexOf('## 安全提示'))
  assert.ok(page.data.reportText.indexOf('## 想问医生的问题') < page.data.reportText.indexOf('## 安全提示'))
  assert.match(page.data.reportText, /1\. 多久可以好/)
  assert.match(page.data.reportText, /2\. 需要注意什么/)
  assert.doesNotMatch(page.data.reportText, /暂无手动填写问题/)
  assert.equal(exportPayload.illnessRecordId, 'illness-1')
  assert.equal(exportPayload.doctorQuestions, '多久可以好\n需要注意什么')
})

test('one tap sends the complete report to the clipboard without a confirmation modal', async () => {
  let pageDefinition
  let clipboardData = ''
  const toasts = []
  loadCjsModule(path.join(root, 'miniprogram/pages/report/export.js'), {
    stubs: {
      '../../services/api': {},
      '../../utils/operation-guards': { ensureLoginReady: async () => true },
    },
    globals: {
      Page(definition) {
        pageDefinition = definition
      },
      wx: {
        setClipboardData(payload) {
          clipboardData = payload.data
          payload.success()
        },
        showToast(payload) {
          toasts.push(payload.title)
        },
      },
    },
  })
  const reportText = '# 摘要\n\n## 本次病程\n完整内容'
  const page = createPageInstance(pageDefinition, { reportText })

  await page.copyReport()

  assert.equal(clipboardData, reportText)
  assert.deepEqual(toasts, ['已复制全部内容'])
})

test('clipboard privacy failure points to the required platform declaration', async () => {
  let pageDefinition
  const modals = []
  loadCjsModule(path.join(root, 'miniprogram/pages/report/export.js'), {
    stubs: {
      '../../services/api': {},
      '../../utils/operation-guards': { ensureLoginReady: async () => true },
    },
    globals: {
      console: { error() {} },
      Page(definition) {
        pageDefinition = definition
      },
      wx: {
        showModal(payload) {
          modals.push(payload)
        },
        setClipboardData(payload) {
          payload.fail({
            errMsg: 'setClipboardData:fail api scope is not declared in the privacy agreement',
          })
        },
      },
    },
  })
  const page = createPageInstance(pageDefinition, { reportText: '本次病程摘要' })

  await page.copyReport()

  assert.equal(modals.length, 1)
  assert.equal(modals[0].title, '需配置剪贴板权限')
  assert.match(modals[0].content, /用户隐私保护指引/)
  assert.match(modals[0].content, /剪切板/)
  assert.doesNotMatch(modals[0].content, /长按/)
})

function createCanvasContext() {
  return {
    fillStyle: '',
    font: '',
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
    textBaseline: '',
    beginPath() {},
    closePath() {},
    fill() {},
    fillRect() {},
    fillText() {},
    lineTo() {},
    measureText(text) {
      return { width: String(text).length * 18 }
    },
    moveTo() {},
    quadraticCurveTo() {},
    stroke() {},
  }
}
