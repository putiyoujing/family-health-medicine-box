const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

function loadDemo() {
  return loadCjsModule(path.join(root, 'miniprogram/services/demo-data.js'))
}

test('free accounts can own only the default family', () => {
  const demo = loadDemo()
  const families = demo.listMyFamilies()

  assert.equal(families.ownedFamilyCount, 1)
  assert.equal(families.maxOwnedFamilies, 1)
  assert.equal(families.canCreateFamily, false)
  assert.equal(families.multiFamilyPlan, 'free')
  assert.throws(
    () => demo.createFamily({ name: '爸妈健康记录' }),
    /免费版最多创建 1 个家庭/,
  )
})

test('pro accounts can create up to three isolated family spaces and switch between them', () => {
  const demo = loadDemo()
  const originalFamilyId = demo.getHome().currentFamilyId
  const originalMember = demo.saveMember({ name: '孩子', relation: '孩子' })
  demo.mockPaymentSuccess({})

  const proPolicy = demo.listMyFamilies()
  assert.equal(proPolicy.maxOwnedFamilies, 3)
  assert.equal(proPolicy.canCreateFamily, true)
  assert.equal(proPolicy.multiFamilyPlan, 'pro')

  const second = demo.createFamily({ name: '爸妈健康记录' })
  let secondHome = demo.getHome()
  assert.equal(secondHome.currentFamilyId, second.currentFamilyId)
  assert.equal(secondHome.members.length, 1)
  assert.equal(secondHome.members[0].isOwnerProfile, true)
  assert.equal(secondHome.illnessRecords.length, 0)

  demo.switchFamily({ familyId: originalFamilyId })
  const originalHome = demo.getHome()
  assert.ok(originalHome.members.some((member) => member._id === originalMember.id))
  assert.equal(originalHome.entitlement.planName, '家庭专业版')

  demo.createFamily({ name: '长辈健康记录' })
  const atLimit = demo.listMyFamilies()
  assert.equal(atLimit.ownedFamilyCount, 3)
  assert.equal(atLimit.maxOwnedFamilies, 3)
  assert.equal(atLimit.canCreateFamily, false)
  assert.throws(
    () => demo.createFamily({ name: '第四个家庭' }),
    /会员最多创建 3 个家庭/,
  )

  demo.switchFamily({ familyId: second.currentFamilyId })
  secondHome = demo.getHome()
  assert.equal(secondHome.family.name, '爸妈健康记录')
  assert.equal(secondHome.members.length, 1)
})
