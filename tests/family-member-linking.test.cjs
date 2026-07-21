const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { createPageInstance, loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

function loadDemo() {
  return loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))
}

test('a targeted invite links an account to an existing member without creating a duplicate profile', () => {
  const demo = loadDemo()
  const member = demo.saveMember({ name: '奶奶', relation: '奶奶' })
  const memberCountBeforeInvite = demo.getHome().members.length

  const invite = demo.createFamilyInvite({
    role: 'viewer',
    targetMemberId: member.id,
  })
  const pending = demo.listFamilyRoles().pendingInvites
  const publicInvite = demo.getFamilyInvite({
    inviteCode: invite.inviteCode,
    openid: 'demo-invitee',
  })

  assert.equal(pending.length, 1)
  assert.equal(pending[0].targetMemberId, member.id)
  assert.equal(publicInvite.targetMemberNameSnapshot, '奶奶')
  assert.equal(publicInvite.canAccept, true)

  const accepted = demo.acceptFamilyInvite({
    inviteCode: invite.inviteCode,
    openid: 'demo-invitee',
  })
  const roleData = demo.listFamilyRoles()
  const linkedRole = roleData.roles.find((role) => role.openid === 'demo-invitee')

  assert.equal(accepted.memberId, member.id)
  assert.equal(linkedRole.memberId, member.id)
  assert.equal(roleData.pendingInvites.length, 0)
  assert.equal(demo.getHome().members.length, memberCountBeforeInvite)
  assert.throws(
    () => demo.createFamilyInvite({ role: 'viewer', targetMemberId: member.id }),
    /已经关联微信账号/,
  )
})

test('removing collaboration access keeps the member health profile', () => {
  const demo = loadDemo()
  const member = demo.saveMember({ name: '爸爸', relation: '爸爸' })
  const invite = demo.createFamilyInvite({ role: 'viewer', targetMemberId: member.id })
  demo.acceptFamilyInvite({ inviteCode: invite.inviteCode, openid: 'demo-invitee' })

  demo.removeFamilyUser('demo-invitee')

  assert.ok(demo.getHome().members.some((item) => item._id === member.id))
  assert.equal(demo.listFamilyRoles().roles.some((role) => role.openid === 'demo-invitee'), false)
})

test('archiving a member removes the profile from active members and unlinks its account', () => {
  const demo = loadDemo()
  const member = demo.saveMember({ name: '爷爷', relation: '爷爷' })
  const invite = demo.createFamilyInvite({ role: 'viewer', targetMemberId: member.id })
  demo.acceptFamilyInvite({ inviteCode: invite.inviteCode, openid: 'demo-invitee' })

  demo.deleteMember(member.id)

  assert.equal(demo.getHome().members.some((item) => item._id === member.id), false)
  const formerLinkedRole = demo.listFamilyRoles().roles.find((role) => role.openid === 'demo-invitee')
  assert.equal(formerLinkedRole.memberId, '')
})

test('an invite must target an existing family member profile', () => {
  const demo = loadDemo()
  assert.throws(() => demo.createFamilyInvite({ role: 'viewer' }), /请先选择要关联的家庭成员/)
})

test('the family owner is present and linked in family members by default', () => {
  const demo = loadDemo()
  const home = demo.getHome()
  const ownerRole = demo.listFamilyRoles().roles.find((role) => role.openid === 'demo-owner')
  const ownerMember = home.members.find((member) => member._id === ownerRole.memberId)

  assert.ok(ownerMember)
  assert.equal(ownerMember.relation, '本人')
  assert.equal(ownerMember.isOwnerProfile, true)
  assert.throws(() => demo.deleteMember(ownerMember._id), /创建者本人档案不能归档/)
})

test('an account already in the family cannot accept its own member invite', () => {
  const demo = loadDemo()
  const member = demo.saveMember({ name: '妈妈', relation: '妈妈' })
  const invite = demo.createFamilyInvite({ role: 'admin', targetMemberId: member.id })
  const memberCountBeforeAccept = demo.getHome().members.length
  const roleCountBeforeAccept = demo.listFamilyRoles().roles.length
  const publicInvite = demo.getFamilyInvite({ inviteCode: invite.inviteCode })

  assert.equal(publicInvite.canAccept, false)
  assert.match(publicInvite.acceptBlockedReason, /已经在这个家庭中/)
  assert.throws(
    () => demo.acceptFamilyInvite({ inviteCode: invite.inviteCode }),
    /已经在这个家庭中/,
  )
  assert.equal(demo.getHome().members.length, memberCountBeforeAccept)
  assert.equal(demo.listFamilyRoles().roles.length, roleCountBeforeAccept)
  assert.equal(demo.listFamilyRoles().pendingInvites.length, 1)
})

