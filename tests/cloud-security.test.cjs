const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('mock payment action is rejected in production even when its explicit flag is set', async () => {
  const paymentApi = loadCjsModule(path.join(root, 'cloudfunctions/paymentApi/index.js'), {
    stubs: {
      'wx-server-sdk': createPaymentCloudStub(),
    },
    globals: {
      console: createSilentConsole(),
      process: {
        env: {
          ALLOW_MOCK_PAYMENT: 'true',
          NODE_ENV: 'production',
        },
      },
    },
  })

  const result = await paymentApi.main({
    action: 'mockPaymentSuccess',
    payload: { orderId: 'order-1' },
  })
  assert.equal(result.ok, false)
  assert.match(result.message, /mock payment is disabled/i)
})

test('mock payment action is rejected without opt-in even in a non-production runtime', async () => {
  const paymentApi = loadCjsModule(path.join(root, 'cloudfunctions/paymentApi/index.js'), {
    stubs: {
      'wx-server-sdk': createPaymentCloudStub(),
    },
    globals: {
      console: createSilentConsole(),
      process: {
        env: {
          ALLOW_MOCK_PAYMENT: 'false',
          NODE_ENV: 'test',
        },
      },
    },
  })

  const result = await paymentApi.main({
    action: 'mockPaymentSuccess',
    payload: { orderId: 'order-1' },
  })
  assert.equal(result.ok, false)
  assert.match(result.message, /mock payment is disabled/i)
})

test('attachment confirmation rejects an attachment owned by another family before updating it', async () => {
  const fixture = createHealthCloudStub({ attachmentFamilyId: 'family-other' })
  const healthApi = loadCjsModule(path.join(root, 'cloudfunctions/healthApi/index.js'), {
    stubs: {
      'wx-server-sdk': fixture.cloud,
    },
    globals: { console: createSilentConsole() },
  })

  const result = await healthApi.main({
    action: 'confirmAiParseResult',
    familyId: 'family-a',
    payload: {
      taskId: 'task-1',
      output: { name: 'validated output' },
    },
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /record not found or no permission/i)
  assert.equal(fixture.attachmentUpdates.length, 0)
})

test('attachment confirmation updates validated attachments from the current family', async () => {
  const fixture = createHealthCloudStub({ attachmentFamilyId: 'family-a' })
  const healthApi = loadCjsModule(path.join(root, 'cloudfunctions/healthApi/index.js'), {
    stubs: {
      'wx-server-sdk': fixture.cloud,
    },
    globals: { console: createSilentConsole() },
  })

  const result = await healthApi.main({
    action: 'confirmAiParseResult',
    familyId: 'family-a',
    payload: {
      taskId: 'task-1',
      output: { name: 'validated output' },
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.data.status, 'confirmed')
  assert.equal(fixture.attachmentUpdates.length, 1)
  assert.equal(fixture.attachmentUpdates[0].id, 'attachment-1')
  assert.equal(fixture.attachmentUpdates[0].data.aiStructured.name, 'validated output')
})

function createPaymentCloudStub() {
  return {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init() {},
    database() {
      return {
        command: {
          exists: (value) => ({ exists: value }),
          inc: (value) => ({ inc: value }),
        },
      }
    },
    getWXContext() {
      return { OPENID: 'user-a' }
    },
  }
}

function createSilentConsole() {
  return {
    error() {},
    log() {},
    warn() {},
  }
}

function createHealthCloudStub({ attachmentFamilyId }) {
  const attachmentUpdates = []
  const role = {
    _id: 'role-1',
    familyId: 'family-a',
    openid: 'user-a',
    role: 'owner',
    memberId: 'owner-member-1',
  }
  const user = {
    _id: 'user-1',
    openid: 'user-a',
    currentFamilyId: 'family-a',
  }
  const family = {
    _id: 'family-a',
    ownerOpenid: 'user-a',
    name: 'Family A',
    plan: 'free',
  }
  const task = {
    _id: 'task-1',
    familyId: 'family-a',
    taskType: 'image_parse',
    imageKind: 'medicine_box',
    attachmentIds: ['attachment-1'],
  }
  const documents = {
    families: { 'family-a': family },
    family_members: {
      'owner-member-1': {
        _id: 'owner-member-1',
        familyId: 'family-a',
        name: 'Owner',
        relation: '本人',
        isOwnerProfile: true,
      },
    },
    ai_tasks: { 'task-1': task },
    attachments: {
      'attachment-1': {
        _id: 'attachment-1',
        familyId: attachmentFamilyId,
        fileId: 'cloud://attachment-1',
      },
    },
  }

  class Query {
    constructor(collection, filter = {}) {
      this.collection = collection
      this.filter = filter
    }

    where(filter) {
      return new Query(this.collection, filter)
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
      inc: (value) => ({ inc: value }),
      neq: (value) => ({ neq: value }),
    },
    collection(name) {
      const query = new Query(name)
      query.doc = (id) => ({
        async get() {
          return { data: documents[name]?.[id] || null }
        },
        async update({ data }) {
          if (name === 'attachments') {
            attachmentUpdates.push({ id, data })
          }
          return { stats: { updated: 1 } }
        },
      })
      query.add = async () => ({ _id: `new-${name}` })
      return query
    },
    serverDate() {
      return new Date('2026-07-12T00:00:00.000Z')
    },
  }
  return {
    attachmentUpdates,
    cloud: {
      DYNAMIC_CURRENT_ENV: 'test-env',
      init() {},
      database: () => db,
      getWXContext: () => ({ OPENID: 'user-a' }),
    },
  }
}
