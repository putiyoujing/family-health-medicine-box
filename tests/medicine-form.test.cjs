const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')
const { formatMedicineStock, formatMedicineStockSummary, hasPackageConversion } = loadCjsModule(
  path.join(root, 'miniprogram/utils/medicine-stock.js'),
)
const formScript = path.join(root, 'miniprogram/pages/medicines/form.js')
const indexScript = path.join(root, 'miniprogram/pages/medicines/index.js')

test('medicine create and edit use a dedicated form page', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'))
  const listTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/medicines/index.wxml'), 'utf8')
  const formTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/medicines/form.wxml'), 'utf8')

  assert.ok(appConfig.pages.includes('pages/medicines/form'))
  assert.doesNotMatch(listTemplate, /showForm|data-field="name"|bindtap="save"/)
  assert.match(listTemplate, /bindtap="createMedicine"/)
  assert.match(formTemplate, /mode="date"/)
  assert.match(formTemplate, /bindtap="chooseMedicinePhoto"/)
  assert.match(formTemplate, /pendingAttachments\.length}}\/5/)
  assert.match(formTemplate, /bindtap="removeMedicinePhoto"/)
  assert.match(formTemplate, /class="save-bar"/)
  assert.match(formTemplate, /errors\.name/)
  assert.match(formTemplate, /药品规格（选填）/)
  assert.match(formTemplate, /包装换算（选填）/)
  assert.match(formTemplate, /库存按什么算/)
  assert.match(formTemplate, /mode="selector" range="\{\{unitOptions\}\}"/)
  assert.doesNotMatch(formTemplate, /<input[^>]+data-field="unit"/)
})

test('medicine package photos support up to five draft attachments and become medicine attachments on save', () => {
  const formSource = fs.readFileSync(formScript, 'utf8')
  const demo = loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))

  assert.match(formSource, /const MAX_MEDICINE_ATTACHMENTS = 5/)
  assert.match(formSource, /count: remaining/)
  assert.match(formSource, /for \(const attachment of this\.data\.pendingAttachments \|\| \[\]\)/)

  const draft = demo.saveAttachment({ relatedType: 'medicine_draft', fileId: 'cloud://package-a.jpg' })
  demo.saveAttachment({
    id: draft.id,
    relatedType: 'medicine',
    relatedId: 'medicine-a',
    fileId: 'cloud://package-a.jpg',
  })
  const attachments = demo.getHome().attachments.filter((item) => item._id === draft.id)
  assert.equal(attachments.length, 1)
  assert.equal(attachments[0].relatedType, 'medicine')
  demo.deleteAttachment(draft.id)
  assert.equal(demo.getHome().attachments.some((item) => item._id === draft.id), false)
})

test('new medicine uses household categories without silently preselecting one', async () => {
  const { pageDefinition } = loadFormModule()
  const page = createPageInstance(pageDefinition)

  await page.load()

  assert.equal(page.data.form.category, '')
  assert.equal(page.data.form.unit, '')
  assert.deepEqual(Array.from(page.data.categoryOptions), [
    '退热止痛',
    '感冒呼吸',
    '消化肠胃',
    '抗过敏',
    '外用皮肤',
    '五官口腔',
    '抗感染',
    '慢病长期',
    '急救备用',
    '其他',
  ])
})

test('medicine form loads an existing medicine and keeps its custom category selectable', async () => {
  const { pageDefinition } = loadFormModule({
    home: {
      family: { _id: 'family-a' },
      members: [{ _id: 'member-a', name: '小宝' }],
      medicines: [{
        _id: 'medicine-a',
        memberId: 'member-a',
        memberNameSnapshot: '小宝',
        name: '测试药品',
        category: '自定义分类',
        tags: ['常备'],
        specification: '100ml/瓶',
        totalQuantity: 2,
        remainingQuantity: 1,
        unit: '瓶',
        expireDate: '2027-12-31',
        location: '卧室药箱',
      }],
    },
  })
  const page = createPageInstance(pageDefinition)
  page.recordId = 'medicine-a'

  await page.load()

  assert.equal(page.data.form.name, '测试药品')
  assert.equal(page.data.form.memberId, 'member-a')
  assert.equal(page.data.form.expireDate, '2027-12-31')
  assert.equal(page.data.categoryOptions[page.data.categoryIndex], '自定义分类')
  assert.equal(page.data.unitOptions[page.data.unitIndex], '瓶')
})

