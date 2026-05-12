async function callAdminApi(action, payload = {}) {
  const result = await wx.cloud.callFunction({
    name: 'adminApi',
    data: {
      action,
      payload,
    },
  })

  if (!result.result || !result.result.ok) {
    throw new Error((result.result && result.result.message) || '管理后台调用失败')
  }

  return result.result.data
}

async function getDashboard() {
  return callAdminApi('getDashboard')
}

async function listUsers(payload) {
  return callAdminApi('listUsers', payload)
}

async function listFamilies(payload) {
  return callAdminApi('listFamilies', payload)
}

async function listMedicines(payload) {
  return callAdminApi('listMedicines', payload)
}

async function listIllness(payload) {
  return callAdminApi('listIllness', payload)
}

async function listMedication(payload) {
  return callAdminApi('listMedication', payload)
}

async function listAttachments(payload) {
  return callAdminApi('listAttachments', payload)
}

async function listOrders(payload) {
  return callAdminApi('listOrders', payload)
}

async function listSubscriptions(payload) {
  return callAdminApi('listSubscriptions', payload)
}

async function listCoupons(payload) {
  return callAdminApi('listCoupons', payload)
}

async function listAiUsage(payload) {
  return callAdminApi('listAiUsage', payload)
}

module.exports = {
  getDashboard,
  listAiUsage,
  listAttachments,
  listCoupons,
  listFamilies,
  listIllness,
  listMedication,
  listMedicines,
  listOrders,
  listSubscriptions,
  listUsers,
}
