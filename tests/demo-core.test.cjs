const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('demo core journey persists linked records, deducts stock, and builds an illness report', async () => {
  const app = {
    globalData: {
      currentFamilyId: 'demo-family-001',
      useDemoData: true,
    },
    async ensureLogin() {
      return { openid: 'demo-user' }
    },
  }
  let cloudCalls = 0
  const api = loadCjsModule(path.join(root, 'miniprogram/services/api.js'), {
    globals: {
      getApp: () => app,
      wx: {
        cloud: {
          async callFunction() {
            cloudCalls += 1
            throw new Error('demo mode must not call cloud functions')
          },
        },
      },
    },
  })

  const member = await api.saveMember({
    name: 'Test Member',
    relation: 'child',
    allergyHistory: 'penicillin',
  })
  const medicine = await api.saveMedicine({
    memberId: member.id,
    name: 'Test Medicine',
    totalQuantity: 10,
    remainingQuantity: 10,
    unit: 'tablet',
  })
  const illness = await api.saveIllness({
    memberId: member.id,
    startedAt: '2026-07-12 08:00',
    symptoms: ['fever'],
    symptomDescription: 'fever and fatigue',
    temperatureMax: '38.2',
    status: 'observing',
  })
  await api.saveCourseEvent({
    illnessRecordId: illness.id,
    memberId: member.id,
    eventType: 'temperature',
    recordedAt: '2026-07-12 09:00',
    temperature: '37.8',
    note: 'temperature falling',
  })
  await api.saveCourseEvent({
    illnessRecordId: illness.id,
    memberId: member.id,
    eventType: 'visit',
    recordedAt: '2026-07-12 09:05',
    prescribedMedicineIds: [medicine.id],
    hospitalName: 'Test Hospital',
    doctorDiagnosis: 'Upper respiratory infection',
    examinationResult: 'No obvious abnormality',
    doctorAdvice: 'Hydrate and observe',
    note: 'prescribed after visit',
  })
  const medication = await api.saveMedication({
    memberId: member.id,
    illnessRecordId: illness.id,
    medicineId: medicine.id,
    doseQuantity: 3,
    doseUnit: 'tablet',
    takenAt: '2026-07-12 09:10',
    reaction: 'no reaction',
  })

  const home = await api.getHome()
  const storedMedicine = home.medicines.find((item) => item._id === medicine.id)
  const storedIllness = home.illnessRecords.find((item) => item._id === illness.id)
  const storedLog = home.medicationLogs.find((item) => item._id === medication.id)
  const linkedEvents = home.courseEvents.filter((item) => item.illnessRecordId === illness.id)
  const report = await api.exportReport({
    illnessRecordId: illness.id,
    doctorQuestions: 'Is continued observation appropriate?',
  })

  assert.equal(cloudCalls, 0)
  assert.equal(home.stats.members, 2)
  assert.equal(home.stats.medicines, 1)
  assert.equal(home.stats.illnessRecords, 1)
  assert.equal(home.stats.medicationLogs, 1)
  assert.equal(storedMedicine.remainingQuantity, 7)
  assert.equal(storedIllness.status, '已就医')
  assert.equal(storedIllness.hospitalName, 'Test Hospital')
  assert.equal(storedIllness.doctorDiagnosis, 'Upper respiratory infection')
  assert.equal(storedLog.memberId, member.id)
  assert.equal(storedLog.illnessRecordId, illness.id)
  assert.equal(storedLog.medicineId, medicine.id)
  assert.ok(linkedEvents.some((item) => item.eventType === 'medication'))
  assert.ok(linkedEvents.some((item) => item.temperature === '37.8'))
  assert.deepEqual(
    JSON.parse(JSON.stringify(linkedEvents.find((item) => item.eventType === 'visit').prescribedMedicines)),
    [{ medicineId: medicine.id, medicineNameSnapshot: 'Test Medicine', unitSnapshot: 'tablet' }],
  )
  assert.match(report.reportText, /Test Member/)
  assert.match(report.reportText, /Test Medicine/)
  assert.match(report.reportText, /no reaction/)
})

test('parsed prescription medicines are synced to the demo medicine cabinet and visit timeline', () => {
  const demo = loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))
  const member = demo.getHome().members[0]
  const illness = demo.saveIllness({
    memberId: member._id,
    startedAt: '2026-07-13 08:00',
    symptoms: ['咳嗽'],
    status: '观察中',
  })

  demo.applyAiOutputToIllness(illness.id, 'prescription', {
    medicinesText: '布洛芬混悬液 100ml；阿莫西林胶囊 0.25g',
  })

  const home = demo.getHome()
  const medicines = home.medicines.filter((item) => item.memberId === member._id && item.source === '处方识别')
  const visitEvent = home.courseEvents.find((item) => item.illnessRecordId === illness.id && item.source === 'illness_created')
  assert.deepEqual(new Set(Array.from(medicines, (item) => item.name)), new Set(['阿莫西林胶囊', '布洛芬混悬液']))
  assert.equal(medicines.every((item) => item.remainingQuantity === 1), true)
  assert.equal(visitEvent.eventType, 'visit')
  assert.deepEqual(
    new Set(Array.from(visitEvent.prescribedMedicines, (item) => item.medicineNameSnapshot)),
    new Set(['阿莫西林胶囊', '布洛芬混悬液']),
  )
})
