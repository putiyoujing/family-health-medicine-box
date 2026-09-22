const { loadCjsModule } = require('./cjs-harness.cjs')
const path = require('node:path')

function createPaymentFixture({ store: initial = {}, openid = 'owner-1', source = '', env = {}, transactionAvailable = true, beforeTransaction, provider }  = {}) {
  const store = structuredClone({
    families: [{ _id: 'family-1', plan: 'free' }],
    family_roles: [{ _id: 'role-1', familyId: 'family-1', openid: 'owner-1', role: 'owner' }],
    coupon_codes: [{ _id: 'code-1', code: 'FAMILY2026', status: 'active', batchId: 'batch-1' }],
    coupon_code_batches: [{ _id: 'batch-1', status: 'active', usedQuantity: 0 }],
    subscriptions: [], coupon_redemptions: [], orders: [], ...initial,
  })
  let failure = null
  let queue = Promise.resolve()
  const clone = (value) => structuredClone(value)
  const command = { exists: (value) => ({ type: 'exists', value }), inc: (value) => ({ type: 'inc', value }), in: (value) => ({ type: 'in', value }) }
  const matches = (row, filters) => filters.every((filter) => Object.entries(filter).every(([key, value]) => {
    if (value && value.type === 'exists') return (row[key] !== undefined) === value.value
    if (value && value.type === 'in') return value.value.includes(row[key])
    return row[key] === value
  }))
  function collection(dataStore, name, transactional = false) {
    const rows = () => dataStore[name] || (dataStore[name] = [])
    const fail = (operation) => {
      if (failure && failure.name === name && failure.operation === operation) {
        failure = null
        throw new Error(`injected ${name} ${operation} failure`)
      }
    }
    const query = (filters = [], maxCount = Infinity, ordering) => ({
      where: (filter) => query([...filters, filter], maxCount, ordering),
      limit: (count) => query(filters, count, ordering),
      orderBy: (field, direction = 'asc') => query(filters, maxCount, { field, direction }),
      get: async () => {
        fail('get')
        const data = rows().filter((row) => matches(row, filters))
        if (ordering) data.sort((left, right) => {
          const a = left[ordering.field] instanceof Date ? left[ordering.field].getTime() : left[ordering.field] || 0
          const b = right[ordering.field] instanceof Date ? right[ordering.field].getTime() : right[ordering.field] || 0
          return (a < b ? -1 : a > b ? 1 : 0) * (ordering.direction === 'desc' ? -1 : 1)
        })
        return { data: clone(data.slice(0, maxCount)) }
      },
      count: async () => ({ total: rows().filter((row) => matches(row, filters)).length }),
      update: async ({ data }) => { for (const row of rows().filter((row) => matches(row, filters))) Object.assign(row, data) },
    })
    return {
      ...(transactional ? {} : query()),
      doc(id) {
        return {
          get: async () => { fail('get'); return { data: clone(rows().find((row) => row._id === id) || null) } },
          set: async ({ data }) => {
            fail('set')
            const index = rows().findIndex((row) => row._id === id)
            const row = { ...clone(data), _id: id }
            if (index < 0) rows().push(row)
            else rows()[index] = row
            return { _id: id }
          },
          update: async ({ data }) => {
            fail('update')
            const row = rows().find((item) => item._id === id)
            if (!row) throw new Error(`missing ${name}/${id}`)
            for (const [key, value] of Object.entries(data)) row[key] = value && value.type === 'inc' ? Number(row[key] || 0) + value.value : clone(value)
            return { stats: { updated: 1 } }
          },
        }
      },
    }
  }
  const db = { command, serverDate: () => new Date(), collection: (name) => collection(store, name) }
  if (transactionAvailable) db.runTransaction = (callback) => {
    const operation = queue.then(async () => {
      if (beforeTransaction) await beforeTransaction(store)
      const draft = clone(store)
      const result = await callback({ collection: (name) => collection(draft, name, true) })
      for (const key of Object.keys(store)) delete store[key]
      Object.assign(store, draft)
      return result
    })
    queue = operation.catch(() => {})
    return operation
  }
  const cloud = { init() {}, database: () => db, getWXContext: () => ({ OPENID: openid, SOURCE: source }), DYNAMIC_CURRENT_ENV: 'fixture' }
  const api = loadCjsModule(path.resolve(__dirname, '../../cloudfunctions/paymentApi/index.js'), { stubs: { 'wx-server-sdk': cloud, './virtual-payment': provider || { getCapability: () => ({ ready: false, provider: 'official_virtual_payment', reason: '支付参数尚未配置' }) } }, globals: { process: { env } } })
  return { store, cloud, api, failNext(name, operation) { failure = { name, operation } }, call(action, payload = {}) { return api.main({ action, payload: { familyId: 'family-1', ...payload } }) } }
}
module.exports = { createPaymentFixture }
