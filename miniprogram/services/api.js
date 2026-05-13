const demo = require('./demo-data')

async function callHealthApi(action, payload = {}) {
  const app = getApp()
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

function shouldUseDemoData() {
  const app = getApp()
  return !!(app.globalData && app.globalData.useDemoData)
}

async function callHealthOrDemo(action, payload = {}, demoHandler) {
  if (shouldUseDemoData() && demoHandler) {
    return demoHandler(payload)
  }
  try {
    return await callHealthApi(action, payload)
  } catch (error) {
    if (demoHandler && isDemoFallbackError(error)) {
      console.warn(`use demo data for ${action}`, error)
      return demoHandler(payload)
    }
    throw error
  }
}

async function callPaymentOrDemo(action, payload = {}, demoHandler) {
  if (shouldUseDemoData() && demoHandler) {
    return demoHandler(payload)
  }
  try {
    return await callPaymentApi(action, payload)
  } catch (error) {
    if (demoHandler && isDemoFallbackError(error)) {
      console.warn(`use demo payment data for ${action}`, error)
      return demoHandler(payload)
    }
    throw error
  }
}

function isDemoFallbackError(error) {
  const message = (error && error.message) || ''
  return message === '云服务暂不可用' || message === '支付服务暂不可用'
}

async function getHome() {
  return callHealthOrDemo('getHome', {}, demo.getHome)
}

async function listMyFamilies() {
  return callHealthOrDemo('listMyFamilies', {}, demo.listMyFamilies)
}

async function switchFamily(familyId) {
  return callHealthOrDemo('switchFamily', { familyId }, demo.listMyFamilies)
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

async function deleteIllness(id) {
  return callHealthOrDemo('deleteIllness', { id }, () => demo.deleteIllness(id))
}

async function saveMedication(payload) {
  return callHealthOrDemo('saveMedication', payload, demo.saveMedication)
}

async function deleteMedication(id) {
  return callHealthOrDemo('deleteMedication', { id }, () => demo.deleteMedication(id))
}

async function saveAttachment(payload) {
  return callHealthOrDemo('saveAttachment', payload, demo.saveAttachment)
}

async function saveReminder(payload) {
  return callHealthOrDemo('saveReminder', payload, demo.saveReminder)
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

async function exportData() {
  return callHealthOrDemo('exportData', {}, demo.exportData)
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

async function mockPaymentSuccess(payload) {
  return callPaymentOrDemo('mockPaymentSuccess', payload, demo.mockPaymentSuccess)
}

module.exports = {
  assistantQuery,
  acceptFamilyInvite,
  applyCoupon,
  createOrder,
  createFamilyInvite,
  deleteIllness,
  deleteMedication,
  deleteMedicine,
  deleteMember,
  exportData,
  getFamilyInvite,
  getHome,
  getAiTask,
  getMembershipStatus,
  getPlans,
  listFamilyRoles,
  listCouponsForUser,
  listMyFamilies,
  mockPaymentSuccess,
  previewOrder,
  parseAttachment,
  removeFamilyUser,
  confirmAiParseResult,
  saveAttachment,
  saveIllness,
  saveMedication,
  saveMedicine,
  saveMember,
  saveReminder,
  switchFamily,
  updateFamilyRole,
  exportReport,
}
