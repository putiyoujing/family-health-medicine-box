const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')

test('viewer role is read-only while owner, admin and member can edit family records', () => {
  const guards = loadCjsModule(path.join(root, 'miniprogram/utils/operation-guards.js'), {
    globals: {
      getApp() {
        return null
      },
      wx: {},
    },
  })

  assert.equal(guards.canEditFamilyRecords({ role: 'owner' }), true)
  assert.equal(guards.canEditFamilyRecords({ role: 'admin' }), true)
  assert.equal(guards.canEditFamilyRecords({ role: 'member' }), true)
  assert.equal(guards.canEditFamilyRecords({ role: 'viewer' }), false)
  assert.equal(guards.canEditFamilyRecords({}), false)
})

test('guests retain write entries for login while viewers remain read-only', () => {
  const dashboardTemplate = read('miniprogram/pages/dashboard/index.wxml')
  const dashboardSource = read('miniprogram/pages/dashboard/index.js')
  const illnessTemplate = read('miniprogram/pages/illness/index.wxml')
  const illnessSource = read('miniprogram/pages/illness/index.js')
  const medicinesTemplate = read('miniprogram/pages/medicines/index.wxml')
  const medicinesSource = read('miniprogram/pages/medicines/index.js')
  const medicationTemplate = read('miniprogram/pages/medication/index.wxml')
  const profileTemplate = read('miniprogram/pages/profile/index.wxml')
  const profileSource = read('miniprogram/pages/profile/index.js')
  const guardSource = read('miniprogram/utils/operation-guards.js')

  assert.match(dashboardTemplate, /<view class="quick-grid" wx:if="\{\{showWriteEntries\}\}">/)
  assert.match(dashboardTemplate, /<button class="primary-btn hero-btn" wx:if="\{\{showWriteEntries\}\}"/)
  assert.ok((dashboardTemplate.match(/<view class="card-actions" wx:if="\{\{showWriteEntries\}\}">/g) || []).length >= 4)
  assert.match(dashboardTemplate, /\{\{showWriteEntries \? '管理药箱' : '查看药箱'\}\}/)
  assert.match(dashboardTemplate, /\{\{showWriteEntries \? '记录用药' : '查看用药'\}\}/)
  assert.match(dashboardSource, /const canEditRecords = canEditFamilyRecords\(home\.family\)/)
  assertGuestWriteEntries(dashboardSource, [
    'goAddMember',
    'handleMedicine',
    'goMedicinePhoto',
    'goQuickIllness',
    'addCourseEvent',
    'goCourseMedication',
    'createMedication',
  ])

  assert.match(illnessTemplate, /<button class="primary-btn add-btn" wx:if="\{\{showWriteEntries\}\}"/)
  assert.match(illnessTemplate, /<view class="card-actions" wx:if="\{\{showWriteEntries\}\}">/)
  assert.match(illnessSource, /const canEditRecords = canEditFamilyRecords\(home\.family\)/)
  assertGuestWriteEntries(illnessSource, ['createRecord', 'editRecord', 'appendRecord', 'quickSimilar'])

  assert.match(medicinesTemplate, /<button class="primary-btn add-btn" wx:if="\{\{showWriteEntries\}\}"/)
  assert.match(medicinesTemplate, /<view class="medicine-actions" wx:if="\{\{showWriteEntries\}\}">/)
  assert.match(medicinesSource, /const canEditRecords = canEditFamilyRecords\(home\.family\)/)
  assertGuestWriteEntries(medicinesSource, ['createMedicine', 'editMedicine', 'useMedicine', 'remove'])

  ;[dashboardSource, illnessSource, medicinesSource].forEach((source) => {
    assert.match(source, /showGuest(?:Home|State)\(\)[\s\S]*showWriteEntries:\s*true/)
    assert.match(source, /showWriteEntries:\s*canEditRecords/)
  })
  assert.match(guardSource, /async function ensureFamilyWriteAccess\(canEditRecords\)[\s\S]*await ensureLoginReady\(\)/)
  assert.match(medicationTemplate, /wx:if="\{\{!loggedIn \|\| canEdit\}\}"/)
  assert.match(profileTemplate, /<view class="family-card" bindtap="openFamily">/)
  assert.doesNotMatch(profileTemplate, /<view wx:if="\{\{loggedIn\}\}" class="family-card"/)
  assert.match(profileSource, /async navigateWithLogin\(url\)[\s\S]*await ensureLoginReady\(\)/)
})

test('family member modal scrolls its body while keeping the action bar outside', () => {
  const template = read('miniprogram/pages/family/index.wxml')
  const styles = read('miniprogram/pages/family/index.wxss')
  const scrollStart = template.indexOf('<scroll-view class="member-modal-scroll"')
  const scrollEnd = template.indexOf('</scroll-view>', scrollStart)
  const actionsStart = template.indexOf('<view class="modal-actions">')

  assert.ok(scrollStart > 0)
  assert.ok(scrollEnd > scrollStart)
  assert.ok(actionsStart > scrollEnd)
  assert.match(template, /<scroll-view class="member-modal-scroll" scroll-y enhanced show-scrollbar="\{\{false\}\}">/)
  assert.match(styles, /\.member-modal\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*overflow:\s*hidden;/)
  assert.match(styles, /\.member-modal-scroll\s*\{[\s\S]*flex:\s*1;[\s\S]*min-height:\s*0;[\s\S]*height:\s*0;/)
  assert.match(styles, /\.modal-actions\s*\{[\s\S]*flex:\s*0 0 auto;[\s\S]*safe-area-inset-bottom/)
})

function assertGuestWriteEntries(source, methodNames) {
  methodNames.forEach((methodName) => {
    const methodStart = source.indexOf(`${methodName}(`)
    assert.ok(methodStart >= 0, `${methodName} should exist`)
    const methodBody = source.slice(methodStart, methodStart + 220)
    assert.match(methodBody, /ensureFamilyWriteAccess\(this\.data\.canEditRecords\)/)
  })
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}
