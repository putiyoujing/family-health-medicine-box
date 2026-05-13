import { defaultData, SAFETY_NOTICE, STORAGE_KEY } from './data'
import type {
  AppData,
  AssistantResult,
  FamilyMember,
  IllnessRecord,
  MedicationLog,
  Medicine,
} from './types'

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function todayInputValue() {
  const date = new Date()
  const offset = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function loadData(): AppData {
  if (typeof window === 'undefined') {
    return defaultData
  }

  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (!saved) {
    return defaultData
  }

  try {
    return { ...defaultData, ...JSON.parse(saved) } as AppData
  } catch {
    return defaultData
  }
}

export function saveData(data: AppData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function resetData() {
  window.localStorage.removeItem(STORAGE_KEY)
  return defaultData
}

export function getMemberName(members: FamilyMember[], memberId: string) {
  return members.find((member) => member.id === memberId)?.name ?? '未选择成员'
}

export function getMedicineName(medicines: Medicine[], medicineId: string) {
  return medicines.find((medicine) => medicine.id === medicineId)?.name ?? '未选择药品'
}

export function getIllnessTitle(
  illnessRecords: IllnessRecord[],
  illnessRecordId: string,
) {
  const record = illnessRecords.find((item) => item.id === illnessRecordId)
  if (!record) {
    return '未关联健康记录'
  }
  return `${formatDateTime(record.startedAt)} ${record.symptoms.join('、') || '健康记录'}`
}

export function formatDate(value: string) {
  if (!value) {
    return '未记录'
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

export function formatDateTime(value: string) {
  if (!value) {
    return '未记录'
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function daysUntil(dateValue: string) {
  if (!dateValue) {
    return Number.POSITIVE_INFINITY
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateValue)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000)
}

export function inventoryRatio(medicine: Medicine) {
  if (medicine.totalQuantity <= 0) {
    return 0
  }
  return Math.max(0, Math.min(100, (medicine.remainingQuantity / medicine.totalQuantity) * 100))
}

export function isLowStock(medicine: Medicine) {
  return medicine.remainingQuantity <= Math.max(1, medicine.totalQuantity * 0.25)
}

export function isExpiringSoon(medicine: Medicine) {
  const days = daysUntil(medicine.expireDate)
  return days <= 60
}

export function addMedicationLog(data: AppData, log: MedicationLog): AppData {
  const medicines = data.medicines.map((medicine) => {
    if (medicine.id !== log.medicineId) {
      return medicine
    }

    return {
      ...medicine,
      remainingQuantity: Math.max(0, medicine.remainingQuantity - log.doseQuantity),
      updatedAt: new Date().toISOString(),
    }
  })

  return {
    ...data,
    medicines,
    medicationLogs: [log, ...data.medicationLogs],
  }
}

export function buildAssistantAnswer(data: AppData, question: string): AssistantResult {
  const normalized = question.trim().toLowerCase()
  const facts: string[] = []
  const reminders = [SAFETY_NOTICE]

  if (!normalized) {
    return {
      intent: '等待问题',
      answer: '输入一个问题后，我会只基于当前家庭记录做检索和整理。',
      facts,
      reminders,
    }
  }

  if (containsAny(normalized, ['肺炎', '诊断', '是不是', '该吃', '剂量', '换药', '停药'])) {
    return {
      intent: '医疗诊断或处方风险',
      answer:
        '这个问题涉及诊断、处方或剂量判断，系统不能替代医生回答。你可以继续补充医生医嘱、检查单或历史记录，我可以帮你整理成便于复诊沟通的摘要。',
      facts: ['已触发医疗安全边界，未给出诊断或用药建议。'],
      reminders,
    }
  }

  if (containsAny(normalized, ['过期', '快过期', '有效期'])) {
    const expiring = data.medicines
      .filter(isExpiringSoon)
      .sort((a, b) => daysUntil(a.expireDate) - daysUntil(b.expireDate))
    facts.push(
      ...expiring.map(
        (medicine) =>
          `${medicine.name}：有效期 ${formatDate(medicine.expireDate)}，剩余 ${medicine.remainingQuantity}${medicine.unit}`,
      ),
    )

    return {
      intent: '药品有效期查询',
      answer: expiring.length
        ? `当前有 ${expiring.length} 个药品在 60 天内到期或已过期。`
        : '当前没有 60 天内到期的药品记录。',
      facts,
      reminders,
    }
  }

  if (containsAny(normalized, ['有没有', '还剩', '常备', '退烧', '咳嗽', '鼻炎', '腹泻', '药'])) {
    const matches = data.medicines.filter((medicine) => {
      const haystack = [
        medicine.name,
        medicine.category,
        medicine.indicationsText,
        medicine.location,
      ]
        .join(' ')
        .toLowerCase()
      return normalized
        .split(/\s+/)
        .filter(Boolean)
        .some((word) => haystack.includes(word)) || haystack.includes(normalized)
    })
    const fallback = matches.length ? matches : data.medicines.slice(0, 5)
    facts.push(
      ...fallback.map(
        (medicine) =>
          `${medicine.name}：${medicine.category}，剩余 ${medicine.remainingQuantity}${medicine.unit}，位置 ${medicine.location}`,
      ),
    )

    return {
      intent: '常备记录查询',
      answer: matches.length
        ? `根据家庭常备记录，找到 ${matches.length} 个相关记录。`
        : '没有精确匹配的记录，我先列出当前家庭常备信息中最相关的记录供你核对。',
      facts,
      reminders,
    }
  }

  if (containsAny(normalized, ['上次', '什么时候', '发烧', '咳嗽', '不舒服', '健康记录', '吃了什么'])) {
    const latestIllness = [...data.illnessRecords].sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )[0]
    const logs = data.medicationLogs.filter(
      (log) => log.illnessRecordId === latestIllness?.id,
    )

    if (latestIllness) {
      facts.push(
        `最近健康记录：${formatDateTime(latestIllness.startedAt)}，症状 ${latestIllness.symptoms.join('、') || '未填'}，状态 ${latestIllness.status}`,
        `最高体温：${latestIllness.temperatureMax ?? '未记录'}`,
        `本次总结：${latestIllness.summary || '未填写'}`,
      )
      facts.push(
        ...logs.map(
          (log) =>
            `${formatDateTime(log.takenAt)} 使用 ${log.medicineNameSnapshot} ${log.doseQuantity}${log.doseUnit}，反应：${log.reaction || '未记录'}`,
        ),
      )
    }

    return {
      intent: '健康与用药历史查询',
      answer: latestIllness
        ? '我按最近一条健康记录整理了历史情况和关联用药记录。'
        : '当前还没有健康记录。',
      facts,
      reminders,
    }
  }

  return {
    intent: '通用记录整理',
    answer:
      '我可以基于已录入的家庭成员、健康记录、用药记录和常备信息做检索。当前问题没有命中明确分类，你可以尝试问“哪些常备用品快到期”“上次孩子咳嗽吃了什么”“这个药还剩多少”。',
    facts: [
      `当前成员 ${data.members.length} 位，药品 ${data.medicines.length} 个，健康记录 ${data.illnessRecords.length} 条，用药记录 ${data.medicationLogs.length} 条。`,
    ],
    reminders,
  }
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword))
}
