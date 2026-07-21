const demo = require('./demo-data')

const HOME_CACHE_TTL_MS = 15 * 1000
const HOME_MUTATION_ACTIONS = new Set([
  'acceptFamilyInvite',
  'completeIllness',
  'completeReminder',
  'confirmAiParseResult',
  'createFamily',
  'deleteIllness',
  'deleteMedication',
  'deleteMedicine',
  'deleteMember',
  'deleteReminder',
  'deleteAttachment',
  'removeFamilyUser',
  'parseAttachment',
  'saveAttachment',
  'saveCourseEvent',
  'saveIllness',
  'saveMedication',
  'saveMedicine',
  'saveMember',
  'saveReminder',
  'switchFamily',
  'updateFamilyRole',
  'updateUserProfile',
])
const HOME_PAYMENT_MUTATION_ACTIONS = new Set(['redeemMembershipCode'])

let homeCache = null
let homeCacheFamilyId = ''
let homeCacheTime = 0
let homeCacheGeneration = 0
let homeRequest = null

async function callHealthApi(action, payload = {}) {
  const app = getApp()
  await ensureCloudLogin(app)
  const currentFamilyId = app.globalData && app.globalData.currentFamilyId
  let result
  try {
    result = await wx.cloud.callFunction({
      name: 'healthApi',
      data: {
        action,
        familyId: payload.familyId || currentFamilyId || '',
        payload,
      },
    })
  } catch (error) {
    console.error('healthApi call failed', action, error)
    throw new Error(normalizeCloudError(error, '云服务暂不可用'))
  }

  if (!result.result || !result.result.ok) {
    throw new Error((result.result && result.result.message) || '服务暂不可用，请稍后再试')
  }

  const data = result.result.data
  if (data && data.currentFamilyId && app.globalData) {
    app.globalData.currentFamilyId = data.currentFamilyId
  }
  if (data && data.family && data.family._id && app.globalData && !app.globalData.currentFamilyId) {
    app.globalData.currentFamilyId = data.family._id
  }
  return data
}

async function callPaymentApi(action, payload = {}) {
  const app = getApp()
  await ensureCloudLogin(app)
  const currentFamilyId = app.globalData && app.globalData.currentFamilyId
  let result
  try {
    result = await wx.cloud.callFunction({
      name: 'paymentApi',
      data: {
        action,
        payload: {
          ...payload,
          familyId: payload.familyId || currentFamilyId || '',
        },
      },
    })
  } catch (error) {
    console.error('paymentApi call failed', action, error)
    throw new Error(normalizeCloudError(error, '支付服务暂不可用'))
  }

  if (!result.result || !result.result.ok) {
    throw new Error((result.result && result.result.message) || '支付服务暂不可用，请稍后再试')
  }

  return result.result.data
}

function normalizeCloudError(error, fallback) {
  const message = (error && (error.errMsg || error.message)) || String(error || '')
  if (!message) {
    return fallback
  }
  if (
    message.includes('operateWXData') ||
    message.includes('cloud.callFunction:fail') ||
    message.includes('system error') ||
    message.length > 60
  ) {
    return fallback
  }
  return message
}

async function ensureCloudLogin(app) {
  if (app && typeof app.ensureLogin === 'function') {
    await app.ensureLogin()
  }
}

function shouldUseDemoData() {
  const app = getApp()
  return !!(app.globalData && app.globalData.useDemoData)
}

async function callHealthOrDemo(action, payload = {}, demoHandler) {
  const app = getApp()
  await ensureCloudLogin(app)
  let data
  if (shouldUseDemoData() && demoHandler) {
    data = await demoHandler(payload)
  } else {
    data = await callHealthApi(action, payload)
  }
  if (HOME_MUTATION_ACTIONS.has(action)) {
    invalidateHomeCache()
  }
  return data
}

