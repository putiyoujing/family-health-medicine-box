const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('healthApi hides private OpenIDs and manages family access by validated roleId', async () => {
  const fixture = createFamilyRoleCloudStub()
  const healthApi = loadCjsModule(path.join(root, 'cloudfunctions/healthApi/index.js'), {
    stubs: { 'wx-server-sdk': fixture.cloud },
    globals: { console: createSilentConsole() },
  })

  const listed = await healthApi.main({ action: 'listFamilyRoles', familyId: 'family-a' })

  assert.equal(listed.ok, true)
  assert.equal(
    JSON.stringify(listed.data.roles.map((role) => role.roleId)),
    JSON.stringify(['role-owner', 'role-member']),
  )
  assert.equal(listed.data.roles[0].isCurrentUser, true)
  assert.equal(listed.data.roles[1].isCurrentUser, false)
  assert.doesNotMatch(JSON.stringify(listed.data), /openid/i)
  assert.equal(listed.data.family.ownerOpenid, undefined)
  assert.equal(listed.data.family.membersOpenids, undefined)

  const rejected = await healthApi.main({
    action: 'updateFamilyRole',
    familyId: 'family-a',
    payload: { roleId: 'role-other-family', role: 'admin' },
  })
  assert.equal(rejected.ok, false)
  assert.match(rejected.message, /not found or no permission/i)
  assert.equal(fixture.roleUpdates.length, 0)

  const updated = await healthApi.main({
    action: 'updateFamilyRole',
    familyId: 'family-a',
    payload: { roleId: 'role-member', role: 'member' },
  })
  assert.equal(updated.ok, true)
  assert.equal(
    JSON.stringify(updated.data),
    JSON.stringify({ roleId: 'role-member', role: 'member' }),
  )

  const removed = await healthApi.main({
    action: 'removeFamilyUser',
    familyId: 'family-a',
    payload: { roleId: 'role-member' },
  })
  assert.equal(removed.ok, true)
  assert.equal(
    JSON.stringify(removed.data),
    JSON.stringify({ roleId: 'role-member', mode: 'removed' }),
  )
  assert.equal(fixture.roleUpdates.length, 2)
  assert.equal(fixture.familyUpdates.length, 1)
})

test('family page sends opaque roleId for role changes and removals', async () => {
  let pageDefinition
  const updates = []
  const removals = []
  loadCjsModule(path.join(root, 'miniprogram/pages/family/index.js'), {
    stubs: {
      '../../services/api': {
        async updateFamilyRole(payload) {
          updates.push(payload)
        },
        async removeFamilyUser(roleId) {
          removals.push(roleId)
        },
      },
      '../../utils/operation-guards': { ensureLoginReady: async () => true },
    },
    globals: {
      getApp: () => ({ globalData: {} }),
      Page(definition) {
        pageDefinition = definition
      },
      wx: {
        showModal(payload) {
          payload.success({ confirm: true })
        },
        showToast() {},
      },
    },
  })

  const page = createPageInstance(pageDefinition)
  page.load = async () => {}
  await page.changeRole({
    currentTarget: { dataset: { roleId: 'role-member', role: 'admin' } },
  })
  await page.removeUser({
    currentTarget: { dataset: { roleId: 'role-member' } },
  })

  assert.equal(
    JSON.stringify(updates),
    JSON.stringify([{ roleId: 'role-member', role: 'admin' }]),
  )
  assert.deepEqual(removals, ['role-member'])
})

function createFamilyRoleCloudStub() {
  const now = new Date('2026-07-24T00:00:00.000Z')
  const users = [
    {
      _id: 'user-owner',
      openid: 'openid-owner',
      publicUserId: '1234567890',
      nickname: '家庭创建者',
      currentFamilyId: 'family-a',
    },
    {
      _id: 'user-member',
      openid: 'openid-member',
      publicUserId: '1234567891',
      nickname: '受邀家人',
      currentFamilyId: 'family-a',
    },
  ]
  const roles = [
    {
      _id: 'role-owner',
      familyId: 'family-a',
      openid: 'openid-owner',
      role: 'owner',
      memberId: 'member-owner',
      createdAt: now,
    },
    {
      _id: 'role-member',
      familyId: 'family-a',
      openid: 'openid-member',
      role: 'viewer',
      memberId: 'member-guest',
      createdAt: now,
    },
    {
      _id: 'role-other-family',
      familyId: 'family-b',
      openid: 'openid-other',
      role: 'viewer',
      memberId: 'member-other',
      createdAt: now,
    },
  ]
  const families = {
    'family-a': {
      _id: 'family-a',
      name: '家庭 A',
      ownerOpenid: 'openid-owner',
      membersOpenids: ['openid-owner', 'openid-member'],
      plan: 'free',
      createdAt: now,
      updatedAt: now,
    },
  }
  const members = {
    'member-owner': {
      _id: 'member-owner',
      familyId: 'family-a',
      name: '家庭创建者',
      isOwnerProfile: true,
    },
  }
  const invites = [
    {
      _id: 'invite-1',
      inviteCode: 'INVITE01',
      familyId: 'family-a',
      inviterOpenid: 'openid-owner',
      acceptedOpenids: [],
      targetMemberId: 'member-pending',
      targetMemberNameSnapshot: '待加入家人',
      role: 'viewer',
      status: 'active',
      maxUses: 1,
      usedCount: 0,
      expiresAt: new Date('2026-07-25T00:00:00.000Z'),
      createdAt: now,
    },
  ]
  const roleUpdates = []
  const familyUpdates = []

  class Query {
    constructor(name, filter = {}) {
      this.name = name
      this.filter = filter
    }

    where(filter) {
      return new Query(this.name, filter)
    }

    limit() {
      return this
    }

    orderBy() {
      return this
    }

    async get() {
      const source = this.name === 'family_roles'
        ? roles
        : this.name === 'users'
          ? users
          : this.name === 'family_invites'
            ? invites
            : []
      return {
        data: source.filter((item) => Object.entries(this.filter).every(([key, value]) => {
          if (value && typeof value === 'object') {
            return true
          }
          return item[key] === value
        })),
      }
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
          if (name === 'families') {
            return { data: families[id] || null }
          }
          if (name === 'family_roles') {
            return { data: roles.find((role) => role._id === id) || null }
          }
          if (name === 'family_members') {
            return { data: members[id] || null }
          }
          return { data: null }
        },
        async update({ data }) {
          if (name === 'family_roles') {
            roleUpdates.push({ id, data })
          }
          if (name === 'families') {
            familyUpdates.push({ id, data })
          }
          return { stats: { updated: 1 } }
        },
      })
      return query
    },
    serverDate() {
      return now
    },
  }

  return {
    roleUpdates,
    familyUpdates,
    cloud: {
      DYNAMIC_CURRENT_ENV: 'test-env',
      init() {},
      database: () => db,
      getWXContext: () => ({ OPENID: 'openid-owner' }),
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
