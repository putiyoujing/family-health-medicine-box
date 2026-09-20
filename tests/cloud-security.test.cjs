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
  assert.equal(fixture.attachmentUpdates[0].data.parseStatus, 'confirmed')
  assert.equal(fixture.attachmentUpdates[0].data.parseConfirmedBy, 'user-a')
})

test('health API rejects calls without a WeChat identity before querying the database', async () => {
  const healthApi = loadCjsModule(path.join(root, 'cloudfunctions/healthApi/index.js'), {
    stubs: {
      'wx-server-sdk': {
        DYNAMIC_CURRENT_ENV: 'test-env',
        init() {},
        database() {
          return {
            command: {},
            collection() {
              throw new Error('database should not be queried without an identity')
            },
          }
        },
        getWXContext() {
          return {}
        },
      },
    },
    globals: { console: createSilentConsole() },
  })

  const result = await healthApi.main({ action: 'getHome' })

  assert.equal(result.ok, false)
  assert.match(result.message, /用户身份未就绪/)
})

test('attachment confirmation rejects a task that is still processing', async () => {
  const fixture = createHealthCloudStub({ attachmentFamilyId: 'family-a', taskStatus: 'processing' })
  const healthApi = loadCjsModule(path.join(root, 'cloudfunctions/healthApi/index.js'), {
    stubs: { 'wx-server-sdk': fixture.cloud },
    globals: { console: createSilentConsole() },
  })

  const result = await healthApi.main({
    action: 'confirmAiParseResult',
    familyId: 'family-a',
    payload: { taskId: 'task-1', output: { name: 'not ready' } },
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /not ready for confirmation/i)
  assert.equal(fixture.attachmentUpdates.length, 0)
})

test('text parse confirmation normalizes edited fields and writes them to the illness record', async () => {
  const fixture = createHealthCloudStub({ attachmentFamilyId: 'family-a', taskType: 'text_parse' })
  const healthApi = loadCjsModule(path.join(root, 'cloudfunctions/healthApi/index.js'), {
    stubs: { 'wx-server-sdk': fixture.cloud },
    globals: { console: createSilentConsole() },
  })

  const result = await healthApi.main({
    action: 'confirmAiParseResult',
    familyId: 'family-a',
    payload: {
      taskId: 'task-1',
      illnessId: 'illness-1',
      output: {
        symptoms: ['发热', '咳嗽', '发热'],
        temperatureMax: '38.6',
        unsupportedField: 'must be discarded',
      },
    },
  })

  assert.equal(result.ok, true, result.message)
  assert.equal(result.data.status, 'confirmed')
  assert.deepEqual(Array.from(result.data.output.symptoms), ['发热', '咳嗽'])
  assert.equal(result.data.output.temperatureMax, 38.6)
  assert.equal(Object.hasOwn(result.data.output, 'unsupportedField'), false)
  assert.equal(fixture.attachmentUpdates.length, 0)
  assert.equal(fixture.illnessUpdates.length, 1)
  assert.deepEqual(Array.from(fixture.illnessUpdates[0].data.symptoms), ['发热', '咳嗽'])
  assert.equal(fixture.illnessUpdates[0].data.temperatureMax, 38.6)
})

test('successful text parsing keeps the AI result pending until review confirmation', async () => {
  const fixture = createHealthCloudStub({ attachmentFamilyId: 'family-a' })
  const healthApi = loadCjsModule(path.join(root, 'cloudfunctions/healthApi/index.js'), {
    stubs: {
      'wx-server-sdk': fixture.cloud,
      './deepseek-vision': {
        MODEL: 'test-model',
        callDeepSeekText: async () => ({
          model: 'test-model',
          rawContent: '{"symptoms":["咳嗽"],"temperatureMax":"38.6","summary":"咳嗽伴发热"}',
          output: { symptoms: ['咳嗽'], temperatureMax: '38.6', summary: '咳嗽伴发热' },
          usage: {},
        }),
        callDeepSeekVision: async () => ({}),
        detectImageMimeType() {},
      },
    },
    globals: {
      console: createSilentConsole(),
      process: { env: { ENABLE_IMAGE_PARSING: 'true', IMAGE_PARSING_PROVIDER: 'deepseek_vision', DEEPSEEK_API_KEY: 'test-key' } },
    },
  })

  const result = await healthApi.main({
    action: 'parseIllnessText',
    familyId: 'family-a',
    payload: { illnessId: 'illness-1', text: '昨晚开始咳嗽，最高体温 38.6℃。' },
  })

  assert.equal(result.ok, true, result.message)
  assert.equal(result.data.appliedToIllness, false)
  assert.equal(fixture.illnessUpdates.length, 0)
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

function createHealthCloudStub({ attachmentFamilyId, taskStatus = 'success', taskType = 'image_parse' }) {
  const attachmentUpdates = []
  const illnessUpdates = []
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
    taskType,
    imageKind: taskType === 'image_parse' ? 'medicine_box' : 'text',
    status: taskStatus,
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
    illness_records: {
      'illness-1': {
        _id: 'illness-1',
        familyId: 'family-a',
        memberId: 'owner-member-1',
      },
    },
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

    async count() {
      return { total: 0 }
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
      gte: (value) => ({ gte: value }),
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
          if (name === 'illness_records') {
            illnessUpdates.push({ id, data })
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
    illnessUpdates,
    cloud: {
      DYNAMIC_CURRENT_ENV: 'test-env',
      init() {},
      database: () => db,
      getWXContext: () => ({ OPENID: 'user-a' }),
    },
  }
}
