async function callHealthApi(action, payload = {}) {
  const result = await wx.cloud.callFunction({
    name: 'healthApi',
    data: {
      action,
      payload,
    },
  })

  if (!result.result || !result.result.ok) {
    throw new Error((result.result && result.result.message) || '云函数调用失败')
  }

  return result.result.data
}

async function getHome() {
  return callHealthApi('getHome')
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

module.exports = {
  assistantQuery,
  deleteIllness,
  deleteMedication,
  deleteMedicine,
  deleteMember,
  exportData,
  getHome,
  saveAttachment,
  saveIllness,
  saveMedication,
  saveMedicine,
  saveMember,
  saveReminder,
}