async function callPaymentOrDemo(action, payload = {}, demoHandler) {
  const app = getApp()
  await ensureCloudLogin(app)
  let data
  if (shouldUseDemoData() && demoHandler) {
    data = await demoHandler(payload)
  } else {
    data = await callPaymentApi(action, payload)
  }
  if (HOME_PAYMENT_MUTATION_ACTIONS.has(action)) {
    invalidateHomeCache()
  }
  return data
}

async function getHome(options = {}) {
  const familyId = getCurrentFamilyId()
  if (!options.force && isHomeCacheFresh(familyId)) {
    return homeCache
  }
  if (!options.force && homeRequest && homeRequest.familyId === familyId) {
    return homeRequest.promise
  }

  const generation = homeCacheGeneration
  const promise = callHealthOrDemo('getHome', {}, demo.getHome)
    .then((data) => {
      if (generation === homeCacheGeneration && familyId === getCurrentFamilyId()) {
        homeCache = data
        homeCacheFamilyId = familyId
        homeCacheTime = Date.now()
      }
      return data
    })
    .finally(() => {
      if (homeRequest && homeRequest.promise === promise) {
        homeRequest = null
      }
    })
  homeRequest = { familyId, promise }
  return promise
}

function isHomeCacheFresh(familyId = getCurrentFamilyId()) {
  return !!homeCache
    && homeCacheFamilyId === familyId
    && Date.now() - homeCacheTime < HOME_CACHE_TTL_MS
}

function invalidateHomeCache() {
  homeCache = null
  homeCacheFamilyId = ''
  homeCacheTime = 0
  homeCacheGeneration += 1
  homeRequest = null
}

function getCurrentFamilyId() {
  const app = getApp()
  return (app.globalData && app.globalData.currentFamilyId) || ''
}

async function updateUserProfile(payload) {
  return callHealthOrDemo('updateUserProfile', payload, demo.updateUserProfile)
}

async function listMyFamilies() {
  return callHealthOrDemo('listMyFamilies', {}, demo.listMyFamilies)
}

async function switchFamily(familyId) {
  return callHealthOrDemo('switchFamily', { familyId }, demo.switchFamily)
}

async function createFamily(payload) {
  return callHealthOrDemo('createFamily', payload, demo.createFamily)
}

async function getMembershipStatus() {
  return callHealthOrDemo('getMembershipStatus', {}, demo.getMembershipStatus)
}

async function getFamilyInvite(inviteCode) {
  return callHealthOrDemo('getFamilyInvite', { inviteCode }, demo.getFamilyInvite)
}

async function createFamilyInvite(payload) {
  return callHealthOrDemo('createFamilyInvite', payload, demo.createFamilyInvite)
}

async function acceptFamilyInvite(inviteCode) {
  return callHealthOrDemo('acceptFamilyInvite', { inviteCode }, demo.acceptFamilyInvite)
}

async function listFamilyRoles() {
  return callHealthOrDemo('listFamilyRoles', {}, demo.listFamilyRoles)
}

async function updateFamilyRole(payload) {
  return callHealthOrDemo('updateFamilyRole', payload, demo.updateFamilyRole)
}

async function removeFamilyUser(openid) {
  return callHealthOrDemo('removeFamilyUser', { openid }, () => demo.removeFamilyUser(openid))
}

async function saveMember(payload) {
  return callHealthOrDemo('saveMember', payload, demo.saveMember)
}

async function deleteMember(id) {
  return callHealthOrDemo('deleteMember', { id }, () => demo.deleteMember(id))
}

async function saveMedicine(payload) {
  return callHealthOrDemo('saveMedicine', payload, demo.saveMedicine)
}

async function deleteMedicine(id) {
  return callHealthOrDemo('deleteMedicine', { id }, () => demo.deleteMedicine(id))
}

async function saveIllness(payload) {
  return callHealthOrDemo('saveIllness', payload, demo.saveIllness)
}

async function completeIllness(payload) {
  return callHealthOrDemo('completeIllness', payload, demo.completeIllness)
}

