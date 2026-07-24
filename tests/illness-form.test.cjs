const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')
const formScript = path.join(root, 'miniprogram/pages/illness/form.js')

test('illness form uses direct active-status choices and only shows visit fields after care', () => {
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json'), 'utf8'))
  const listTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/index.wxml'), 'utf8')
  const formTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/form.wxml'), 'utf8')
  const formStyles = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/form.wxss'), 'utf8')

  assert.ok(appConfig.pages.includes('pages/illness/form'))
  assert.doesNotMatch(listTemplate, /wx:if="\{\{showForm\}\}"/)
  assert.match(listTemplate, /bindtap="createRecord"/)
  assert.match(formTemplate, /mode="date"/)
  assert.match(formTemplate, /mode="time"/)
  assert.match(formTemplate, /class="unit-suffix">℃</)
  assert.match(formTemplate, /<view class="vital-grid">/)
  assert.doesNotMatch(formTemplate, /class="grid-2 vital-grid"/)
  assert.match(formStyles, /\.vital-grid\s*\{[^}]*grid-template-columns:\s*100%/s)
  assert.match(formStyles, /\.status-options\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/s)
  assert.match(formStyles, /\.status-options\s*\{[^}]*max-width:\s*100%/s)
  assert.match(formStyles, /\.status-option\s*\{[^}]*min-width:\s*0/s)
  assert.doesNotMatch(formTemplate, /mode-section|modeOptions|补充就诊信息/)
  assert.doesNotMatch(formTemplate, /<picker[^>]+range="\{\{statusOptions\}\}"/)
  assert.match(formTemplate, /data-status="\{\{item\}\}"/)
  assert.match(formTemplate, /wx:if="\{\{showVisitFields\}\}"/)
  assert.match(formTemplate, /data-field="hospitalName"/)
  assert.match(formTemplate, /<textarea[^>]+data-field="doctorDiagnosis"/)
  assert.match(formTemplate, /data-field="examinationResult"/)
  assert.match(formTemplate, /data-field="doctorAdvice"/)
  assert.match(formTemplate, /pendingAttachments\.length}}\/5/)
  assert.match(formTemplate, /bindtap="removeAttachment"/)
  assert.match(formTemplate, /bindtap="goAddPrescriptionMedicine"/)
  assert.match(formTemplate, /药品名称：\{\{item\.medicineNameSnapshot\}\}/)
  assert.match(formTemplate, /规格：\{\{item\.specificationSnapshot\}\}/)
  assert.match(formTemplate, /数量：\{\{item\.quantitySnapshot\}\}/)
  assert.doesNotMatch(formTemplate, /未填写/)
  assert.doesNotMatch(formTemplate, /prescriptionOptions|medicine-options/)
  assert.doesNotMatch(formTemplate, /<input[^>]+data-field="doctorDiagnosis"/)
  assert.doesNotMatch(formTemplate, />已恢复</)
})

test('selecting 已就医 directly reveals structured visit fields', () => {
  const { pageDefinition } = loadFormModule()
  const page = createPageInstance(pageDefinition)

  page.onStatusChange({ currentTarget: { dataset: { status: '已就医' } } })

  assert.equal(page.data.form.status, '已就医')
  assert.equal(page.data.showVisitFields, true)

  page.onStatusChange({ currentTarget: { dataset: { status: '观察中' } } })
  assert.equal(page.data.form.status, '观察中')
  assert.equal(page.data.showVisitFields, false)
})

test('member default selection prefers an explicit member, then a child, then the only member', () => {
  const helpers = loadFormModule().helpers
  const owner = { _id: 'owner', name: '我', relation: '本人', birthday: '1990-01-01' }
  const olderChild = { _id: 'child-a', name: '大宝', relation: '儿子', birthday: '2015-03-02' }
  const youngerChild = { _id: 'child-b', name: '小宝', relation: '女儿', birthday: '2020-08-09' }

  assert.equal(helpers.resolveDefaultMemberId([owner], []), 'owner')
  assert.equal(helpers.resolveDefaultMemberId([owner, olderChild], []), 'child-a')
  assert.equal(
    helpers.resolveDefaultMemberId(
      [owner, olderChild, youngerChild],
      [
        { _id: 'record-adult', memberId: 'owner' },
        { _id: 'record-child', memberId: 'child-b' },
      ],
    ),
    'child-b',
  )
  assert.equal(
    helpers.resolveDefaultMemberId([owner, { _id: 'child-c', name: '二宝', relation: '儿女' }], []),
    'child-c',
  )
  assert.equal(
    helpers.resolveDefaultMemberId([owner, olderChild], [], 'owner'),
    'owner',
  )
})