test('medicine form reports field errors before saving invalid quantities', async () => {
  const savedPayloads = []
  const { pageDefinition, toasts } = loadFormModule({
    saveMedicine: async (payload) => {
      savedPayloads.push(payload)
      return { id: 'medicine-a' }
    },
  })
  const page = createPageInstance(pageDefinition)
  await page.load()
  page.setData({
    'form.name': '测试药品',
    'form.totalQuantity': '1',
    'form.remainingQuantity': '2',
  })

  await page.save()

  assert.equal(savedPayloads.length, 0)
  assert.equal(page.data.errors.category, '请选择药品分类')
  assert.equal(page.data.errors.remainingQuantity, '剩余量不能大于总量')
  assert.equal(page.data.errors.unit, '请选择库存按什么计算')
  assert.equal(toasts.at(-1), '请检查标红字段')
})

test('medicine form saves canonical values, clears unload warning and returns to the list', async () => {
  const savedPayloads = []
  const { navigation, pageDefinition, unloadAlerts } = loadFormModule({
    saveMedicine: async (payload) => {
      savedPayloads.push(payload)
      return { id: 'medicine-a' }
    },
  })
  const page = createPageInstance(pageDefinition)
  await page.load()
  page.onInput({ currentTarget: { dataset: { field: 'name' } }, detail: { value: '测试药品' } })
  assert.equal(unloadAlerts.enabled, 1)
  page.setData({
    'form.name': '  测试药品  ',
    'form.category': '退热止痛',
    'form.totalQuantity': '2',
    'form.remainingQuantity': '1',
    'form.unit': '盒',
    'form.tagsText': '常备、儿童用药',
    'form.expireDate': '2027-12-31',
  })

  await page.save()

  assert.equal(savedPayloads.length, 1)
  assert.equal(savedPayloads[0].name, '测试药品')
  assert.equal(savedPayloads[0].totalQuantity, 2)
  assert.equal(savedPayloads[0].remainingQuantity, 1)
  assert.deepEqual(Array.from(savedPayloads[0].tags), ['常备', '儿童用药'])
  assert.equal(unloadAlerts.disabled, 1)
  assert.equal(navigation.back, 1)
})

test('package conversion saves stock in the inner unit and formats a partly used package', async () => {
  const savedPayloads = []
  const { pageDefinition } = loadFormModule({
    saveMedicine: async (payload) => {
      savedPayloads.push(payload)
      return { id: 'medicine-package' }
    },
  })
  const page = createPageInstance(pageDefinition)
  await page.load()
  page.setData({
    'form.name': '测试感冒片',
    'form.category': '感冒呼吸',
  })
  page.updatePackageStock({ packageSize: '24', unit: '片', packageUnit: '盒', packageCount: '2' })

  await page.save()

  assert.equal(savedPayloads[0].packageSize, 24)
  assert.equal(savedPayloads[0].packageUnit, '盒')
  assert.equal(savedPayloads[0].totalQuantity, 48)
  assert.equal(savedPayloads[0].remainingQuantity, 48)
  const medicine = { ...savedPayloads[0], remainingQuantity: 47 }
  assert.equal(formatMedicineStock(medicine), '1盒+23片')
  assert.equal(formatMedicineStockSummary(medicine), '剩余 1盒+23片 / 共 2盒')
})