async function saveCourseEvent(payload) {
  return callHealthOrDemo('saveCourseEvent', payload, demo.saveCourseEvent)
}

async function deleteIllness(id) {
  return callHealthOrDemo('deleteIllness', { id }, () => demo.deleteIllness(id))
}

async function saveMedication(payload) {
  return callHealthOrDemo('saveMedication', payload, demo.saveMedication)
}

async function listMedicationHistory() {
  return callHealthOrDemo('listMedicationHistory', {}, demo.listMedicationHistory)
}

async function deleteMedication(id) {
  return callHealthOrDemo('deleteMedication', { id }, () => demo.deleteMedication(id))
}

async function saveAttachment(payload) {
  return callHealthOrDemo('saveAttachment', payload, demo.saveAttachment)
}

async function deleteAttachment(id) {
  return callHealthOrDemo('deleteAttachment', { id }, () => demo.deleteAttachment(id))
}

async function saveReminder(payload) {
  return callHealthOrDemo('saveReminder', payload, demo.saveReminder)
}

async function completeReminder(id) {
  return callHealthOrDemo('completeReminder', { id }, () => demo.completeReminder(id))
}

async function deleteReminder(id) {
  return callHealthOrDemo('deleteReminder', { id }, () => demo.deleteReminder(id))
}

async function saveFeedback(payload) {
  return callHealthOrDemo('saveFeedback', payload, demo.saveFeedback)
}

async function parseAttachment(payload) {
  return callHealthOrDemo('parseAttachment', payload, demo.parseAttachment)
}

async function getAiTask(taskId) {
  return callHealthOrDemo('getAiTask', { taskId }, () => ({ task: { _id: taskId, status: 'success' } }))
}

async function confirmAiParseResult(payload) {
  return callHealthOrDemo('confirmAiParseResult', payload, demo.confirmAiParseResult)
}

async function assistantQuery(question) {
  return callHealthOrDemo('assistantQuery', { question }, () => demo.assistantQuery(question))
}

async function exportReport(payload = {}) {
  return callHealthOrDemo('exportReport', payload, demo.exportReport)
}

async function getPlans() {
  return callPaymentOrDemo('getPlans', {}, demo.getPlans)
}

async function listCouponsForUser(payload = {}) {
  return callPaymentOrDemo('listCouponsForUser', payload, demo.listCouponsForUser)
}

async function previewOrder(payload) {
  return callPaymentOrDemo('previewOrder', payload, demo.previewOrder)
}

async function createOrder(payload) {
  return callPaymentOrDemo('createOrder', payload, demo.createOrder)
}

async function applyCoupon(payload) {
  return callPaymentOrDemo('applyCoupon', payload, demo.applyCoupon)
}

async function redeemMembershipCode(payload) {
  return callPaymentOrDemo('redeemMembershipCode', payload, demo.redeemMembershipCode)
}

module.exports = {
  assistantQuery,
  acceptFamilyInvite,
  applyCoupon,
  completeIllness,
  completeReminder,
  createOrder,
  createFamilyInvite,
  createFamily,
  deleteIllness,
  deleteMedication,
  deleteMedicine,
  deleteMember,
  deleteReminder,
  deleteAttachment,
  getFamilyInvite,
  getHome,
  invalidateHomeCache,
  isHomeCacheFresh,
  getAiTask,
  getMembershipStatus,
  getPlans,
  listFamilyRoles,
  listMedicationHistory,
  listCouponsForUser,
  listMyFamilies,
  previewOrder,
  parseAttachment,
  redeemMembershipCode,
  removeFamilyUser,
  confirmAiParseResult,
  saveAttachment,
  saveCourseEvent,
  saveFeedback,
  saveIllness,
  saveMedication,
  saveMedicine,
  saveMember,
  saveReminder,
  switchFamily,
  updateFamilyRole,
  updateUserProfile,
  exportReport,
}