test('cloud invite acceptance rejects both the inviter and any account already in the family', async () => {
  for (const inviterOpenid of ['current-user', 'another-admin']) {
    const healthApi = loadCjsModule(path.join(root, 'cloudfunctions/healthApi/index.js'), {
      stubs: {
        'wx-server-sdk': createInviteAcceptanceCloudStub({ inviterOpenid }),
      },
      globals: { console: createSilentConsole() },
    })

    const result = await healthApi.main({
      action: 'acceptFamilyInvite',
      payload: { inviteCode: ' invite01 ' },
    })

    assert.equal(result.ok, false)
    assert.match(result.message, /已经在这个家庭中/)
  }
})

test('invite page loads the selected member when legacy limits omit sharedRoles', async () => {
  let pageDefinition
  const toastMessages = []
  loadCjsModule(path.join(root, 'miniprogram/pages/family/invite.js'), {
    stubs: {
      '../../services/api': {
        async getMembershipStatus() {
          return {
            entitlement: {
              planName: '免费版',
              limits: { maxSharedUsers: 1 },
            },
          }
        },
        async getHome() {
          return {
            members: [
              { _id: 'owner-member', name: '我' },
              { _id: 'child-member', name: '孩子' },
            ],
          }
        },
        async listFamilyRoles() {
          return {
            roles: [{ openid: 'owner', role: 'owner', memberId: 'owner-member' }],
            pendingInvites: [],
          }
        },
      },
      '../../utils/operation-guards': {
        ensureLoginReady: async () => true,
      },
    },
    globals: {
      Page(definition) {
        pageDefinition = definition
      },
      wx: {
        showToast(payload) {
          toastMessages.push(payload.title)
        },
      },
    },
  })

  const page = createPageInstance(pageDefinition)
  await page.onLoad({ memberId: 'child-member' })

  assert.equal(page.data.targetMemberId, 'child-member')
  assert.equal(page.data.targetMemberName, '孩子')
  assert.equal(page.data.role, 'viewer')
  assert.equal(page.data.roleOptions.length, 1)
  assert.equal(page.data.entitlement.sharedRolesText, '查看者')
  assert.deepEqual(toastMessages, [])
})

test('copying an invite copies only its code and reports success', () => {
  let pageDefinition
  let clipboardData = ''
  const toastMessages = []
  loadCjsModule(path.join(root, 'miniprogram/pages/family/invite.js'), {
    stubs: {
      '../../services/api': {},
      '../../utils/operation-guards': { ensureLoginReady: async () => true },
    },
    globals: {
      Page(definition) {
        pageDefinition = definition
      },
      wx: {
        setClipboardData(payload) {
          clipboardData = payload.data
          payload.success()
        },
        showToast(payload) {
          toastMessages.push(payload.title)
        },
      },
    },
  })

  const page = createPageInstance(pageDefinition, {
    targetMemberName: '孩子',
    invite: { inviteCode: 'TEST01' },
  })
  page.copyInvite()

  assert.equal(clipboardData, 'TEST01')
  assert.deepEqual(toastMessages, ['复制成功'])
})

test('accepting an invite switches the active family before opening the dashboard', async () => {
  let pageDefinition
  const app = { globalData: { currentFamilyId: 'old-family' } }
  const switchedTabs = []
  loadCjsModule(path.join(root, 'miniprogram/pages/family/accept.js'), {
    stubs: {
      '../../services/api': {
        async acceptFamilyInvite(code) {
          assert.equal(code, 'TEST01')
          return { familyId: 'joined-family', memberId: 'child-member' }
        },
      },
      '../../utils/operation-guards': { ensureLoginReady: async () => true },
    },
    globals: {
      getApp() {
        return app
      },
      Page(definition) {
        pageDefinition = definition
      },
      setTimeout(callback) {
        callback()
      },
      wx: {
        showToast() {},
        switchTab(payload) {
          switchedTabs.push(payload.url)
        },
      },
    },
  })

  const page = createPageInstance(pageDefinition, { code: ' test01 ' })
  await page.accept()

  assert.equal(app.globalData.currentFamilyId, 'joined-family')
  assert.deepEqual(switchedTabs, ['/pages/dashboard/index'])
})

