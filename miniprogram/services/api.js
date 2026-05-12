async function callHealthApi(action, payload = {}) {
  const app = getApp()
  const currentFamilyId = app.globalData && app.globalData.currentFamilyId
  const result = await wx.cloud.callFunction({
    name: 'healthApi',
    data: {
      action,
      familyId: payload.familyId || currentFamilyId || '',
      payload,
    },
  })

  if (!result.result || !result.result.ok) {
    throw new Error((result.result && result.result.message) || '云函数调用失败')
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
  const result = await wx.cloud.callFunction({
    name: 'paymentApi',
    data: {
      action,
      payload: {
        ...payload,
        familyId: payload.familyId || currentFamilyId || '',
      },
    },
  })

  if (!result.result || !result.result.ok) {
    throw new Error((result.result && result.result.message) || '支付云函数调用失败')
  }

  return result.result.data
}

async function getHome() {
  return callHealthApi('getHome')
}

async function listMyFamilies() {
  return callHealthApi('listMyFamilies')
}

async function switchFamily(familyId) {
  return callHealthApi('switchFamily', { familyId })
}

async function getMembershipStatus() {
  return callHealthApi('getMembershipStatus')
}

async function getFamilyInvite(inviteCode) {
  return callHealthApi('getFamilyInvite', { inviteCode })
}

async function createFamilyInvite(payload) {
  return callHealthApi('createFamilyInvite', payload)
}

async function acceptFamilyInvite(inviteCode) {
  return callHealthApi('acceptFamilyInvite', { inviteCode })
}

async function listFamilyRoles() {
  return callHealthApi('listFamilyRoles')
}

async function updateFamilyRole(payload) {
  return callHealthApi('updateFamilyRole', payload)
}

async function removeFamilyUser(openid) {
  return callHealthApi('removeFamilyUser', { openid })
}

async function saveMember(payload) {
  return callHealthApi('saveMember', payload)
}

async function deleteMember(id) {
  return callHealthApi('deleteMember', { id })
}

async function saveMedicine(payload) {
  return callHealthApi('saveMedicine', payload)
}

async function deleteMedicine(id) {
  return callHealthApi('deleteMedicine', { id })
}

async function saveIllness(payload) {
  return callHealthApi('saveIllness', payload)
}

async function deleteIllness(id) {
  return callHealthApi('deleteIllness', { id })
}

async function saveMedication(payload) {
  return callHealthApi('saveMedication', payload)
}

async function deleteMedication(id) {
  return callHealthApi('deleteMedication', { id })
}

async function saveAttachment(payload) {
  return callHealthApi('saveAttachment', payload)
}

async function saveReminder(payload) {
  return callHealthApi('saveReminder', payload)
}

async function assistantQuery(question) {
  return callHealthApi('assistantQuery', { question })
}

async function exportData() {
  return callHealthApi('exportData')
}

async function getPlans() {
  return callPaymentApi('getPlans')
}

async function listCouponsForUser(payload = {}) {
  return callPaymentApi('listCouponsForUser', payload)
}

async function previewOrder(payload) {
  return callPaymentApi('previewOrder', payload)
}

async function createOrder(payload) {
  return callPaymentApi('createOrder', payload)
}

async function applyCoupon(payload) {
  return callPaymentApi('applyCoupon', payload)
}

async function mockPaymentSuccess(payload) {
  return callPaymentApi('mockPaymentSuccess', payload)
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
  getMembershipStatus,
  getPlans,
  listFamilyRoles,
  listCouponsForUser,
  listMyFamilies,
  mockPaymentSuccess,
  previewOrder,
  removeFamilyUser,
  saveAttachment,
  saveIllness,
  saveMedication,
  saveMedicine,
  saveMember,
  saveReminder,
  switchFamily,
  updateFamilyRole,
}