test('member selection explains the default and preserved choices', () => {
  const helpers = loadFormModule().helpers
  const child = { _id: 'child', name: '小宝', relation: '女儿' }

  assert.match(helpers.buildMemberSelectionHint({ selectedMember: child }), /默认优先选择子女/)
  assert.match(
    helpers.buildMemberSelectionHint({ visitDraft: { kind: 'illness_form' }, selectedMember: child }),
    /保留未完成草稿/,
  )
  assert.match(
    helpers.buildMemberSelectionHint({ record: { _id: 'record-1' }, selectedMember: child }),
    /保留原来的家庭成员/,
  )
})

test('illness form displays the selected member and saves canonical date-time', async () => {
  const savedPayloads = []
  const savedAttachments = []
  const { pageDefinition, toasts, navigations } = loadFormModule({
    home: {
      currentFamilyId: 'family-a',
      family: { _id: 'family-a' },
      members: [
        { _id: 'owner', name: '我', relation: '本人', birthday: '1990-01-01' },
        { _id: 'child', name: '小宝', relation: '女儿', birthday: '2020-08-09' },
      ],
      illnessRecords: [],
    },
    saveIllness: async (payload) => {
      savedPayloads.push(payload)
      return { id: 'illness-1' }
    },
    saveAttachment: async (payload) => {
      savedAttachments.push(payload)
      return { id: `attachment-${savedAttachments.length}` }
    },
  })
  const page = createPageInstance(pageDefinition)

  await page.load()
  assert.equal(page.data.form.memberId, 'child')
  assert.equal(page.data.selectedMemberText, '小宝（女儿）')

  page.onMemberChange({ detail: { value: 0 } })
  assert.equal(page.data.form.memberId, 'owner')
  assert.equal(page.data.selectedMemberText, '我（本人）')

  page.onStatusChange({ currentTarget: { dataset: { status: '已就医' } } })

  page.setData({
    recordDate: '2026-07-20',
    recordTime: '18:32',
    'form.symptomsText': '发烧、咳嗽',
    'form.temperatureMax': '38.5',
    'form.doctorDiagnosis': '急性上呼吸道感染\n继续观察',
    pendingAttachments: [
      { fileID: 'cloud://check-1.jpg', tempFilePath: 'temp-1.jpg' },
      { fileID: 'cloud://check-2.jpg', tempFilePath: 'temp-2.jpg' },
    ],
  })
  await page.save()

  assert.equal(savedPayloads.length, 1)
  assert.equal(savedPayloads[0].startedAt, '2026-07-20 18:32')
  assert.equal(savedPayloads[0].temperatureMax, 38.5)
  assert.equal(savedPayloads[0].doctorDiagnosis, '急性上呼吸道感染\n继续观察')
  assert.equal(savedPayloads[0].initialEventType, 'visit')
  assert.match(savedPayloads[0].initialEventNote, /诊断：急性上呼吸道感染/)
  assert.deepEqual(Array.from(savedPayloads[0].symptoms), ['发烧', '咳嗽'])
  assert.deepEqual(Array.from(savedAttachments, (item) => item.fileId), [
    'cloud://check-1.jpg',
    'cloud://check-2.jpg',
  ])
  assert.equal(navigations.back, 1)
  assert.deepEqual(toasts, ['已保存'])
})

