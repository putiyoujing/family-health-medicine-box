const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('first login creates one owner member and binds the owner role idempotently', async () => {
  const database = createDatabase()
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    getWXContext() {
      return { OPENID: 'owner-openid-001' }
    },
    database() {
      return database
    },
  }
  const login = loadCjsModule(path.join(root, 'cloudfunctions/login/index.js'), {
    stubs: { 'wx-server-sdk': cloud },
  })

  await login.main()
  await login.main()

  const members = database.dump('family_members')
  const roles = database.dump('family_roles')
  assert.equal(members.length, 1)
  assert.equal(roles.length, 1)
  assert.equal(members[0].relation, '本人')
  assert.equal(members[0].isOwnerProfile, true)
  assert.equal(roles[0].role, 'owner')
  assert.equal(roles[0].memberId, members[0]._id)
})

test('an existing unlinked owner is backfilled with one member profile', async () => {
  const database = createDatabase()
  database.seed('users', 'legacy-user', {
    openid: 'owner-openid-001',
    nickname: '妈妈',
    currentFamilyId: 'legacy-family',
  })
  database.seed('families', 'legacy-family', {
    ownerOpenid: 'owner-openid-001',
    name: '我的家庭',
    membersOpenids: ['owner-openid-001'],
  })
  database.seed('family_roles', 'legacy-owner-role', {
    familyId: 'legacy-family',
    openid: 'owner-openid-001',
    role: 'owner',
  })
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    getWXContext() {
      return { OPENID: 'owner-openid-001' }
    },
    database() {
      return database
    },
  }
  const login = loadCjsModule(path.join(root, 'cloudfunctions/login/index.js'), {
    stubs: { 'wx-server-sdk': cloud },
  })

  await login.main()
  await login.main()

  const members = database.dump('family_members')
  const ownerRole = database.dump('family_roles')[0]
  assert.equal(members.length, 1)
  assert.equal(members[0].name, '妈妈')
  assert.equal(ownerRole.memberId, members[0]._id)
})

function createDatabase() {
  const collections = new Map()
  const now = '2026-07-19T00:00:00.000Z'

  function getCollection(name) {
    if (!collections.has(name)) {
      collections.set(name, new Map())
    }
    return collections.get(name)
  }

  return {
    serverDate() {
      return now
    },
    collection(name) {
      const records = getCollection(name)
      return {
        where(query) {
          let limit = Number.POSITIVE_INFINITY
          return {
            limit(value) {
              limit = value
              return this
            },
            async get() {
              return {
                data: [...records.values()]
                  .filter((record) => Object.entries(query).every(([key, value]) => record[key] === value))
                  .slice(0, limit),
              }
            },
          }
        },
        doc(id) {
          return {
            async get() {
              if (!records.has(id)) {
                throw new Error('document not found')
              }
              return { data: records.get(id) }
            },
            async set({ data }) {
              records.set(id, { ...data, _id: id })
              return { _id: id }
            },
            async update({ data }) {
              const current = records.get(id)
              if (!current) {
                throw new Error('document not found')
              }
              records.set(id, { ...current, ...data, _id: id })
              return { stats: { updated: 1 } }
            },
          }
        },
      }
    },
    dump(name) {
      return [...getCollection(name).values()]
    },
    seed(name, id, data) {
      getCollection(name).set(id, { ...data, _id: id })
    },
  }
}
