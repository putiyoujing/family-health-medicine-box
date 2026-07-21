const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

function loadDemo() {
  return loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))
}

test('health todo keeps its member, illness and subscription delivery state', () => {
  const demo = loadDemo()
  const member = demo.saveMember({ name: '孩子', relation: '孩子' })
  const illness = demo.saveIllness({
    memberId: member.id,
    startedAt: '2026-07-19 09:00',
    symptoms: ['咳嗽'],
  })

  const todo = demo.saveReminder({
    memberId: member.id,
    illnessRecordId: illness.id,
    type: 'follow_up',
    title: '周三复诊',
    remindAt: '2026-07-22 09:30',
    subscriptionStatus: 'accepted',
    deliveryStatus: 'scheduled',
  })

  assert.equal(todo.memberId, member.id)
  assert.equal(todo.illnessRecordId, illness.id)
  assert.equal(todo.subscriptionStatus, 'accepted')
  assert.equal(todo.deliveryStatus, 'scheduled')
})

test('health todo cannot link a member to another member illness', () => {
  const demo = loadDemo()
  const child = demo.saveMember({ name: '孩子', relation: '孩子' })
  const father = demo.saveMember({ name: '爸爸', relation: '爸爸' })
  const illness = demo.saveIllness({
    memberId: child.id,
    startedAt: '2026-07-19 09:00',
    symptoms: ['发烧'],
  })

  assert.throws(
    () => demo.saveReminder({
      memberId: father.id,
      illnessRecordId: illness.id,
      title: '错误关联',
      remindAt: '2026-07-22 09:30',
    }),
    /病程.*成员|selected member/i,
  )
})

test('health todo can be completed and deleted without sending a pending notification', () => {
  const demo = loadDemo()
  const member = demo.saveMember({ name: '奶奶', relation: '奶奶' })
  const todo = demo.saveReminder({
    memberId: member.id,
    type: 'other',
    title: '准备复诊资料',
    remindAt: '2099-07-22 09:30',
    note: '携带既往检查单、处方、最近一周体温记录和需要咨询医生的问题清单。',
    subscriptionStatus: 'accepted',
  })

  const edited = demo.saveReminder({
    _id: todo.id,
    memberId: member.id,
    type: 'other',
    title: '准备完整复诊资料',
    remindAt: '2099-07-23 10:00',
    note: '补充检查单和问题清单。',
    subscriptionStatus: 'not_requested',
    preserveSubscription: true,
  })
  assert.equal(edited.id, todo.id)
  const stored = demo.getHome().reminders.find((item) => item._id === todo.id)
  assert.equal(stored.title, '准备完整复诊资料')
  assert.equal(stored.deliveryStatus, 'scheduled')

  demo.completeReminder(todo.id)
  const completed = demo.getHome().reminders.find((item) => item._id === todo.id)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.deliveryStatus, 'cancelled')

  demo.deleteReminder(todo.id)
  assert.equal(demo.getHome().reminders.some((item) => item._id === todo.id), false)
})