test('new visited illness restores its draft and submits medicines added from that visit', async () => {
  const savedPayloads = []
  const { navigations, pageDefinition, storage } = loadFormModule({
    saveIllness: async (payload) => {
      savedPayloads.push(payload)
      return { id: 'illness-1' }
    },
  })
  const page = createPageInstance(pageDefinition)

  await page.load()
  page.onStatusChange({ currentTarget: { dataset: { status: '已就医' } } })
  page.setData({
    recordDate: '2026-07-21',
    recordTime: '10:30',
    'form.symptomsText': '咳嗽',
    'form.hospitalName': '儿童医院',
  })
  page.goAddPrescriptionMedicine()

  const draftKey = Object.keys(storage)[0]
  assert.match(navigations.urls[0], /pages\/medicines\/form\?memberId=owner&visitDraftKey=/)
  assert.equal(storage[draftKey].kind, 'illness_form')
  storage[draftKey] = {
    ...storage[draftKey],
    form: { ...storage[draftKey].form, prescribedMedicineIds: ['medicine-new'] },
    prescribedMedicines: [{ medicineId: 'medicine-new', medicineNameSnapshot: '医生新开药' }],
  }
  await page.onShow()
  assert.equal(page.data.form.hospitalName, '儿童医院')
  assert.deepEqual(Array.from(page.data.form.prescribedMedicineIds), ['medicine-new'])
  assert.equal(page.data.prescribedMedicines[0].medicineNameSnapshot, '医生新开药')

  await page.save()
  assert.deepEqual(Array.from(savedPayloads[0].prescribedMedicineIds), ['medicine-new'])
  assert.equal(storage[draftKey], undefined)
})

test('initial visit event snapshots newly added medicines in demo and cloud paths', () => {
  const demo = loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))
  const member = demo.getHome().members[0]
  const medicine = demo.saveMedicine({
    memberId: member._id,
    name: '医生新开药',
    category: '其他',
    totalQuantity: 1,
    remainingQuantity: 1,
    unit: '盒',
  })
  const illness = demo.saveIllness({
    memberId: member._id,
    startedAt: '2026-07-21 10:30',
    symptoms: ['咳嗽'],
    status: '已就医',
    initialEventType: 'visit',
    prescribedMedicineIds: [medicine.id],
  })
  const event = demo.getHome().courseEvents.find((item) => item.illnessRecordId === illness.id)
  const cloudSource = fs.readFileSync(path.join(root, 'cloudfunctions/healthApi/index.js'), 'utf8')

  assert.deepEqual(Array.from(event.prescribedMedicineIds), [medicine.id])
  assert.equal(event.prescribedMedicines[0].medicineNameSnapshot, '医生新开药')
  assert.match(cloudSource.match(/async function saveIllness[\s\S]*?\r?\n}\r?\n\r?\nasync function syncInitialCourseEvent/)[0], /prescribedMedicineIds: payload\.prescribedMedicineIds \|\| \[\]/)
})

test('legacy illness dates are normalized for the date and time pickers', () => {
  const helpers = loadFormModule().helpers
  assert.deepEqual(
    { ...helpers.splitDateTime('2026-7-2 8:05') },
    { date: '2026-07-02', time: '08:05' },
  )
  assert.deepEqual(
    { ...helpers.splitDateTime('2026-7-2') },
    { date: '2026-07-02', time: '00:00' },
  )
})

function loadFormModule(options = {}) {
  let pageDefinition
  const toasts = []
  const navigations = { back: 0, urls: [] }
  const storage = options.storage || {}
  const home = options.home || {
    currentFamilyId: 'family-a',
    family: { _id: 'family-a' },
    members: [{ _id: 'owner', name: '我', relation: '本人' }],
    illnessRecords: [],
  }
  const helpers = loadCjsModule(formScript, {
    stubs: {
      '../../services/api': {
        getHome: async () => home,
        saveIllness: options.saveIllness || (async () => ({ id: 'illness-1' })),
        saveAttachment: options.saveAttachment || (async () => ({ id: 'attachment-1' })),
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
      getApp: () => ({ globalData: { useDemoData: true } }),
      wx: {
        cloud: { uploadFile: async () => ({ fileID: 'cloud-file' }) },
        hideLoading() {},
        navigateBack() {
          navigations.back += 1
        },
        navigateTo({ url }) {
          navigations.urls.push(url)
        },
        getStorageSync(key) {
          return storage[key]
        },
        setStorageSync(key, value) {
          storage[key] = value
        },
        removeStorageSync(key) {
          delete storage[key]
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
  return { helpers, navigations, pageDefinition, storage, toasts }
}
