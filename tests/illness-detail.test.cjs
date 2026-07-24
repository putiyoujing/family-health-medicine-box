const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')
const listScript = path.join(root, 'miniprogram/pages/illness/index.js')
const detailScript = path.join(root, 'miniprogram/pages/illness/detail.js')
const demo = loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))

test('illness list routes append through detail and keeps course actions inside detail', () => {
  const listTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/index.wxml'), 'utf8')
  const detailTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/detail.wxml'), 'utf8')
  const actionBlock = listTemplate.match(/<view class="card-actions"[^>]*>([\s\S]*?)<\/view>/)[1]

  assert.ok(actionBlock.indexOf('追加记录') < actionBlock.indexOf('修改'))
  assert.ok(actionBlock.indexOf('修改') < actionBlock.indexOf('再记一条相似的'))
  assert.doesNotMatch(actionBlock, /删除/)
  assert.doesNotMatch(listTemplate, /quick-append/)
  assert.match(detailTemplate, /bindtap="closeCourse"[^>]*>关闭病程<\/button>/)
  assert.match(detailTemplate, /bindtap="remove"[^>]*>删除病程<\/button>/)
})

test('illness list append opens the selected detail form', async () => {
  const { pageDefinition, navigations } = loadPage(listScript)
  const page = createPageInstance(pageDefinition, { canEditRecords: true })

  await page.appendRecord({ currentTarget: { dataset: { id: 'illness-a' } } })

  assert.deepEqual(navigations.urls, ['/pages/illness/detail?id=illness-a&action=add'])
})

test('illness list keeps open courses ahead of completed courses', async () => {
  const { pageDefinition } = loadPage(listScript, {
    home: {
      family: { _id: 'family-a', role: 'member' },
      members: [{ _id: 'member-a', name: '小宝' }],
      illnessRecords: [
        { _id: 'completed-new', memberId: 'member-a', startedAt: '2026-07-20 20:00', status: '已恢复' },
        { _id: 'open-old', memberId: 'member-a', startedAt: '2026-07-19 08:00', status: '观察中' },
        { _id: 'open-new', memberId: 'member-a', startedAt: '2026-07-20 08:00', status: '已就医' },
        { _id: 'completed-old', memberId: 'member-a', startedAt: '2026-07-18 08:00', endedAt: '2026-07-19 10:00', status: '观察中' },
      ],
    },
  })
  const page = createPageInstance(pageDefinition)

  await page.load()

  assert.deepEqual(Array.from(page.data.records, (item) => item._id), [
    'open-new',
    'open-old',
    'completed-new',
    'completed-old',
  ])
})

test('illness detail only offers symptom and visit as record types', () => {
  const detailTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/detail.wxml'), 'utf8')
  const detailStyles = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/detail.wxss'), 'utf8')
  const { pageDefinition } = loadPage(detailScript)

  assert.deepEqual(Array.from(pageDefinition.data.eventTypes, (item) => item.value), ['symptom', 'visit'])
  assert.doesNotMatch(detailTemplate, /<picker[^>]*eventTypes/)
  assert.match(detailTemplate, /data-type="\{\{item\.value\}\}"[^>]*bindtap="selectEventType"/)
  assert.match(detailTemplate, /<textarea[^>]+class="textarea symptom-textarea"[^>]+data-field="symptomsText"/)
  assert.doesNotMatch(detailTemplate, /<input[^>]+data-field="symptomsText"/)
  assert.match(detailStyles, /\.symptom-textarea\s*\{[^}]*min-height:\s*160rpx/s)
})

