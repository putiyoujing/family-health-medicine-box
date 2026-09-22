const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

test('confirmed medicine image result is handed back to the medicine form', async () => {
  let pageDefinition
  let navigatedBack = 0
  const app = {
    globalData: {
      imageParsingEnabled: true,
      pendingParseAttachment: {
        fileId: 'cloud://test.png',
        attachmentIds: ['attachment-a'],
        imageKind: 'medicine_box',
        relatedType: 'medicine',
      },
    },
  }
  loadCjsModule(path.join(__dirname, '..', 'miniprogram/pages/attachment/parse.js'), {
    stubs: {
      '../../services/api': {
        async confirmAiParseResult(payload) {
          return { output: payload.output }
        },
      },
      '../../utils/operation-guards': {
        ensureLoginReady: async () => true,
      },
    },
    globals: {
      Page(definition) { pageDefinition = definition },
      getApp: () => app,
      setTimeout(callback) { callback() },
      wx: {
        hideLoading() {},
        navigateBack() { navigatedBack += 1 },
        showLoading() {},
        showToast() {},
      },
    },
  })
  const page = createPageInstance(pageDefinition)
  page.onLoad({ source: 'medicine' })
  page.setData({
    task: { _id: 'task-a', status: 'success' },
    fields: [
      { key: 'name', value: '测试药品' },
      { key: 'specification', value: '10mg x 12片' },
    ],
  })

  await page.confirmResult()

  assert.equal(app.globalData.pendingMedicineParseResult.imageKind, 'medicine_box')
  assert.equal(app.globalData.pendingMedicineParseResult.output.name, '测试药品')
  assert.equal(app.globalData.pendingMedicineParseResult.output.specification, '10mg x 12片')
  assert.equal(navigatedBack, 1)
})