test('demo medication deducts package stock by its inner unit', () => {
  const demo = loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))
  const member = demo.getHome().members[0]
  const medicine = demo.saveMedicine({
    name: '包装扣减测试药', category: '感冒呼吸', memberId: member._id,
    packageSize: 24, packageUnit: '盒', unit: '片', totalQuantity: 48, remainingQuantity: 48,
  })

  demo.saveMedication({ memberId: member._id, medicineId: medicine.id, doseQuantity: 1, doseUnit: '片' })

  const saved = demo.getHome().medicines.find((item) => item._id === medicine.id)
  assert.equal(saved.remainingQuantity, 47)
  assert.equal(formatMedicineStock(saved), '1盒+23片')
})

test('visit prescription quick add keeps the draft and supports continuous entry', async () => {
  const draftKey = 'illness-visit-draft:illness-a'
  const storage = {
    [draftKey]: {
      eventForm: { eventType: 'visit', prescribedMedicineIds: [] },
      prescribedMedicines: [],
    },
  }
  const savedPayloads = []
  const { navigation, pageDefinition } = loadFormModule({
    storage,
    saveMedicine: async (payload) => {
      savedPayloads.push(payload)
      return { id: `medicine-${savedPayloads.length}` }
    },
  })
  const page = createPageInstance(pageDefinition)

  page.onLoad({
    memberId: 'member-a',
    visitDraftKey: draftKey,
  })
  await page.load()
  assert.equal(page.data.form.memberId, 'member-a')
  assert.equal(page.data.prescriptionMedicineCount, 0)
  assert.equal(page.data.form.source, '处方')
  assert.equal(page.data.form.tagsText, '处方药')
  assert.equal(page.data.form.category, '其他')
  assert.equal(page.data.form.unit, '盒')
  page.setData({
    'form.name': '医生新开药 A',
  })

  await page.saveAndContinue()
  assert.equal(navigation.back, 0)
  assert.deepEqual(Array.from(storage[draftKey].eventForm.prescribedMedicineIds), ['medicine-1'])
  assert.equal(storage[draftKey].prescribedMedicines[0].medicineNameSnapshot, '医生新开药 A')
  assert.equal(storage[draftKey].prescribedMedicines[0].quantitySnapshot, '1')
  assert.equal(page.data.prescriptionMedicineCount, 1)
  assert.equal(page.recordId, '')

  page.setData({ 'form.name': '医生新开药 B' })
  await page.save()

  assert.equal(navigation.back, 1)
  assert.deepEqual(Array.from(storage[draftKey].eventForm.prescribedMedicineIds), ['medicine-1', 'medicine-2'])
})

test('visit prescription quick add exposes its added count and can edit the previous medicine', async () => {
  const draftKey = 'illness-visit-draft:illness-a'
  const { pageDefinition } = loadFormModule({
    home: {
      family: { _id: 'family-a' },
      members: [{ _id: 'member-a', name: '小宝' }],
      medicines: [{
        _id: 'medicine-b',
        memberId: 'member-a',
        name: '上一种药',
        category: '其他',
        totalQuantity: 1,
        remainingQuantity: 1,
        unit: '盒',
      }],
    },
    storage: {
      [draftKey]: {
        eventForm: { eventType: 'visit', prescribedMedicineIds: ['medicine-b'] },
        prescribedMedicines: [{ medicineId: 'medicine-b' }],
      },
    },
  })
  const page = createPageInstance(pageDefinition)

  page.onLoad({ memberId: 'member-a', visitDraftKey: encodeURIComponent(draftKey) })
  await page.load()
  assert.equal(page.data.prescriptionMedicineCount, 1)

  await page.editPreviousPrescriptionMedicine()
  assert.equal(page.recordId, 'medicine-b')
  assert.equal(page.data.form.name, '上一种药')
})

