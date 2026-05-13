export type Gender = 'female' | 'male' | 'other'

export type IllnessStatus = '观察中' | '已就医' | '已恢复'

export type MedicineSource = '医生开具' | '自购' | '药箱'

export interface FamilyMember {
  id: string
  name: string
  relation: string
  birthday: string
  gender: Gender
  allergyHistory: string
  medicalHistory: string
  note: string
  createdAt: string
}

export interface Medicine {
  id: string
  name: string
  category: string
  specification: string
  totalQuantity: number
  remainingQuantity: number
  unit: string
  expireDate: string
  location: string
  source: MedicineSource
  indicationsText: string
  instructionText: string
  note: string
  createdAt: string
  updatedAt: string
}

export interface IllnessRecord {
  id: string
  memberId: string
  startedAt: string
  endedAt: string
  symptoms: string[]
  symptomDescription: string
  temperatureMax: number | null
  hospitalName: string
  doctorDiagnosis: string
  doctorAdvice: string
  examinationResult: string
  status: IllnessStatus
  summary: string
  createdAt: string
  updatedAt: string
}

export interface MedicationLog {
  id: string
  memberId: string
  illnessRecordId: string
  medicineId: string
  medicineNameSnapshot: string
  doseQuantity: number
  doseUnit: string
  takenAt: string
  frequencyText: string
  wasPlanned: boolean
  reaction: string
  note: string
  createdAt: string
}

export interface AppData {
  familyName: string
  members: FamilyMember[]
  medicines: Medicine[]
  illnessRecords: IllnessRecord[]
  medicationLogs: MedicationLog[]
}

export interface AssistantResult {
  intent: string
  answer: string
  facts: string[]
  reminders: string[]
}