test('visit event reuses the structured care fields and supports an illness attachment', async () => {
  const detailTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/detail.wxml'), 'utf8')
  const savedEvents = []
  const savedAttachments = []
  const home = {
    family: { _id: 'family-a' },
    members: [{ _id: 'member-a', name: '小宝' }],
    illnessRecords: [{
      _id: 'illness-a',
      memberId: 'member-a',
      startedAt: '2026-07-20 08:00',
      symptoms: ['发烧'],
      status: '观察中',
    }],
    medicines: [],
    courseEvents: [],
    medicationLogs: [],
    attachments: [],
  }
  const { pageDefinition } = loadPage(detailScript, {
    home,
    saveCourseEvent: async (payload) => {
      savedEvents.push(payload)
      return { id: 'event-a', illnessStatus: '已就医' }
    },
    saveAttachment: async (payload) => {
      savedAttachments.push(payload)
      return { id: 'attachment-a' }
    },
  })
  const page = createPageInstance(pageDefinition)

  page.onLoad({ id: 'illness-a', action: 'add' })
  await page.load()
  page.selectEventType({ currentTarget: { dataset: { type: 'visit' } } })
  page.setData({
    'eventForm.hospitalName': '市儿童医院',
    'eventForm.doctorDiagnosis': '急性上呼吸道感染',
    'eventForm.examinationResult': '血常规未见明显异常',
    'eventForm.doctorAdvice': '补水并继续观察',
    pendingAttachments: [
      { fileID: 'cloud://visit-check-1.jpg', tempFilePath: 'temp-1.jpg' },
      { fileID: 'cloud://visit-check-2.jpg', tempFilePath: 'temp-2.jpg' },
    ],
  })
  await page.saveEvent()

  assert.match(detailTemplate, /data-field="hospitalName"/)
  assert.match(detailTemplate, /data-field="doctorDiagnosis"/)
  assert.match(detailTemplate, /data-field="examinationResult"/)
  assert.match(detailTemplate, /data-field="doctorAdvice"/)
  assert.match(detailTemplate, /bindtap="chooseAttachment"/)
  assert.match(detailTemplate, /bindtap="removeAttachment"/)
  assert.match(detailTemplate, /pendingAttachments\.length}}\/5/)
  assert.equal(savedEvents[0].hospitalName, '市儿童医院')
  assert.equal(savedEvents[0].doctorDiagnosis, '急性上呼吸道感染')
  assert.equal(savedEvents[0].examinationResult, '血常规未见明显异常')
  assert.equal(savedEvents[0].doctorAdvice, '补水并继续观察')
  assert.deepEqual(JSON.parse(JSON.stringify(savedAttachments)), [
    {
      relatedType: 'illness',
      relatedId: 'illness-a',
      fileType: 'image',
      fileId: 'cloud://visit-check-1.jpg',
      ocrText: '',
      aiSummary: '就诊检查或处方附件',
    },
    {
      relatedType: 'illness',
      relatedId: 'illness-a',
      fileType: 'image',
      fileId: 'cloud://visit-check-2.jpg',
      ocrText: '',
      aiSummary: '就诊检查或处方附件',
    },
  ])
})

test('visit attachment picker fills only the remaining slots and supports removal', async () => {
  const { pageDefinition, attachmentPickerCounts } = loadPage(detailScript, {
    mediaFiles: [
      { tempFilePath: 'temp-new-1.jpg' },
      { tempFilePath: 'temp-new-2.jpg' },
    ],
  })
  const page = createPageInstance(pageDefinition, {
    pendingAttachments: [
      { fileID: 'temp-old-1.jpg', tempFilePath: 'temp-old-1.jpg' },
      { fileID: 'temp-old-2.jpg', tempFilePath: 'temp-old-2.jpg' },
      { fileID: 'temp-old-3.jpg', tempFilePath: 'temp-old-3.jpg' },
      { fileID: 'temp-old-4.jpg', tempFilePath: 'temp-old-4.jpg' },
    ],
  })

  await page.chooseAttachment()

  assert.deepEqual(attachmentPickerCounts, [1])
  assert.equal(page.data.pendingAttachments.length, 5)
  page.removeAttachment({ currentTarget: { dataset: { index: 1 } } })
  assert.equal(page.data.pendingAttachments.length, 4)
  assert.equal(page.data.pendingAttachments.some((item) => item.fileID === 'temp-old-2.jpg'), false)
})

