const kindOptions = [
  { label: '病例 / 问诊', value: 'medical_record' },
  { label: '外包装 / 药瓶', value: 'medicine_box' },
  { label: '药品说明书', value: 'instruction' },
  { label: '处方 / 医嘱', value: 'prescription' },
  { label: '检查单', value: 'examination' },
]

const fieldSets = {
  medical_record: [
    { key: 'doctorDiagnosis', label: '医生记录', placeholder: '按病例原文整理' },
    { key: 'doctorAdvice', label: '医嘱', placeholder: '按病例或医嘱原文整理' },
    { key: 'summary', label: '病例摘要', placeholder: '可选' },
  ],
  medicine_box: [
    { key: 'name', label: '药品名称', placeholder: '请确认药品名称' },
    { key: 'specification', label: '规格', placeholder: '例如 100ml/瓶' },
    { key: 'expireDate', label: '有效期', placeholder: '例如 2027-12-31' },
    { key: 'manufacturer', label: '厂家', placeholder: '可选' },
    { key: 'approvalNo', label: '批准文号', placeholder: '可选' },
  ],
  instruction: [
    { key: 'name', label: '药品名称', placeholder: '请确认药品名称' },
    { key: 'instructionText', label: '说明书重点', placeholder: '用法、注意事项等原文整理' },
    { key: 'contraindications', label: '禁忌/注意', placeholder: '可选' },
  ],
  prescription: [
    { key: 'doctorDiagnosis', label: '医生记录', placeholder: '按处方或医嘱原文整理' },
    { key: 'doctorAdvice', label: '医嘱', placeholder: '请人工确认' },
    { key: 'medicinesText', label: '处方药品', placeholder: '药名、规格、用法用量；请逐项核对' },
    { key: 'summary', label: '就医摘要', placeholder: '可选' },
  ],
  examination: [
    { key: 'examinationResult', label: '检查结果', placeholder: '检查项目、结果、单位、参考范围' },
    { key: 'summary', label: '检查摘要', placeholder: '可选' },
  ],
}

function buildFields(imageKind, output = {}) {
  return (fieldSets[imageKind] || fieldSets.medicine_box).map((field) => ({
    ...field,
    value: output[field.key] || '',
  }))
}

function fieldsToObject(fields) {
  return (fields || []).reduce((data, field) => {
    data[field.key] = field.value || ''
    return data
  }, {})
}

module.exports = {
  buildFields,
  fieldsToObject,
  fieldSets,
  kindOptions,
}
