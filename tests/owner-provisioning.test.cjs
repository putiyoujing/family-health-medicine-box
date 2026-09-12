const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('first login creates only the user and leaves family creation deferred', async () => {
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

  await assert.rejects(login.main(), /authorized user profile is required/)
  assert.equal(database.dump('users').length, 0)

  const profile = {
    nickname: 'Owner',
    avatarUrl: 'https://example.com/owner.jpg',
    gender: 'male',
  }
  await login.main({ profile })
  await login.main({ profile })

  const users = database.dump('users')
  const members = database.dump('family_members')
  const roles = database.dump('family_roles')
  assert.equal(users.length, 1)
  assert.equal(users[0].currentFamilyId, '')
  assert.equal(members.length, 0)
  assert.equal(roles.length, 0)
})

test('first login accepts an app-generated avatar preset as the official fallback path', async () => {
  const database = createDatabase()
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    getWXContext() {
      return { OPENID: 'random-profile-openid' }
    },
    database() {
      return database
    },
  }
  const login = loadCjsModule(path.join(root, 'cloudfunctions/login/index.js'), {
    stubs: { 'wx-server-sdk': cloud },
  })

  const result = await login.main({
    profile: {
      nickname: '健康守护者4821',
      avatarUrl: '',
      avatarPreset: 'lake',
    },
  })

  const user = database.dump('users')[0]
  assert.equal(user.nickname, '健康守护者4821')
  assert.equal(user.avatarUrl, '')
  assert.equal(user.avatarPreset, 'lake')
  assert.equal(user.currentFamilyId, '')
  assert.equal(result.user.avatarPreset, 'lake')
  assert.equal(result.currentFamilyId, '')
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

test('login keeps a linked owner member name and gender edited by the family', async () => {
  const database = createDatabase()
  database.seed('users', 'existing-user', {
    openid: 'owner-openid-001',
    nickname: '旧微信昵称',
    avatarUrl: 'https://example.com/old.jpg',
    gender: 'female',
    currentFamilyId: 'existing-family',
  })
  database.seed('families', 'existing-family', {
    ownerOpenid: 'owner-openid-001',
    name: '我的家庭',
    membersOpenids: ['owner-openid-001'],
  })
  database.seed('family_members', 'owner-member', {
    familyId: 'existing-family',
    name: '妈妈（家庭内称呼）',
    gender: 'female',
    relation: '本人',
    isOwnerProfile: true,
  })
  database.seed('family_roles', 'owner-role', {
    familyId: 'existing-family',
    openid: 'owner-openid-001',
    role: 'owner',
    memberId: 'owner-member',
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

  await login.main({
    profile: {
      nickname: '新的微信昵称',
      avatarUrl: 'https://example.com/new.jpg',
      gender: 'male',
    },
  })

  const member = database.dump('family_members')[0]
  assert.equal(member.name, '妈妈（家庭内称呼）')
  assert.equal(member.gender, 'female')
})

test('health API returns an empty family state without provisioning a new family', async () => {
  const database = createNoFamilyHealthDatabase()
  const healthApi = loadCjsModule(path.join(root, 'cloudfunctions/healthApi/index.js'), {
    stubs: {
      'wx-server-sdk': {
        DYNAMIC_CURRENT_ENV: 'test',
        init() {},
        getWXContext() {
          return { OPENID: 'new-user' }
        },
        database() {
          return database
        },
      },
    },
  })

  const home = await healthApi.main({ action: 'getHome' })
  const families = await healthApi.main({ action: 'listMyFamilies' })
  const membership = await healthApi.main({ action: 'getMembershipStatus' })
  const roles = await healthApi.main({ action: 'listFamilyRoles' })

  assert.equal(home.ok, true)
  assert.equal(home.data.family, null)
  assert.equal(home.data.currentFamilyId, '')
  assert.equal(families.data.ownedFamilyCount, 0)
  assert.equal(JSON.stringify(families.data.families), '[]')
  assert.equal(membership.data.family, null)
  assert.equal(membership.data.familyPolicy.ownedFamilyCount, 0)
  assert.equal(JSON.stringify(roles.data.roles), '[]')
  assert.equal(database.dump('families').length, 0)
  assert.equal(database.dump('family_roles').length, 0)
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

function createNoFamilyHealthDatabase() {
  const collections = new Map([
    ['users', new Map([[
      'new-user-record',
      {
        _id: 'new-user-record',
        openid: 'new-user',
        nickname: '新用户',
        publicUserId: '1000000002',
        currentFamilyId: '',
      },
    ]])],
    ['family_roles', new Map()],
    ['families', new Map()],
  ])

  function getCollection(name) {
    if (!collections.has(name)) {
      collections.set(name, new Map())
    }
    return collections.get(name)
  }

  return {
    command: {
      exists(value) {
        return { exists: value }
      },
    },
    serverDate() {
      return '2026-08-22T00:00:00.000Z'
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
                  .filter((record) => Object.entries(query).every(([key, value]) => {
                    if (value && typeof value === 'object' && Object.hasOwn(value, 'exists')) {
                      return value.exists ? record[key] !== undefined : record[key] === undefined
                    }
                    return record[key] === value
                  }))
                  .slice(0, limit),
              }
            },
          }
        },
      }
    },
    dump(name) {
      return [...getCollection(name).values()]
    },
  }
}