test('illness detail shows only its linked health todos with unfinished items first', async () => {
  const detailTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/detail.wxml'), 'utf8')
  const home = {
    family: { _id: 'family-a' },
    members: [{ _id: 'member-a', name: '小宝' }],
    illnessRecords: [
      { _id: 'illness-a', memberId: 'member-a', startedAt: '2026-07-20 08:00', symptoms: ['发烧'], status: '观察中' },
      { _id: 'illness-b', memberId: 'member-a', startedAt: '2026-07-10 08:00', symptoms: ['咳嗽'], status: '已恢复' },
    ],
    medicines: [],
    courseEvents: [],
    medicationLogs: [],
    attachments: [],
    reminders: [
      { _id: 'todo-later', illnessRecordId: 'illness-a', type: 'follow_up', title: '复诊', remindAt: '2026-07-23 09:00', status: 'pending' },
      { _id: 'todo-other', illnessRecordId: 'illness-b', type: 'other', title: '其他病程', remindAt: '2026-07-21 08:00', status: 'pending' },
      { _id: 'todo-completed', illnessRecordId: 'illness-a', type: 'medication', title: '已经完成', remindAt: '2026-07-20 09:00', status: 'completed' },
      { _id: 'todo-soon', illnessRecordId: 'illness-a', type: 'medication', title: '按时服药', remindAt: '2026-07-21 09:00', status: 'pending' },
    ],
  }
  const { pageDefinition } = loadPage(detailScript, { home })
  const page = createPageInstance(pageDefinition)

  page.onLoad({ id: 'illness-a' })
  await page.load()

  assert.match(detailTemplate, /本次病程待办/)
  assert.deepEqual(Array.from(page.data.healthTodos, (item) => item._id), [
    'todo-soon',
    'todo-later',
    'todo-completed',
  ])
})

test('visit event caches its draft and only links medicines added from that visit', async () => {
  const savedPayloads = []
  const home = {
    family: { _id: 'family-a' },
    members: [{ _id: 'member-a', name: '小宝' }, { _id: 'member-b', name: '大宝' }],
    illnessRecords: [{
      _id: 'illness-a',
      memberId: 'member-a',
      startedAt: '2026-07-20 08:00',
      symptoms: ['发烧'],
      status: '观察中',
    }],
    medicines: [
      { _id: 'medicine-a', memberId: 'member-a', name: '儿童退热药', unit: '瓶' },
      { _id: 'medicine-shared', memberId: '', name: '生理盐水', unit: '盒' },
      { _id: 'medicine-b', memberId: 'member-b', name: '他人药品', unit: '盒' },
    ],
    courseEvents: [],
    medicationLogs: [],
    attachments: [],
  }
  const { pageDefinition, navigations, storage } = loadPage(detailScript, {
    home,
    saveCourseEvent: async (payload) => {
      savedPayloads.push(payload)
      return { id: 'event-a' }
    },
  })
  const page = createPageInstance(pageDefinition)

  page.onLoad({ id: 'illness-a', action: 'add' })
  await page.load()
  page.selectEventType({ currentTarget: { dataset: { type: 'visit' } } })
  page.onInput({ currentTarget: { dataset: { field: 'hospitalName' } }, detail: { value: '儿童医院' } })
  page.goAddPrescriptionMedicine()

  const draftKey = 'illness-visit-draft:illness-a'
  assert.match(navigations.urls[0], /pages\/medicines\/form\?memberId=member-a&visitDraftKey=/)
  assert.equal(storage[draftKey].eventForm.hospitalName, '儿童医院')
  storage[draftKey] = {
    ...storage[draftKey],
    eventForm: { ...storage[draftKey].eventForm, prescribedMedicineIds: ['medicine-new'] },
    prescribedMedicines: [{
      medicineId: 'medicine-new',
      medicineNameSnapshot: '医生新开药',
      specificationSnapshot: '100ml/瓶',
      unitSnapshot: '瓶',
    }],
  }
  await page.load()
  await page.saveEvent()

  assert.equal(savedPayloads[0].eventType, 'visit')
  assert.deepEqual(Array.from(savedPayloads[0].prescribedMedicineIds), ['medicine-new'])
  assert.deepEqual(Array.from(page.data.prescribedMedicines), [])
  assert.equal(storage[draftKey], undefined)
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'miniprogram/pages/illness/detail.wxml'), 'utf8'), /prescriptionOptions|medicine-options/)
})

test('cloud visit event saves the timeline and visited status in one transaction', () => {
  const cloudSource = fs.readFileSync(path.join(root, 'cloudfunctions/healthApi/index.js'), 'utf8')
  const saveCourseEventSource = cloudSource.match(/async function saveCourseEvent[\s\S]*?\r?\n}\r?\n\r?\nasync function saveFeedback/)[0]

  assert.match(saveCourseEventSource, /db\.runTransaction/)
  assert.match(saveCourseEventSource, /data\.eventType === 'visit'/)
  assert.match(saveCourseEventSource, /illnessUpdate\.status = illnessStatus/)
})

