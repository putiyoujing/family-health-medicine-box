const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')
const pagePath = path.join(root, 'miniprogram/pages/illness/review.js')

test('illness review page is registered and keeps unsupported WXML expressions out', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'))
  const template = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/review.wxml'), 'utf8')
  const pageSource = fs.readFileSync(pagePath, 'utf8')

  assert.ok(appConfig.pages.includes('pages/illness/review'))
  assert.doesNotMatch(template, /\.filter\(|\.some\(|=>/)
  assert.match(template, /bindtap="confirmResult"/)
  assert.match(template, /bindtap="startTextParse"/)
  assert.match(pageSource, /autoStartReview/)
  assert.match(template, /保存病程后整理/)
  assert.match(template, /src="\{\{currentItem\.fileId \|\| currentItem\.tempFilePath\}\}"/)
  assert.match(template, /不会自动进入药箱/)
})

test('illness review automatically parses saved text after entering the post-save review', async () => {
  const calls = []
  let pageDefinition
  let navigatedBack = false
  const app = {
    globalData: {
      imageParsingEnabled: true,
      pendingIllnessReview: {
        illnessId: 'illness-text-a',
        inputText: '昨晚开始发烧并咳嗽，最高 38.6℃。',
        attachments: [],
      },
    },
  }
  const page = loadCjsModule(pagePath, {
    stubs: {
      '../../services/api': {
        parseIllnessText: async (payload) => {
          calls.push({ action: 'parse', payload })
          return {
            task: { _id: 'text-task-1', status: 'success' },
            output: { symptoms: ['发热', '咳嗽'], temperatureMax: 38.6, summary: payload.text },
          }
        },
        confirmAiParseResult: async (payload) => {
          calls.push({ action: 'confirm', payload })
          return { status: 'confirmed', output: payload.output }
        },
      },
      '../../utils/operation-guards': {
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
        navigateBack() {
          navigatedBack = true
        },
      },
    },
  })
  const instance = createPageInstance(pageDefinition)
  await instance.onLoad()

  assert.equal(instance.data.illnessId, 'illness-text-a')
  assert.equal(instance.data.inputText, '昨晚开始发烧并咳嗽，最高 38.6℃。')
  assert.equal(calls[0].action, 'parse')
  assert.equal(calls[0].payload.illnessId, 'illness-text-a')
  assert.equal(instance.data.textConfirmed, true)
  instance.onTextFieldInput({ currentTarget: { dataset: { key: 'symptoms' } }, detail: { value: '发热、咳嗽、咽痛' } })
  instance.finishReview()
  assert.equal(calls.length, 1)
  assert.equal(navigatedBack, true)
})

test('illness review parses and confirms attachments one by one', async () => {
  const calls = []
  let pageDefinition
  const app = {
    globalData: {
      imageParsingEnabled: true,
      pendingIllnessReview: {
        illnessId: 'illness-a',
        attachments: [
          { _id: 'attachment-a', fileId: 'cloud://a.jpg', tempFilePath: '/tmp/a.jpg' },
          { _id: 'attachment-b', fileId: 'cloud://b.jpg', tempFilePath: '/tmp/b.jpg' },
        ],
      },
    },
  }
  const page = loadCjsModule(pagePath, {
    stubs: {
      '../../services/api': {
        parseAttachment: async (payload) => {
          calls.push({ action: 'parse', payload })
          return {
            task: { _id: `task-${payload.fileId}`, status: 'success' },
            output: { doctorDiagnosis: '呼吸道感染', medicinesText: '药品 A' },
          }
        },
        confirmAiParseResult: async (payload) => {
          calls.push({ action: 'confirm', payload })
          return { status: 'confirmed' }
        },
      },
      '../../utils/operation-guards': {
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
        showModal() {},
        navigateBack() {},
      },
    },
  })
  assert.equal(typeof page.normalizeReviewItems, 'function')
  const instance = createPageInstance(pageDefinition)
  await instance.onLoad()

  assert.equal(instance.data.items.length, 2)
  assert.equal(instance.data.currentItem._id, 'attachment-a')
  assert.equal(calls[0].action, 'parse')
  assert.deepEqual(Array.from(calls[0].payload.attachmentIds), ['attachment-a'])
  assert.equal(calls[1].action, 'parse')
  assert.deepEqual(Array.from(calls[1].payload.attachmentIds), ['attachment-b'])
  assert.equal(instance.data.items[0].confirmed, true)
  assert.equal(instance.data.items[1].confirmed, true)
  assert.equal(instance.data.items[0].statusText, '已写入病程，可修改')
  assert.equal(instance.data.currentItem._id, 'attachment-a')
})

test('skipping image review returns to the illness and keeps the unfinished review', async () => {
  let pageDefinition
  let redirectUrl = ''
  const app = {
    globalData: {
      imageParsingEnabled: false,
      pendingIllnessReview: {
        illnessId: 'illness-a',
        returnUrl: '/pages/illness/detail?id=illness-a',
        attachments: [{ _id: 'attachment-a', fileId: 'cloud://a.jpg' }],
      },
    },
  }
  loadCjsModule(pagePath, {
    stubs: {
      '../../services/api': {},
      '../../utils/operation-guards': { ensureLoginReady: async () => true },
    },
    globals: {
      Page(definition) {
        pageDefinition = definition
      },
      getApp: () => app,
      wx: {
        redirectTo({ url }) {
          redirectUrl = url
        },
        navigateBack() {},
      },
    },
  })
  const instance = createPageInstance(pageDefinition)
  await instance.onLoad()
  instance.skipCurrent()

  assert.equal(redirectUrl, '/pages/illness/detail?id=illness-a')
  assert.equal(app.globalData.pendingIllnessReview.illnessId, 'illness-a')
})