test('health API validates todo relations and owns the subscription recipient', async () => {
  const fixture = createHealthTodoCloudStub()
  const healthApi = loadCjsModule(path.join(root, 'cloudfunctions/healthApi/index.js'), {
    stubs: { 'wx-server-sdk': fixture.cloud },
    globals: { console: { error() {}, log() {}, warn() {} } },
  })

  const valid = await healthApi.main({
    action: 'saveReminder',
    familyId: 'family-a',
    payload: {
      memberId: 'member-a',
      illnessRecordId: 'illness-a',
      type: 'other',
      title: '复诊',
      remindAt: '2099-7-22 09:30',
      subscriptionStatus: 'accepted',
      notificationOpenid: 'attacker-controlled',
    },
  })

  assert.equal(valid.ok, true, valid.message)
  assert.equal(fixture.savedReminders.length, 1)
  assert.equal(fixture.savedReminders[0].type, 'other')
  assert.equal(fixture.savedReminders[0].notificationOpenid, 'user-a')
  assert.equal(fixture.savedReminders[0].deliveryStatus, 'scheduled')

  const edited = await healthApi.main({
    action: 'saveReminder',
    familyId: 'family-a',
    payload: {
      _id: valid.data.id,
      memberId: 'member-a',
      illnessRecordId: 'illness-a',
      type: 'other',
      title: '修改后的复诊事项',
      remindAt: '2099-8-01 10:00',
      subscriptionStatus: 'not_requested',
      preserveSubscription: true,
    },
  })
  assert.equal(edited.ok, true, edited.message)
  assert.equal(fixture.savedReminders.length, 1)
  assert.equal(fixture.getReminder(valid.data.id).title, '修改后的复诊事项')
  assert.equal(fixture.getReminder(valid.data.id).notificationOpenid, 'user-a')
  assert.equal(fixture.getReminder(valid.data.id).deliveryStatus, 'scheduled')

  const completed = await healthApi.main({
    action: 'completeReminder',
    familyId: 'family-a',
    payload: { id: valid.data.id },
  })
  assert.equal(completed.ok, true, completed.message)
  assert.equal(fixture.getReminder(valid.data.id).status, 'completed')
  assert.equal(fixture.getReminder(valid.data.id).deliveryStatus, 'cancelled')

  const invalid = await healthApi.main({
    action: 'saveReminder',
    familyId: 'family-a',
    payload: {
      memberId: 'member-b',
      illnessRecordId: 'illness-a',
      type: 'follow_up',
      title: '错误关联',
      remindAt: '2099-07-22 09:30',
      subscriptionStatus: 'accepted',
    },
  })

  assert.equal(invalid.ok, false)
  assert.match(invalid.message, /关联病程.*当前家庭成员|selected member/i)
  assert.equal(fixture.savedReminders.length, 1)
})

test('reminder dispatcher declares subscribe permission and a one-minute timer', () => {
  const functionRoot = path.join(root, 'cloudfunctions/reminderDispatcher')
  const config = JSON.parse(fs.readFileSync(path.join(functionRoot, 'config.json'), 'utf8'))
  const source = fs.readFileSync(path.join(functionRoot, 'index.js'), 'utf8')

  assert.ok(config.permissions.openapi.includes('subscribeMessage.send'))
  assert.ok(config.triggers.some((trigger) => trigger.type === 'timer' && trigger.config === '0 * * * * * *'))
  assert.match(source, /HEALTH_TODO_TEMPLATE_ID/)
  assert.match(source, /subscribeMessage\.send/)
  assert.match(source, /deliveryStatus/)
})

test('health todo page names the feature and exposes member, illness and WeChat notification controls', () => {
  const wxml = fs.readFileSync(path.join(root, 'miniprogram/pages/reminders/index.wxml'), 'utf8')
  const wxss = fs.readFileSync(path.join(root, 'miniprogram/pages/reminders/index.wxss'), 'utf8')
  const pageConfig = JSON.parse(
    fs.readFileSync(path.join(root, 'miniprogram/pages/reminders/index.json'), 'utf8'),
  )

  assert.equal(pageConfig.navigationBarTitleText, '健康待办')
  assert.match(wxml, /家庭成员/)
  assert.match(wxml, /关联病程/)
  assert.match(wxml, /微信提醒/)
  assert.match(wxml, /其他/)
  assert.match(wxml, /<picker\s+mode="date"[^>]+bindchange="onRemindDateChange"/)
  assert.match(wxml, /<picker\s+mode="time"[^>]+bindchange="onRemindTimeChange"/)
  assert.doesNotMatch(wxml, /data-field="remindAt"/)
  assert.match(wxml, /bindtap="toggleReminder"/)
  assert.match(wxml, /catchtap="completeReminder"/)
  assert.match(wxml, /catchtap="deleteReminder"/)
  assert.match(wxml, /catchtap="editReminder"/)
  assert.match(wxml, /bindtap="cancelEdit"/)
  assert.match(wxml, /form\._id\s*\?\s*'保存修改'/)
  assert.match(wxml, /展开事项/)
  assert.match(wxss, /-webkit-line-clamp:\s*2/)
  assert.doesNotMatch(wxml, /当前不会发送微信通知/)
})