test('illness detail shows the newest timeline record first', async () => {
  const home = {
    family: { _id: 'family-a' },
    members: [{ _id: 'member-a', name: '小宝' }],
    illnessRecords: [{
      _id: 'illness-a',
      memberId: 'member-a',
      startedAt: '2026-07-20 08:00',
      symptoms: ['fever'],
      status: 'active',
    }],
    medicines: [],
    courseEvents: [
      { _id: 'event-old', illnessRecordId: 'illness-a', eventType: 'symptom', recordedAt: '2026-07-20 09:00' },
      { _id: 'event-new', illnessRecordId: 'illness-a', eventType: 'visit', recordedAt: '2026-07-20 11:00' },
    ],
    medicationLogs: [{
      _id: 'log-middle', illnessRecordId: 'illness-a', takenAt: '2026-07-20 10:00', medicineNameSnapshot: 'medicine', doseQuantity: 1, doseUnit: 'unit' },
    ],
    attachments: [],
  }
  const { pageDefinition } = loadPage(detailScript, { home })
  const page = createPageInstance(pageDefinition)

  page.onLoad({ id: 'illness-a' })
  await page.load()

  assert.deepEqual(Array.from(page.data.timeline, (item) => item._id), ['event-new', 'log-log-middle', 'event-old'])
})

test('illness detail keeps labels for legacy event types already in the timeline', async () => {
  const home = {
    family: { _id: 'family-a' },
    members: [{ _id: 'member-a', name: '小宝' }],
    illnessRecords: [{
      _id: 'illness-a',
      memberId: 'member-a',
      startedAt: '2026-07-20 08:00',
      symptoms: ['发烧'],
      status: '观察中',
    }],
    medicines: [],
    courseEvents: [
      { _id: 'temperature-a', illnessRecordId: 'illness-a', eventType: 'temperature', recordedAt: '2026-07-20 09:00' },
      { _id: 'note-a', illnessRecordId: 'illness-a', eventType: 'note', recordedAt: '2026-07-20 10:00' },
      { _id: 'exam-a', illnessRecordId: 'illness-a', eventType: 'exam', recordedAt: '2026-07-20 11:00' },
    ],
    medicationLogs: [],
    attachments: [],
  }
  const { pageDefinition } = loadPage(detailScript, { home })
  const page = createPageInstance(pageDefinition)

  page.onLoad({ id: 'illness-a' })
  await page.load()

  assert.equal(page.data.timeline.find((item) => item._id === 'temperature-a').typeLabel, '体温记录')
  assert.equal(page.data.timeline.find((item) => item._id === 'note-a').typeLabel, '备注')
  assert.equal(page.data.timeline.find((item) => item._id === 'exam-a').typeLabel, '检查')
})

test('deleting an illness is confirmed from detail and returns to the list', async () => {
  const deletedIds = []
  const { modalRequests, pageDefinition, navigations } = loadPage(detailScript, {
    deleteIllness: async (id) => deletedIds.push(id),
  })
  const page = createPageInstance(pageDefinition, {
    id: 'illness-a',
    record: { _id: 'illness-a' },
  })

  await page.remove()

  assert.deepEqual(deletedIds, ['illness-a'])
  assert.deepEqual(modalRequests, [{
    title: '删除病程',
    content: '删除后将无法查看这次病程及其跟踪记录，且无法恢复。确认删除吗？',
  }])
  assert.equal(navigations.back, 1)
})