test('invite page shows a modal and returns when the account is already in the family', async () => {
  let pageDefinition
  let acceptCalls = 0
  const modalMessages = []
  const navigateBackCalls = []
  const blockedReason = '你已经在这个家庭中，无需重复加入；请让尚未加入的家人接受邀请'
  loadCjsModule(path.join(root, 'miniprogram/pages/family/accept.js'), {
    stubs: {
      '../../services/api': {
        async getFamilyInvite() {
          return {
            inviteCode: 'TEST01',
            familyNameSnapshot: '我的家庭',
            role: 'admin',
            canAccept: false,
            acceptBlockedReason: blockedReason,
          }
        },
        async acceptFamilyInvite() {
          acceptCalls += 1
          return { familyId: 'same-family' }
        },
      },
      '../../utils/operation-guards': { ensureLoginReady: async () => true },
    },
    globals: {
      getCurrentPages() {
        return [{ route: 'pages/family/index' }, { route: 'pages/family/accept' }]
      },
      Page(definition) {
        pageDefinition = definition
      },
      wx: {
        showModal(payload) {
          modalMessages.push({
            title: payload.title,
            content: payload.content,
            showCancel: payload.showCancel,
            confirmText: payload.confirmText,
          })
          payload.success({ confirm: true })
        },
        navigateBack(payload) {
          navigateBackCalls.push(payload.delta)
        },
      },
    },
  })

  const page = createPageInstance(pageDefinition)
  await page.loadInvite('TEST01')

  assert.equal(page.data.invite.canAccept, false)
  assert.equal(acceptCalls, 0)
  assert.deepEqual(modalMessages, [{
    title: '无需重复加入',
    content: blockedReason,
    showCancel: false,
    confirmText: '确定',
  }])
  assert.deepEqual(navigateBackCalls, [1])
  const template = fs.readFileSync(path.join(root, 'miniprogram/pages/family/accept.wxml'), 'utf8')
  assert.doesNotMatch(template, /无需重复加入/)
  assert.match(template, /wx:if="\{\{invite && invite\.canAccept\}\}" bindtap="accept"/)
})

test('family management provides an entry for manually entering an invite code', () => {
  let pageDefinition
  const navigatedUrls = []
  loadCjsModule(path.join(root, 'miniprogram/pages/family/index.js'), {
    stubs: {
      '../../services/api': {},
      '../../utils/operation-guards': { ensureLoginReady: async () => true },
    },
    globals: {
      Page(definition) {
        pageDefinition = definition
      },
      wx: {
        navigateTo(payload) {
          navigatedUrls.push(payload.url)
        },
      },
    },
  })

  const page = createPageInstance(pageDefinition)
  page.openAcceptInvite()

  assert.deepEqual(navigatedUrls, ['/pages/family/accept'])
  const template = fs.readFileSync(path.join(root, 'miniprogram/pages/family/index.wxml'), 'utf8')
  assert.match(template, /bindtap="openAcceptInvite">输入邀请码加入家庭<\/button>/)
})

function createInviteAcceptanceCloudStub({ inviterOpenid }) {
  const invite = {
    _id: 'invite-1',
    inviteCode: 'INVITE01',
    familyId: 'family-1',
    inviterOpenid,
    targetMemberId: 'member-mom',
    role: 'admin',
    status: 'active',
    maxUses: 1,
    usedCount: 0,
  }
  const currentRole = {
    _id: 'role-current',
    familyId: 'family-1',
    openid: 'current-user',
    role: 'owner',
    memberId: 'member-self',
  }

  class Query {
    constructor(collectionName) {
      this.collectionName = collectionName
    }

    where() {
      return this
    }

    limit() {
      return this
    }

    async get() {
      if (this.collectionName === 'family_invites') {
        return { data: [invite] }
      }
      if (this.collectionName === 'family_roles') {
        return { data: [currentRole] }
      }
      return { data: [] }
    }
  }

  return {
    DYNAMIC_CURRENT_ENV: 'test-env',
    init() {},
    getWXContext() {
      return { OPENID: 'current-user' }
    },
    database() {
      return {
        command: {
          exists: (value) => ({ exists: value }),
          inc: (value) => ({ inc: value }),
          neq: (value) => ({ neq: value }),
        },
        collection(name) {
          return new Query(name)
        },
      }
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
