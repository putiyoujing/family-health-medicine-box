const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('medication create and edit use a dedicated picker-based form page', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'))
  const listTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/medication/index.wxml'), 'utf8')
  const formTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/medication/form.wxml'), 'utf8')

  assert.ok(appConfig.pages.includes('pages/medication/form'))
  assert.ok(
    listTemplate.indexOf('class="section filter-section"') < listTemplate.indexOf('bindtap="createMedication"'),
    'record medication button should follow the filter section',
  )
  assert.doesNotMatch(listTemplate, /showForm|data-field="doseQuantity"|bindtap="save"/)
  assert.match(listTemplate, /wx:if="\{\{!loggedIn \|\| canEdit\}\}"[^>]+bindtap="createMedication"/)
  assert.match(listTemplate, /catchtap="editMedication"/)
  assert.match(listTemplate, /catchtap="voidMedication"/)
  assert.match(formTemplate, /<picker\s+mode="date"[^>]+bindchange="onDateChange"/)
  assert.match(formTemplate, /<picker\s+mode="time"[^>]+bindchange="onTimeChange"/)
  assert.match(formTemplate, /errors\.doseQuantity/)
  assert.match(formTemplate, /class="save-bar"/)
  assert.doesNotMatch(formTemplate, /data-field="doseUnit"/)
  assert.doesNotMatch(formTemplate, /frequencyText|wasPlanned/)
  assert.match(formTemplate, /bindtap="goAddMedicine"/)
  assert.match(formTemplate, /wx:elif="\{\{loadError\}\}"/)
  assert.match(formTemplate, /placeholder="搜索药品名称或规格"/)
  assert.match(formTemplate, /bindtap="toggleMedicine"/)
  assert.match(formTemplate, /wx:for="\{\{medicationEntries\}\}"/)
})

test('editing and voiding a demo medication record keeps stock and its illness event consistent', () => {
  const demo = loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))
  const member = demo.getHome().members[0]
  const medicine = demo.saveMedicine({
    memberId: member._id,
    name: '测试口服液',
    totalQuantity: 100,
    remainingQuantity: 100,
    unit: 'ml',
  })
  const illness = demo.saveIllness({
    memberId: member._id,
    startedAt: '2026-07-20 09:00',
    symptoms: ['咳嗽'],
  })

  const medication = demo.saveMedication({
    memberId: member._id,
    medicineId: medicine.id,
    illnessRecordId: illness.id,
    doseQuantity: 5,
    doseUnit: 'ml',
    takenAt: '2026-07-20 10:00',
  })
  assert.equal(demo.getHome().medicines.find((item) => item._id === medicine.id).remainingQuantity, 95)

  demo.saveMedication({
    _id: medication.id,
    memberId: member._id,
    medicineId: medicine.id,
    illnessRecordId: illness.id,
    doseQuantity: 8,
    doseUnit: 'ml',
    takenAt: '2026-07-20 10:05',
  })

  let home = demo.getHome()
  assert.equal(home.medicationLogs.filter((item) => item._id === medication.id).length, 1)
  assert.equal(home.medicines.find((item) => item._id === medicine.id).remainingQuantity, 92)
  assert.equal(home.courseEvents.find((item) => item.medicationLogId === medication.id).doseQuantity, 8)

  demo.deleteMedication(medication.id)
  home = demo.getHome()
  assert.equal(home.medicationLogs.some((item) => item._id === medication.id), false)
  assert.equal(home.medicines.find((item) => item._id === medicine.id).remainingQuantity, 100)
  assert.equal(home.courseEvents.some((item) => item.medicationLogId === medication.id), false)
  const voided = demo.listMedicationHistory().logs.find((item) => item._id === medication.id)
  assert.ok(voided.deletedAt)
  assert.equal(voided.inventoryRestored, true)
})

test('multiple medicines can be searched, selected and validated with individual doses', () => {
  const helpers = loadCjsModule(path.join(root, 'miniprogram/pages/medication/form.js'), {
    globals: { Page() {}, wx: {} },
  })
  const medicines = [
    { _id: 'medicine-a', name: '退烧药', remainingQuantity: 10, unit: 'ml' },
    { _id: 'medicine-b', name: '止咳药', remainingQuantity: 3, unit: '片' },
  ]
  const filtered = helpers.buildFilteredMedicineOptions(medicines, '止咳', [{ medicineId: 'medicine-b' }])
  assert.deepEqual(filtered.map((item) => [item._id, item.isSelected]), [['medicine-b', true]])
  const entries = [
    { medicineId: 'medicine-a', doseQuantity: '2', availableQuantity: 10, unit: 'ml' },
    { medicineId: 'medicine-b', doseQuantity: '4', availableQuantity: 3, unit: '片' },
  ]
  const errors = helpers.validateForm({
    isEditing: false,
    form: { memberId: 'member-a' },
    medicationEntries: entries,
    recordDate: '2026-07-20',
    recordTime: '08:00',
  })
  assert.equal(errors.doseQuantity, '请检查每种药品的剂量')
  assert.match(entries[1].error, /库存不足/)
})