test('blank quick prescription can return without creating another medicine', async () => {
  const draftKey = 'illness-visit-draft:illness-a'
  const savedPayloads = []
  const { navigation, pageDefinition } = loadFormModule({
    storage: {
      [draftKey]: {
        eventForm: { eventType: 'visit', prescribedMedicineIds: [] },
        prescribedMedicines: [],
      },
    },
    saveMedicine: async (payload) => {
      savedPayloads.push(payload)
      return { id: 'medicine-a' }
    },
  })
  const page = createPageInstance(pageDefinition)

  page.onLoad({ memberId: 'member-a', visitDraftKey: encodeURIComponent(draftKey) })
  await page.load()
  await page.saveAndReturn()

  assert.equal(navigation.back, 1)
  assert.equal(savedPayloads.length, 0)
})

test('medicine list routes create, edit, quick camera and alert focus into the form page', async () => {
  const listTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/medicines/index.wxml'), 'utf8')
  let pageDefinition
  const navigations = []
  loadCjsModule(indexScript, {
    stubs: {
      '../../services/api': {},
      '../../utils/format': { daysUntil: () => 90, memberName: () => '小宝' },
      '../../utils/operation-guards': {
        ensureFamilyWriteAccess: async (canEditRecords) => canEditRecords,
        ensureLoginReady: async () => true,
      },
    },
    globals: {
      Page(definition) {
        pageDefinition = definition
      },
      wx: {
        navigateTo({ url }) {
          navigations.push(url)
        },
        showToast() {},
      },
    },
  })
  const page = createPageInstance(pageDefinition, { canEditRecords: true })

  await page.createMedicine()
  await page.editMedicine({ currentTarget: { dataset: { id: 'medicine-a' } } })
  page.pendingAction = { camera: true }
  page.openPendingAction([])
  page.pendingAction = { focusId: 'medicine-a', focusReason: 'expire' }
  page.openPendingAction([{ _id: 'medicine-a' }])

  assert.deepEqual(navigations, [
    '/pages/medicines/form',
    '/pages/medicines/form?id=medicine-a',
    '/pages/medicines/form?camera=1',
    '/pages/medicines/form?id=medicine-a&reason=expire',
  ])
  assert.match(listTemplate, /catchtap="useMedicine"/)
  assert.match(listTemplate, /expire-expired/)
  assert.match(listTemplate, /expire-expiring/)
  assert.match(listTemplate, /适用：/)
  assert.match(listTemplate, /用法：/)
})

function loadFormModule(options = {}) {
  let pageDefinition
  const navigation = { back: 0 }
  const toasts = []
  const unloadAlerts = { disabled: 0, enabled: 0 }
  const home = options.home || {
    family: { _id: 'family-a' },
    members: [{ _id: 'member-a', name: '小宝' }],
    medicines: [],
  }
  const app = { globalData: { imageParsingEnabled: false, useDemoData: true } }
  const storage = options.storage || {}
  loadCjsModule(formScript, {
    stubs: {
      '../../services/api': {
        getHome: async () => home,
        saveMedicine: options.saveMedicine || (async () => ({ id: 'medicine-a' })),
        saveAttachment: async () => ({ id: 'attachment-a' }),
      },
      '../../utils/operation-guards': {
        ensureLoginReady: async () => true,
      },
      '../../utils/medicine-stock': {
        hasPackageConversion,
      },
    },
    globals: {
      Page(definition) {
        pageDefinition = definition
      },
      getApp: () => app,
      wx: {
        disableAlertBeforeUnload() {
          unloadAlerts.disabled += 1
        },
        enableAlertBeforeUnload() {
          unloadAlerts.enabled += 1
        },
        hideLoading() {},
        navigateBack() {
          navigation.back += 1
        },
        getStorageSync(key) {
          return storage[key]
        },
        setStorageSync(key, value) {
          storage[key] = value
        },
        setNavigationBarTitle() {},
        showLoading() {},
        showModal() {},
        showToast(payload) {
          toasts.push(payload.title)
        },
      },
    },
  })
  return { app, navigation, pageDefinition, toasts, unloadAlerts }
}
