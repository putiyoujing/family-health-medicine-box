const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('membership code redemption activates the family and cannot be redeemed twice', async () => {
  const store = {
    coupon_code_batches: [{ _id: 'batch-1', status: 'active', usedQuantity: 0 }],
    coupon_codes: [
      {
        _id: 'code-1',
        code: 'FAMILY2026',
        status: 'active',
        couponId: 'coupon-1',
        batchId: 'batch-1',
        externalOrderId: 'xhs-order-1',
      },
    ],
    coupon_redemptions: [],
    coupons: [{ _id: 'coupon-1', status: 'active', usedQuantity: 0 }],
    families: [{ _id: 'family-1' }],
    family_roles: [{ _id: 'role-1', familyId: 'family-1', openid: 'owner-1', role: 'owner' }],
    subscriptions: [],
  }
  const cloud = createCloudStub(store)
  const paymentApi = loadCjsModule(path.join(root, 'cloudfunctions/paymentApi/index.js'), {
    stubs: { 'wx-server-sdk': cloud },
  })

  const result = await paymentApi.main({
    action: 'redeemMembershipCode',
    payload: { familyId: 'family-1', code: 'family2026' },
  })

  assert.equal(result.ok, true)
  assert.equal(result.data.status, 'active')
  assert.equal(store.subscriptions.length, 1)
  assert.equal(store.subscriptions[0].externalOrderId, 'xhs-order-1')
  assert.equal(store.coupon_codes[0].status, 'used')
  assert.equal(store.coupon_redemptions.length, 1)
  assert.equal(store.coupons[0].usedQuantity, 1)
  assert.equal(store.coupon_code_batches[0].usedQuantity, 1)
  assert.equal(store.families[0].plan, 'pro')

  const duplicate = await paymentApi.main({
    action: 'redeemMembershipCode',
    payload: { familyId: 'family-1', code: 'FAMILY2026' },
  })
  assert.equal(duplicate.ok, false)
  assert.equal(store.subscriptions.length, 1)
  assert.equal(store.coupon_redemptions.length, 1)
})

function createCloudStub(store) {
  const command = {
    exists(value) {
      return { type: 'exists', value }
    },
    inc(value) {
      return { type: 'inc', value }
    },
  }
  const database = () => ({
    command,
    serverDate: () => new Date().toISOString(),
    collection(name) {
      const rows = store[name] || (store[name] = [])
      return createCollection(rows, command)
    },
  })
  return {
    DYNAMIC_CURRENT_ENV: 'current',
    database,
    getWXContext: () => ({ OPENID: 'owner-1' }),
    init() {},
  }
}

function createCollection(rows, command) {
  const query = (filters = []) => ({
    count: async () => ({ total: select(rows, filters).length }),
    get: async () => ({ data: select(rows, filters) }),
    limit: () => query(filters),
    orderBy: () => query(filters),
    where: (filter) => query([...filters, filter]),
  })
  return {
    add: async ({ data }) => {
      const row = { _id: `${rows.length + 1}-${Date.now()}`, ...data }
      rows.push(row)
      return { _id: row._id }
    },
    doc(id) {
      return {
        get: async () => {
          const row = rows.find((item) => item._id === id)
          if (!row) {
            throw new Error('not found')
          }
          return { data: row }
        },
        update: async ({ data }) => {
          const row = rows.find((item) => item._id === id)
          if (!row) {
            throw new Error('not found')
          }
          for (const [key, value] of Object.entries(data)) {
            row[key] = value && value.type === 'inc' ? Number(row[key] || 0) + value.value : value
          }
        },
      }
    },
    where: (filter) => query([filter]),
  }
}

function select(rows, filters) {
  return rows.filter((row) =>
    filters.every((filter) =>
      Object.entries(filter).every(([key, value]) =>
        value && value.type === 'exists' ? true : row[key] === value,
      ),
    ),
  )
}