test('closing an illness saves the recovery review to its timeline', async () => {
  const completedPayloads = []
  const detailTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/detail.wxml'), 'utf8')
  const { modalRequests, pageDefinition } = loadPage(detailScript, {
    completeIllness: async (payload) => {
      completedPayloads.push(payload)
      return { id: payload.id, status: '已关闭' }
    },
  })
  const page = createPageInstance(pageDefinition, {
    id: 'illness-a',
    record: { _id: 'illness-a', status: '观察中' },
  })

  page.closeCourse()
  page.onCompletionReviewInput({ detail: { value: '体温已恢复正常，精神和食欲都好了。' } })
  await page.submitCloseCourse()

  assert.match(detailTemplate, /bindtap="closeCourse"[^>]*>关闭病程<\/button>/)
  assert.match(detailTemplate, /data-field="completionReviewNote"|bindinput="onCompletionReviewInput"/)
  assert.match(detailTemplate, /恢复总结（建议填写）/)
  assert.match(detailTemplate, /恢复复盘/)
  assert.equal(completedPayloads.length, 1)
  assert.equal(completedPayloads[0].id, 'illness-a')
  assert.match(completedPayloads[0].endedAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  assert.equal(completedPayloads[0].reviewNote, '体温已恢复正常，精神和食欲都好了。')
  assert.equal(page.data.record.status, '已关闭')
  assert.equal(page.data.showCompletionForm, false)
  assert.deepEqual(modalRequests, [])
})

test('closing an illness still allows an empty recovery review', async () => {
  const completedPayloads = []
  const { pageDefinition } = loadPage(detailScript, {
    completeIllness: async (payload) => {
      completedPayloads.push(payload)
      return { id: payload.id, status: '已关闭' }
    },
  })
  const page = createPageInstance(pageDefinition, {
    id: 'illness-a',
    record: { _id: 'illness-a', status: '观察中' },
  })

  page.closeCourse()
  await page.submitCloseCourse()

  assert.equal(completedPayloads.length, 1)
  assert.equal(completedPayloads[0].reviewNote, '')
})

test('demo completion persists the recovery review in the illness timeline', () => {
  const illness = demo.saveIllness({
    memberId: 'member-completion-test',
    startedAt: '2026-07-20 08:00',
    symptoms: ['发烧'],
    status: '观察中',
  })

  demo.completeIllness({
    id: illness.id,
    endedAt: '2026-07-22 09:30',
    reviewNote: '退烧后精神和食欲恢复正常。',
  })

  const home = demo.getHome()
  const stored = home.illnessRecords.find((item) => item._id === illness.id)
  const review = home.courseEvents.find((item) => item.illnessRecordId === illness.id && item.source === 'illness_completed')
  assert.equal(stored.status, '已关闭')
  assert.equal(stored.endedAt, '2026-07-22 09:30')
  assert.equal(review.note, '退烧后精神和食欲恢复正常。')
  assert.equal(review.recordedAt, '2026-07-22 09:30')
})

function loadPage(script, options = {}) {
  let pageDefinition
  const navigations = { back: 0, urls: [] }
  const attachmentPickerCounts = []
  const modalRequests = []
  const storage = options.storage || {}
  const home = options.home || {
    family: { _id: 'family-a' },
    members: [],
    illnessRecords: [],
    medicines: [],
    courseEvents: [],
    medicationLogs: [],
    attachments: [],
  }
  loadCjsModule(script, {
    stubs: {
      '../../services/api': {
        getHome: async () => home,
        saveCourseEvent: options.saveCourseEvent || (async () => ({ id: 'event-a' })),
        saveAttachment: options.saveAttachment || (async () => ({ id: 'attachment-a' })),
        completeIllness: options.completeIllness || (async () => ({ id: 'illness-a', status: '已恢复' })),
        deleteIllness: options.deleteIllness || (async () => ({ id: 'illness-a' })),
      },
      '../../utils/operation-guards': {
        canEditFamilyRecords: (family) => family && family.role !== 'viewer',
        ensureFamilyWriteAccess: async (canEditRecords) => canEditRecords,
        ensureHasMembers: () => true,
        ensureLoginReady: async () => true,
        ensureMedicationReady: () => true,
      },
    },
    globals: {
      Page(definition) {
        pageDefinition = definition
      },
      getApp: () => ({ globalData: { useDemoData: true } }),
      wx: {
        async showActionSheet() {
          return { tapIndex: options.attachmentSourceIndex || 0 }
        },
        async chooseMedia({ count }) {
          attachmentPickerCounts.push(count)
          return { tempFiles: (options.mediaFiles || []).slice(0, count) }
        },
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
        showLoading() {},
        showModal({ content, success, title }) {
          modalRequests.push({ title, content })
          if (success) {
            success({ confirm: true, content: options.modalContent || '' })
          }
        },
        showToast() {},
      },
    },
  })
  return { attachmentPickerCounts, modalRequests, navigations, pageDefinition, storage }
}