test('unfinished todos sort by plan time before every completed todo, including legacy records', async () => {
  let pageDefinition
  loadCjsModule(path.join(root, 'miniprogram/pages/reminders/index.js'), {
    stubs: {
      '../../services/api': {
        async getHome() {
          return {
            family: { _id: 'family-a' },
            members: [{ _id: 'member-a', name: '我' }],
            illnessRecords: [],
            reminders: [
              {
                _id: 'completed-earliest',
                memberId: 'member-a',
                title: '已完成事项',
                remindAt: '2098-01-01 08:00',
                remindAtMs: Date.parse('2098-01-01T08:00:00+08:00'),
                status: 'completed',
              },
              {
                _id: 'active-late-legacy',
                memberId: 'member-a',
                title: '较晚未完成事项',
                remindAt: '2099-12-01 08:00',
                status: 'active',
              },
              {
                _id: 'active-early',
                memberId: 'member-a',
                title: '较早未完成事项',
                remindAt: '2099-01-01 08:00',
                remindAtMs: Date.parse('2099-01-01T08:00:00+08:00'),
                status: 'active',
              },
            ],
          }
        },
      },
      '../../utils/constants': { HEALTH_TODO_TEMPLATE_ID: '' },
      '../../utils/operation-guards': {
        ensureHasMembers: () => true,
        ensureLoginReady: async () => true,
      },
    },
    globals: {
      Page(definition) {
        pageDefinition = definition
      },
      wx: { showToast() {} },
    },
  })

  const page = createPageInstance(pageDefinition)
  await page.load()
  assert.deepEqual(
    page.data.reminders.map((item) => item._id),
    ['active-early', 'active-late-legacy', 'completed-earliest'],
  )
})

function createHealthTodoCloudStub() {
  const savedReminders = []
  const role = {
    _id: 'role-a',
    familyId: 'family-a',
    openid: 'user-a',
    role: 'owner',
    memberId: 'member-a',
  }
  const user = { _id: 'user-a', openid: 'user-a', currentFamilyId: 'family-a' }
  const documents = {
    families: {
      'family-a': { _id: 'family-a', ownerOpenid: 'user-a', name: '家庭 A', plan: 'free' },
    },
    family_members: {
      'member-a': { _id: 'member-a', familyId: 'family-a', name: '孩子' },
      'member-b': { _id: 'member-b', familyId: 'family-a', name: '爸爸' },
    },
    illness_records: {
      'illness-a': {
        _id: 'illness-a',
        familyId: 'family-a',
        memberId: 'member-a',
        startedAt: '2026-07-19 09:00',
        symptoms: ['发烧'],
      },
    },
  }

  class Query {
    constructor(collection) {
      this.collection = collection
    }

    where() {
      return this
    }

    limit() {
      return this
    }

    orderBy() {
      return this
    }

    async get() {
      if (this.collection === 'family_roles') {
        return { data: [role] }
      }
      if (this.collection === 'users') {
        return { data: [user] }
      }
      return { data: [] }
    }
  }

  const db = {
    command: {
      exists: (value) => ({ exists: value }),
      gte: (value) => ({ gte: value }),
      inc: (value) => ({ inc: value }),
      neq: (value) => ({ neq: value }),
    },
    collection(name) {
      const query = new Query(name)
      query.doc = (id) => ({
        async get() {
          return { data: documents[name]?.[id] || null }
        },
        async update({ data } = {}) {
          if (documents[name]?.[id]) {
            Object.assign(documents[name][id], data || {})
          }
          return { stats: { updated: 1 } }
        },
      })
      query.add = async ({ data }) => {
        const id = `new-${name}`
        if (name === 'reminders') {
          savedReminders.push(data)
          documents.reminders = documents.reminders || {}
          documents.reminders[id] = { _id: id, ...data }
        }
        return { _id: id }
      }
      return query
    },
    serverDate() {
      return new Date('2026-07-19T00:00:00.000Z')
    },
  }

  return {
    savedReminders,
    getReminder: (id) => documents.reminders?.[id],
    cloud: {
      DYNAMIC_CURRENT_ENV: 'test-env',
      init() {},
      database: () => db,
      getWXContext: () => ({ OPENID: 'user-a' }),
    },
  }
}
