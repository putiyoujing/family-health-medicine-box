const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

function loadDemo() {
  return loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))
}

test('quick records use one shared quota across text and images', () => {
  const demo = loadDemo()
  const memberId = demo.getHome().members[0]._id
  const payload = (index) => ({
    entrySource: 'quick',
    memberId,
    startedAt: `2026-08-22 10:${String(index).padStart(2, '0')}`,
    symptomDescription: `快速记录 ${index}`,
  })

  for (let index = 1; index <= 3; index += 1) {
    demo.saveIllness(payload(index))
  }

  assert.equal(demo.getHome().quickRecordUsage.used, 3)
  assert.equal(demo.getHome().quickRecordUsage.remaining, 0)
  assert.throws(() => demo.saveIllness(payload(4)), /快速记录次数已用完/)
})

test('paid and unlimited membership expose the new quick-record tiers', () => {
  const demo = loadDemo()
  demo.redeemMembershipCode({ code: 'XXLIFELAB-TEST-2026' })
  let home = demo.getHome()
  assert.equal(home.entitlement.tier, 'paid')
  assert.equal(home.entitlement.limits.quickRecordLimit, 30)
  assert.equal(home.entitlement.limits.quickRecordPeriod, 'monthly')

  demo.redeemMembershipCode({ code: 'XXLIFELAB-UNLIMITED-2026' })
  home = demo.getHome()
  assert.equal(home.entitlement.tier, 'unlimited')
  assert.equal(home.entitlement.limits.quickRecordLimit, null)
  assert.equal(home.quickRecordUsage.exhausted, false)
})

test('every family member can receive a collaboration invite without an account quota', () => {
  const demo = loadDemo()
  const memberIds = Array.from({ length: 3 }, (_, index) => demo.saveMember({
    name: `家人${index + 1}`,
    relation: '家人',
  }).id)
  const invites = memberIds.map((targetMemberId) => demo.createFamilyInvite({
    targetMemberId,
    role: 'member',
  }))

  assert.equal(invites.length, 3)
  assert.equal(demo.listFamilyRoles().pendingInvites.length, 3)
})

test('quick-record UI shows the shared quota and upgrade route', () => {
  const quickSource = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/quick.js'), 'utf8')
  const quickTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/quick.wxml'), 'utf8')
  const membershipTemplate = fs.readFileSync(path.join(root, 'miniprogram/pages/membership/index.wxml'), 'utf8')

  assert.match(quickSource, /entrySource: 'quick'/)
  assert.match(quickSource, /content: '请升级会员'/)
  assert.match(quickSource, /\/pages\/membership\/index\?focus=redeem/)
  assert.match(quickTemplate, /基础版最多可体验三次|quickRecordNotice/)
  assert.match(quickTemplate, /每类最多上传 \{\{totalImageLimit\}\} 张/)
  assert.match(membershipTemplate, /基础版/)
  assert.match(membershipTemplate, /安心版/)
  assert.match(membershipTemplate, /畅享版/)
  assert.doesNotMatch(membershipTemplate, /AI 图片解析|记录查询|成员账号关联|额外关联账号/)
})
