const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('medicine, illness, and medication records have no membership quota', () => {
  const demo = loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))
  const freeMembership = demo.getMembershipStatus()
  const proMembership = (() => {
    demo.redeemMembershipCode({ code: 'XXLIFELAB-TEST-2026' })
    return demo.getMembershipStatus()
  })()
  const healthApiSource = fs.readFileSync(path.join(root, 'cloudfunctions/healthApi/index.js'), 'utf8')
  const paymentApiSource = fs.readFileSync(path.join(root, 'cloudfunctions/paymentApi/index.js'), 'utf8')
  const membershipPageSource = fs.readFileSync(path.join(root, 'miniprogram/pages/membership/index.js'), 'utf8')

  for (const membership of [freeMembership, proMembership]) {
    assert.equal('maxMedicines' in membership.entitlement.limits, false)
    assert.equal('maxHealthRecords' in membership.entitlement.limits, false)
    assert.equal('maxMedicationLogs' in membership.entitlement.limits, false)
    assert.equal('medicines' in membership.usage, false)
    assert.equal('healthRecords' in membership.usage, false)
    assert.equal('medicationLogs' in membership.usage, false)
  }

  assert.doesNotMatch(healthApiSource, /maxMedicines|maxHealthRecords|maxMedicationLogs/)
  assert.doesNotMatch(paymentApiSource, /maxMedicines|maxHealthRecords|maxMedicationLogs/)
  assert.doesNotMatch(membershipPageSource, /maxMedicines|maxHealthRecords|maxMedicationLogs/)
})

test('all three free family members can link accounts with management or edit roles', () => {
  const demo = loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))
  const membership = demo.getMembershipStatus()
  const cloudSource = fs.readFileSync(path.join(root, 'cloudfunctions/healthApi/index.js'), 'utf8')

  assert.equal(membership.entitlement.limits.maxMembers, 3)
  assert.equal(membership.entitlement.limits.maxSharedUsers, 2)
  assert.equal(membership.entitlement.limits.sharedRoles.join(','), 'viewer,member,admin')
  assert.match(
    cloudSource,
    /const FREE_LIMITS = \{[\s\S]*?maxMembers: 3,[\s\S]*?maxSharedUsers: 2,[\s\S]*?sharedRoles: \['viewer', 'member', 'admin'\]/,
  )

  const editor = demo.saveMember({ name: '妈妈', relation: '妈妈' })
  const admin = demo.saveMember({ name: '爸爸', relation: '爸爸' })
  assert.equal(demo.createFamilyInvite({ targetMemberId: editor.id, role: 'member' }).role, 'member')
  assert.equal(demo.createFamilyInvite({ targetMemberId: admin.id, role: 'admin' }).role, 'admin')
})

test('development membership test code keeps the remaining pro limits', () => {
  const demo = loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))
  const result = demo.redeemMembershipCode({ code: 'XXLIFELAB-TEST-2026' })
  const membership = demo.getMembershipStatus()

  assert.equal(result.status, 'active')
  assert.equal(membership.entitlement.planName, '家庭专业版')
  assert.equal(membership.entitlement.limits.maxAttachments, 100)
  assert.equal(membership.entitlement.limits.maxOwnedFamilies, 3)
})

test('development membership test code fills remaining limited benefits for visual QA', () => {
  const demo = loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))
  demo.redeemMembershipCode({ code: 'XXLIFELAB-TEST-2026' })

  const membership = demo.getMembershipStatus()
  const familyPolicy = demo.listMyFamilies()

  assert.equal(familyPolicy.ownedFamilyCount, membership.entitlement.limits.maxOwnedFamilies)
  assert.equal(membership.usage.members, membership.entitlement.limits.maxMembers)
  assert.equal(membership.usage.sharedUsers, membership.entitlement.limits.maxSharedUsers)
  assert.equal(membership.usage.attachments, membership.entitlement.limits.maxAttachments)
  assert.equal(membership.usage.aiAssistantMonthly, membership.entitlement.limits.aiAssistantMonthly)
  assert.equal(membership.usage.aiImageParseMonthly, membership.entitlement.limits.aiImageParseMonthly)
})

test('membership center presents the multi-family benefit and account-level usage scope', () => {
  const script = fs.readFileSync(path.join(root, 'miniprogram/pages/membership/index.js'), 'utf8')
  const template = fs.readFileSync(path.join(root, 'miniprogram/pages/membership/index.wxml'), 'utf8')

  assert.match(script, /可创建家庭[^\n]*free: '1 个'[^\n]*pro: '3 个'/)
  assert.match(script, /成员账号关联[^\n]*free: '3 位成员均可管理或编辑'/)
  assert.doesNotMatch(script, /药品数量|病程记录|用药记录/)
  assert.match(template, /家庭数量按账号统计，其他用量按当前家庭统计/)
})

test('membership card shows redemption and benefits without plan prices', () => {
  const script = fs.readFileSync(path.join(root, 'miniprogram/pages/membership/index.js'), 'utf8')
  const template = fs.readFileSync(path.join(root, 'miniprogram/pages/membership/index.wxml'), 'utf8')
  const actionCardPosition = template.indexOf('class="section membership-action-card"')
  const benefitsPosition = template.indexOf('class="benefits-panel"')
  const redeemPosition = template.indexOf('id="redeem-section"')

  assert.notEqual(actionCardPosition, -1)
  assert.notEqual(benefitsPosition, -1)
  assert.notEqual(redeemPosition, -1)
  assert.ok(actionCardPosition < redeemPosition)
  assert.ok(redeemPosition < benefitsPosition)
  assert.doesNotMatch(script, /PLAN_DISPLAY_ORDER|DEFAULT_PLANS|formatMoney/)
  assert.doesNotMatch(template, /会员套餐|plan-list|plan-price|¥/)
  assert.match(template, /输入会员兑换码/)
})
