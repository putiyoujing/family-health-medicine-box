const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')
const pagePath = path.join(root, 'miniprogram/pages/illness/quick.js')

test('quick illness page is registered without voice prompt and exposes categorized uploads', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'))
  const template = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/quick.wxml'), 'utf8')
  const page = loadCjsModule(pagePath, {
    globals: {
      Page() {},
    },
  })

  assert.ok(appConfig.pages.includes('pages/illness/quick'))
  assert.doesNotMatch(template, /键盘自带的语音输入/)
  assert.doesNotMatch(template, /class="page-title"/)
  assert.match(template, /src="\{\{file\.fileID \|\| file\.tempFilePath\}\}"/)
  assert.doesNotMatch(template, /bindtap="startTextParse"/)
  assert.match(template, /提交并保存病程后，再整理文字和图片/)
  assert.deepEqual(Array.from(page.buildSlots(), (slot) => slot.label), [
    '病例 / 问诊单',
    '检查报告',
    '处方 / 医嘱',
    '药品图片',
  ])
  assert.doesNotMatch(template, /bindtap="startRecord"|recorderManager|startRecord|wx\.getRecorderManager/)
})

test('quick illness saves images and sends them to explicit user review before parsing', async () => {
  let pageDefinition
  let redirectUrl = ''
  const calls = []
  const home = {
    features: { imageParsingEnabled: true },
    members: [{ _id: 'member-a', name: '小宝' }],
  }
  const app = { globalData: { useDemoData: false } }
  const page = loadCjsModule(pagePath, {
    stubs: {
      '../../services/api': {
        getHome: async () => home,
        saveIllness: async (payload) => {
          calls.push({ action: 'saveIllness', payload })
          return { id: 'illness-a' }
        },
        saveAttachment: async (payload) => {
          calls.push({ action: 'saveAttachment', payload })
          return { id: `attachment-${calls.filter((item) => item.action === 'saveAttachment').length}` }
        },
        parseIllnessText: async (payload) => {
          calls.push({ action: 'textParse', payload })
          return {
            output: {
              symptoms: ['发烧', '咳嗽'],
              temperatureMax: 38.6,
              summary: payload.text,
            },
          }
        },
        parseAttachment: async (payload) => {
          calls.push({ action: 'parse', payload })
          return {
            task: { _id: `task-${payload.fileId}` },
            output: {
              doctorDiagnosis: '上呼吸道感染',
              doctorAdvice: '多饮水，注意休息',
              examinationResult: '白细胞偏高',
              medicinesText: '布洛芬混悬液 100ml',
              summary: '门诊资料摘要',
            },
          }
        },
        confirmAiParseResult: async (payload) => {
          calls.push({ action: 'confirm', payload })
          return { status: 'confirmed' }
        },
      },
      '../../utils/operation-guards': {
        ensureHasMembers: () => true,
        ensureLoginReady: async () => true,
      },
    },
    globals: {
      Page(definition) {
        pageDefinition = definition
      },
      getApp: () => app,
      wx: {
        hideLoading() {},
        showLoading() {},
        showToast() {},
        redirectTo({ url }) {
          redirectUrl = url
        },
        previewImage() {},
      },
    },
  })
  const instance = createPageInstance(pageDefinition)

  await instance.load()
  assert.equal(instance.data.totalImageLimit, 3)
  instance.setData({
    slots: instance.data.slots.map((slot, index) => index === 0
      ? { ...slot, files: [{ fileID: 'cloud://preview.jpg', tempFilePath: '/tmp/preview.jpg' }] }
      : slot),
    totalFileCount: 1,
  })
  instance.previewImage({ currentTarget: { dataset: { slot: 0, index: 0 } } })
  assert.equal(instance.data.previewVisible, true)
  assert.equal(instance.data.previewImageUrl, 'cloud://preview.jpg')
  instance.removePreviewImage()
  assert.equal(instance.data.previewVisible, false)
  assert.equal(instance.data.totalFileCount, 0)
  const threeFiles = Array.from({ length: 3 }, (_, index) => ({ fileID: `cloud://preview-${index}.jpg` }))
  instance.setData({ slots: instance.data.slots.map((slot, index) => index === 0 ? { ...slot, files: threeFiles } : slot) })
  assert.equal(instance.data.slots[0].files.length, 3)
  assert.equal(instance.data.slots[1].files.length, 0)
  instance.setData({
    inputText: '昨晚发烧，今天去医院检查。',
    slots: instance.data.slots.map((slot, index) => index === 0
      ? { ...slot, files: [{ fileID: 'cloud://record.jpg', tempFilePath: '/tmp/record.jpg' }] }
      : slot),
  })
  await instance.submit()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(redirectUrl, '/pages/illness/review')
  assert.equal(calls[0].payload.entrySource, 'quick')
  assert.equal(calls.filter((item) => item.action === 'saveAttachment').length, 1)
  assert.equal(calls.filter((item) => item.action === 'saveIllness').length, 1)
  assert.equal(calls.some((item) => item.action === 'parse'), false)
  assert.equal(calls.some((item) => item.action === 'textParse'), false)
  assert.equal(calls.some((item) => item.action === 'confirm'), false)
  assert.equal(app.globalData.pendingIllnessReview.illnessId, 'illness-a')
  assert.equal(app.globalData.pendingIllnessReview.returnUrl, '/pages/illness/detail?id=illness-a')
})

test('quick illness saves raw text before any AI parsing', async () => {
  let pageDefinition
  let savedPayload
  let redirectUrl = ''
  const calls = []
  const app = { globalData: { useDemoData: false } }
  const page = loadCjsModule(pagePath, {
    stubs: {
      '../../services/api': {
        getHome: async () => ({
          features: { imageParsingEnabled: true },
          members: [{ _id: 'member-a', name: '小宝' }],
        }),
        confirmAiParseResult: async (payload) => {
          calls.push({ action: 'confirm', payload })
          return { status: 'confirmed' }
        },
        saveIllness: async (payload) => {
          savedPayload = payload
          calls.push({ action: 'save', payload })
          return { id: 'illness-text-a' }
        },
      },
      '../../utils/operation-guards': {
        ensureHasMembers: () => true,
        ensureLoginReady: async () => true,
      },
    },
    globals: {
      Page(definition) {
        pageDefinition = definition
      },
      getApp: () => app,
      wx: {
        hideLoading() {},
        showLoading() {},
        showToast() {},
        redirectTo({ url }) {
          redirectUrl = url
        },
      },
    },
  })
  const instance = createPageInstance(pageDefinition)
  await instance.load()
  instance.setData({ inputText: '昨晚开始发烧并咳嗽，最高 38.6℃。' })

  await instance.submit()
  assert.equal(calls[0].action, 'save')
  assert.deepEqual(Array.from(savedPayload.symptoms), [])
  assert.equal(savedPayload.temperatureMax, null)
  assert.equal(savedPayload.symptomDescription, '昨晚开始发烧并咳嗽，最高 38.6℃。')
  assert.equal(redirectUrl, '/pages/illness/review')
  assert.equal(app.globalData.pendingIllnessReview.illnessId, 'illness-text-a')
  assert.equal(app.globalData.pendingIllnessReview.inputText, '昨晚开始发烧并咳嗽，最高 38.6℃。')
  assert.equal(calls.some((item) => item.action === 'confirm'), false)
})
