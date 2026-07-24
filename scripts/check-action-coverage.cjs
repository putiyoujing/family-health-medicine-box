const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()

const expected = {
  'cloudfunctions/healthApi/index.js': {
    getHome: ['getHome'],
    updateUserProfile: ['updateUserProfile'],
    listMyFamilies: ['listMyFamilies'],
    switchFamily: ['switchFamily'],
    getMembershipStatus: ['getMembershipStatus'],
    getFamilyInvite: ['getFamilyInvite'],
    createFamilyInvite: ['createFamilyInvite'],
    acceptFamilyInvite: ['acceptFamilyInvite'],
    listFamilyRoles: ['listFamilyRoles'],
    updateFamilyRole: ['updateFamilyRole'],
    removeFamilyUser: ['removeFamilyUser'],
    saveMember: ['saveRecord'],
    deleteMember: ['deleteRecord'],
    saveMedicine: ['saveRecord'],
    deleteMedicine: ['deleteRecord'],
    saveIllness: ['saveIllness'],
    deleteIllness: ['deleteRecord'],
    saveCourseEvent: ['saveCourseEvent'],
    deleteCourseEvent: ['deleteRecord'],
    saveMedication: ['saveMedication'],
    deleteMedication: ['deleteMedication'],
    saveAttachment: ['saveRecord'],
    deleteAttachment: ['deleteRecord'],
    saveReminder: ['saveRecord'],
    completeReminder: ['completeReminder'],
    deleteReminder: ['deleteRecord'],
    saveFeedback: ['saveFeedback'],
    parseAttachment: ['parseAttachment'],
    getAiTask: ['getAiTask'],
    confirmAiParseResult: ['confirmAiParseResult'],
    assistantQuery: ['assistantQuery'],
    exportReport: ['exportReport'],
  },
  'cloudfunctions/paymentApi/index.js': {
    getPlans: ['getPlans'],
    previewOrder: ['previewOrder'],
    createOrder: ['createOrder'],
    applyCoupon: ['applyCoupon'],
    redeemMembershipCode: ['redeemMembershipCode'],
    listCouponsForUser: ['listCouponsForUser'],
    mockPaymentSuccess: ['mockPaymentSuccess'],
  },
  'cloudfunctions/adminApi/index.js': {
    getDashboard: ['getDashboard'],
    getDataOverview: ['getDataOverview'],
    getMembershipSettings: ['getMembershipSettings'],
    updateMembershipSettings: ['updateMembershipSettings'],
    listUsers: ['pageList'],
    listFamilies: ['pageList'],
    listMedicines: ['pageList'],
    listIllness: ['pageList'],
    listMedication: ['pageList'],
    listAttachments: ['pageList'],
    listFeedback: ['pageList'],
    listOrders: ['pageList'],
    listSubscriptions: ['pageList'],
    listCoupons: ['pageList'],
    listCouponCodeBatches: ['pageList'],
    listCouponCodes: ['pageList'],
    listAiUsage: ['pageList'],
    createCoupon: ['createCoupon'],
    updateCoupon: ['updateCoupon'],
    batchGenerateCouponCodes: ['batchGenerateCouponCodes'],
    exportCouponCodes: ['exportCouponCodes'],
    markCouponCodeIssued: ['markCouponCodeIssued'],
    disableCouponCodeBatch: ['disableCouponCodeBatch'],
  },
}

const failures = []

for (const [relativeFile, actions] of Object.entries(expected)) {
  const file = path.join(root, relativeFile)
  const source = fs.readFileSync(file, 'utf8')

  for (const [action, implementations] of Object.entries(actions)) {
    const actionPattern = new RegExp(`case ['"]${escapeRegExp(action)}['"]`)
    const functionPattern = new RegExp(
      implementations
        .map((name) => `function\\s+${escapeRegExp(name)}\\b|const\\s+${escapeRegExp(name)}\\b`)
        .join('|'),
    )
    if (!actionPattern.test(source)) {
      failures.push(`${relativeFile}: missing switch case for ${action}`)
    }
    if (!functionPattern.test(source)) {
      failures.push(`${relativeFile}: missing implementation function for ${action} (${implementations.join(' or ')})`)
    }
  }
}

if (failures.length) {
  console.error('Action coverage check failed:')
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

const totalActions = Object.values(expected).reduce((sum, actions) => sum + Object.keys(actions).length, 0)
console.log(`Action coverage check passed for ${totalActions} cloud function actions`)

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