test('saving medication flags the list to force-refresh its latest history', async () => {
  let pageDefinition
  const app = { globalData: { medicationListNeedsRefresh: true } }
  const getHomeCalls = []
  loadCjsModule(path.join(root, 'miniprogram/pages/medication/index.js'), {
    stubs: {
      '../../services/api': {
        getHome: async (options) => {
          getHomeCalls.push(options)
          return { family: { role: 'owner' }, members: [], medicines: [], illnessRecords: [] }
        },
        isHomeCacheFresh: () => true,
        listMedicationHistory: async () => ({ logs: [] }),
      },
      '../../utils/format': { formatDateTime: () => '', memberName: () => '', medicineName: () => '' },
      '../../utils/operation-guards': { ensureLoginReady: async () => true, ensureMedicationReady: () => true },
    },
    globals: {
      Page(definition) { pageDefinition = definition },
      getApp: () => app,
      wx: { showToast() {} },
    },
  })
  const page = createPageInstance(pageDefinition)
  page.homeLoaded = true
  page.onShow()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(JSON.stringify(getHomeCalls), JSON.stringify([{ force: true }]))
  assert.equal(app.globalData.medicationListNeedsRefresh, false)
  const formSource = fs.readFileSync(path.join(root, 'miniprogram/pages/medication/form.js'), 'utf8')
  assert.match(formSource, /medicationListNeedsRefresh = true/)
})

test('medication form only offers household or selected-member medicines and rejects future times', () => {
  const helpers = loadCjsModule(path.join(root, 'miniprogram/pages/medication/form.js'), {
    globals: {
      Page() {},
      wx: {},
    },
  })
  const pickerState = helpers.buildPickerState(
    [{ _id: 'member-a', name: '孩子' }, { _id: 'member-b', name: '爸爸' }],
    [
      { _id: 'medicine-common', name: '全家药', memberId: '', remainingQuantity: 10, unit: '片' },
      { _id: 'medicine-a', name: '儿童药', memberId: 'member-a', remainingQuantity: 10, unit: 'ml' },
      { _id: 'medicine-b', name: '成人药', memberId: 'member-b', remainingQuantity: 10, unit: '片' },
    ],
    [],
    { memberId: 'member-a', medicineId: 'medicine-a', illnessRecordId: '' },
    null,
  )
  assert.deepEqual(Array.from(pickerState.medicineOptions, (item) => item._id), [
    'medicine-common',
    'medicine-a',
  ])

  const errors = helpers.validateForm({
    form: { memberId: 'member-a', medicineId: 'medicine-a', doseQuantity: '1' },
    selectedMedicineUnit: 'ml',
    availableQuantity: 10,
    recordDate: '2099-01-01',
    recordTime: '08:00',
  })
  assert.equal(errors.takenAt, '实际服用时间不能晚于当前时间')
})

test('cloud medication actions use dedicated transactional update and void handlers', () => {
  const source = fs.readFileSync(path.join(root, 'cloudfunctions/healthApi/index.js'), 'utf8')
  assert.match(source, /case 'deleteMedication':[\s\S]{0,120}deleteMedication\(openid, familyId, payload\.id\)/)
  assert.match(source, /async function updateMedication[\s\S]+db\.runTransaction/)
  assert.match(source, /async function deleteMedication[\s\S]+inventoryRestored[\s\S]+course_events/)
  assert.match(source, /function normalizeMedicationUnit/)
  assert.match(source, /case 'listMedicationHistory':[\s\S]{0,120}listMedicationHistory\(openid, familyId\)/)
})

test('guest medication action opens login and refreshes permissions before navigating', async () => {
  let pageDefinition
  const loginOptions = []
  const navigationUrls = []
  loadCjsModule(path.join(root, 'miniprogram/pages/medication/index.js'), {
    stubs: {
      '../../services/api': {
        getHome: async () => ({
          family: { _id: 'family-a', role: 'owner' },
          members: [{ _id: 'member-a', name: '本人' }],
          medicines: [{ _id: 'medicine-a', name: '测试药品' }],
          illnessRecords: [],
        }),
        isHomeCacheFresh: () => false,
        listMedicationHistory: async () => ({ logs: [] }),
      },
      '../../utils/format': { formatDateTime: () => '', memberName: () => '', medicineName: () => '' },
      '../../utils/operation-guards': {
        ensureLoginReady: async (options) => {
          loginOptions.push(options)
          return true
        },
        ensureMedicationReady: () => true,
      },
    },
    globals: {
      Page(definition) { pageDefinition = definition },
      getApp: () => ({ globalData: {} }),
      wx: {
        navigateTo({ url }) {
          navigationUrls.push(url)
        },
        showToast() {},
      },
    },
  })
  const page = createPageInstance(pageDefinition)

  await page.createMedication()

  assert.equal(loginOptions[0], undefined)
  assert.equal(loginOptions[1].silent, true)
  assert.equal(page.data.loggedIn, true)
  assert.equal(page.data.canEdit, true)
  assert.deepEqual(navigationUrls, ['/pages/medication/form'])
})
