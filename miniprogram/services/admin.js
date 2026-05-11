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

module.exports = {
  getDashboard,
  listAttachments,
  listFamilies,
  listIllness,
  listMedication,
  listMedicines,
  listUsers,
}
