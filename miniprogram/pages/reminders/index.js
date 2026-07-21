const api = require('../../services/api')
const { HEALTH_TODO_TEMPLATE_ID } = require('../../utils/constants')
const { formatDateTime, memberName } = require('../../utils/format')
const { ensureHasMembers, ensureLoginReady } = require('../../utils/operation-guards')

const typeOptions = [
  { label: '用药事项', value: 'medication' },
  { label: '复诊事项', value: 'follow_up' },
  { label: '药箱检查事项', value: 'stock_check' },
  { label: '其他', value: 'other' },
]

const emptyForm = {
  _id: '',
  memberId: '',
  illnessRecordId: '',
  type: 'medication',
  title: '',
  remindDate: '',
  remindTime: '',
  remindAt: '',
  note: '',
  notifyEnabled: true,
  preserveSubscription: false,
}

Page({
  data: {
    typeOptions,
    typeIndex: 0,
    family: null,
    members: [],
    memberIndex: 0,
    illnessRecords: [],
    illnessOptions: [{ _id: '', label: '不关联病程' }],
    illnessIndex: 0,
    reminders: [],
    minPlanDate: formatDatePart(new Date()),
    subscriptionConfigured: Boolean(HEALTH_TODO_TEMPLATE_ID),
    form: createDefaultForm(),
  },

  onLoad(options = {}) {
    this.prefillMemberId = options.memberId || ''
    this.prefillIllnessRecordId = options.illnessRecordId || ''
    this.prefillReminderId = options.reminderId || ''
  },

  onShow() {
    this.load()
  },

  async load() {
    try {
      const loggedIn = await ensureLoginReady()
      if (!loggedIn) {
        return
      }
      const home = await api.getHome()
      const members = home.members || []
      const selectedMemberId = selectMemberId(
        members,
        this.prefillMemberId || this.data.form.memberId,
      )
      const illnessOptions = buildIllnessOptions(home.illnessRecords || [], selectedMemberId)
      const illnessRecordId = selectIllnessId(
        illnessOptions,
        this.prefillIllnessRecordId || this.data.form.illnessRecordId,
      )
      this.setData({
        family: home.family || null,
        members,
        memberIndex: Math.max(0, members.findIndex((item) => item._id === selectedMemberId)),
        illnessRecords: home.illnessRecords || [],
        illnessOptions,
        illnessIndex: Math.max(0, illnessOptions.findIndex((item) => item._id === illnessRecordId)),
        'form.memberId': selectedMemberId,
        'form.illnessRecordId': illnessRecordId,
        reminders: buildReminderList(home),
      })
      if (this.prefillReminderId) {
        this.editReminder({ currentTarget: { dataset: { id: this.prefillReminderId } } })
      }
      this.prefillMemberId = ''
      this.prefillIllnessRecordId = ''
      this.prefillReminderId = ''
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' })
    }
  },

  onTypeChange(event) {
    const typeIndex = Number(event.detail.value)
    this.setData({
      typeIndex,
      'form.type': this.data.typeOptions[typeIndex].value,
    })
  },

  onMemberChange(event) {
    const memberIndex = Number(event.detail.value)
    const member = this.data.members[memberIndex]
    const illnessOptions = buildIllnessOptionsForPage(this.data, member ? member._id : '')
    this.setData({
      memberIndex,
      illnessOptions,
      illnessIndex: 0,
      'form.memberId': member ? member._id : '',
      'form.illnessRecordId': '',
    })
  },

  onIllnessChange(event) {
    const illnessIndex = Number(event.detail.value)
    const illness = this.data.illnessOptions[illnessIndex]
    this.setData({
      illnessIndex,
      'form.illnessRecordId': illness ? illness._id : '',
    })
  },

  onNotifyChange(event) {
    this.setData({ 'form.notifyEnabled': Boolean(event.detail.value) })
  },

  onRemindDateChange(event) {
    const remindDate = event.detail.value
    this.setData({
      'form.remindDate': remindDate,
      'form.remindAt': buildRemindAt(remindDate, this.data.form.remindTime),
    })
  },

  onRemindTimeChange(event) {
    const remindTime = event.detail.value
    this.setData({
      'form.remindTime': remindTime,
      'form.remindAt': buildRemindAt(this.data.form.remindDate, remindTime),
    })
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  async save() {
    const loggedIn = await ensureLoginReady()
    if (!loggedIn) {
      return
    }
    if (!ensureHasMembers({ family: this.data.family, members: this.data.members })) {
      return
    }
    const form = this.data.form
    const remindAtMs = parseLocalDateTime(form.remindAt)
    if (!form.memberId) {
      wx.showToast({ title: '请选择家庭成员', icon: 'none' })
      return
    }
    if (!form.title.trim()) {
      wx.showToast({ title: '请填写待办标题', icon: 'none' })
      return
    }
    if (!remindAtMs) {
      wx.showToast({ title: '请选择有效的计划时间', icon: 'none' })
      return
    }
    if (remindAtMs <= Date.now()) {
      wx.showToast({ title: '计划时间必须晚于当前时间', icon: 'none' })
      return
    }

    const preserveSubscription = Boolean(
      form._id && form.notifyEnabled && form.preserveSubscription,
    )
    const subscriptionStatus = preserveSubscription
      ? 'not_requested'
      : form.notifyEnabled
        ? await requestHealthTodoSubscription(HEALTH_TODO_TEMPLATE_ID)
        : 'not_requested'
    const isEditing = Boolean(form._id)
    wx.showLoading({ title: '保存中' })
    try {
      await api.saveReminder({
        _id: form._id,
        memberId: form.memberId,
        illnessRecordId: form.illnessRecordId,
        type: form.type,
        title: form.title.trim(),
        remindAt: form.remindAt,
        note: form.note.trim(),
        status: 'active',
        subscriptionStatus,
        preserveSubscription,
      })
      wx.hideLoading()
      wx.showToast({
        title: isEditing ? '待办已更新' : subscriptionToast(subscriptionStatus),
        icon: isEditing || subscriptionStatus === 'accepted' ? 'success' : 'none',
      })
      this.setData({
        typeIndex: 0,
        illnessIndex: 0,
        form: createDefaultForm(form.memberId),
      })
      this.load()
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  },

  toggleReminder(event) {
    const id = event.currentTarget.dataset.id
    this.setData({
      reminders: this.data.reminders.map((item) =>
        item._id === id && item.hasLongNote ? { ...item, expanded: !item.expanded } : item,
      ),
    })
  },

  editReminder(event) {
    const id = event.currentTarget.dataset.id
    const reminder = this.data.reminders.find((item) => item._id === id)
    if (!reminder || reminder.status === 'completed') {
      return
    }
    const memberIndex = Math.max(
      0,
      this.data.members.findIndex((item) => item._id === reminder.memberId),
    )
    const illnessOptions = buildIllnessOptionsForPage(this.data, reminder.memberId)
    const illnessIndex = Math.max(
      0,
      illnessOptions.findIndex((item) => item._id === reminder.illnessRecordId),
    )
    const typeIndex = Math.max(
      0,
      this.data.typeOptions.findIndex((item) => item.value === reminder.type),
    )
    const planTime = splitRemindAt(reminder.remindAt)
    const preserveSubscription =
      reminder.subscriptionStatus === 'accepted' &&
      ['scheduled', 'sending'].includes(reminder.deliveryStatus)
    this.setData({
      memberIndex,
      illnessOptions,
      illnessIndex,
      typeIndex,
      form: {
        ...emptyForm,
        _id: reminder._id,
        memberId: reminder.memberId,
        illnessRecordId: reminder.illnessRecordId || '',
        type: reminder.type || 'other',
        title: reminder.title || '',
        remindDate: planTime.date,
        remindTime: planTime.time,
        remindAt: buildRemindAt(planTime.date, planTime.time),
        note: reminder.note || '',
        notifyEnabled: preserveSubscription,
        preserveSubscription,
      },
    })
    if (typeof wx.pageScrollTo === 'function') {
      wx.pageScrollTo({ scrollTop: 0, duration: 300 })
    }
  },

  cancelEdit() {
    this.setData({
      typeIndex: 0,
      illnessIndex: 0,
      form: createDefaultForm(this.data.form.memberId),
    })
  },

  async completeReminder(event) {
    const id = event.currentTarget.dataset.id
    const confirmed = await confirmAction('完成后会取消尚未发送的微信提醒。确认已完成这项待办？', '完成待办')
    if (!confirmed) {
      return
    }
    wx.showLoading({ title: '处理中' })
    try {
      await api.completeReminder(id)
      wx.showToast({ title: '待办已完成' })
      await this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async deleteReminder(event) {
    const id = event.currentTarget.dataset.id
    const confirmed = await confirmAction('删除后将不再显示，也不会发送尚未触发的提醒。确认删除？', '删除待办')
    if (!confirmed) {
      return
    }
    wx.showLoading({ title: '删除中' })
    try {
      await api.deleteReminder(id)
      wx.showToast({ title: '待办已删除' })
      await this.load()
    } catch (error) {
      wx.showToast({ title: error.message || '删除失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },
})

function buildReminderList(home) {
  const members = home.members || []
  const illnessRecords = home.illnessRecords || []
  return (home.reminders || [])
    .map((item) => {
      const illness = illnessRecords.find((record) => record._id === item.illnessRecordId)
      return {
        ...item,
        typeLabel: typeOptions.find((option) => option.value === item.type)?.label || '健康待办',
        memberName: memberName(members, item.memberId),
        illnessLabel: illness ? illnessLabel(illness) : '',
        remindAtText: formatDateTime(item.remindAt),
        deliveryLabel: deliveryLabel(item),
        hasLongNote: Array.from(String(item.note || '')).length > 50,
        expanded: false,
      }
    })
    .sort((a, b) => {
      const statusOrder = Number(a.status === 'completed') - Number(b.status === 'completed')
      return statusOrder || reminderSortTime(a) - reminderSortTime(b)
    })
}

function reminderSortTime(item) {
  const timestamp = Number(item.remindAtMs)
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return timestamp
  }
  return parseLocalDateTime(item.remindAt) || Number.MAX_SAFE_INTEGER
}

function buildIllnessOptions(records, memberId) {
  return [
    { _id: '', label: '不关联病程' },
    ...records
      .filter((item) => item.memberId === memberId)
      .map((item) => ({ _id: item._id, label: illnessLabel(item) })),
  ]
}

function buildIllnessOptionsForPage(data, memberId) {
  return buildIllnessOptions(data.illnessRecords || [], memberId)
}

function illnessLabel(item) {
  const symptoms = (item.symptoms || []).join('、')
  return `${formatDateTime(item.startedAt)} · ${symptoms || item.summary || '本次病程'}`
}

function selectMemberId(members, requestedId) {
  return members.some((item) => item._id === requestedId)
    ? requestedId
    : members.length
      ? members[0]._id
      : ''
}

function selectIllnessId(options, requestedId) {
  return options.some((item) => item._id === requestedId) ? requestedId : ''
}

function requestHealthTodoSubscription(templateId) {
  if (!templateId) {
    return Promise.resolve('unconfigured')
  }
  if (typeof wx.requestSubscribeMessage !== 'function') {
    return Promise.resolve('unavailable')
  }
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (result) => resolve(normalizeSubscriptionStatus(result[templateId])),
      fail: () => resolve('unavailable'),
    })
  })
}

function normalizeSubscriptionStatus(status) {
  return ['accept', 'reject', 'ban', 'filter'].includes(status)
    ? status === 'accept'
      ? 'accepted'
      : status
    : 'unavailable'
}

function subscriptionToast(status) {
  const messages = {
    accepted: '待办已保存并订阅提醒',
    unconfigured: '待办已保存，微信提醒待配置',
    not_requested: '待办已保存，未开启微信提醒',
  }
  return messages[status] || '待办已保存，未获得提醒授权'
}

function deliveryLabel(item) {
  if (item.status === 'completed') {
    return '已完成'
  }
  const labels = {
    scheduled: '微信提醒已预约',
    sending: '微信提醒发送中',
    sent: '微信提醒已发送',
    failed: '微信提醒发送失败',
  }
  return labels[item.deliveryStatus] || '仅保存在小程序'
}

function parseLocalDateTime(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})$/)
  if (!match) {
    return 0
  }
  const [, year, month, day, hour, minute] = match.map(Number)
  const date = new Date(year, month - 1, day, hour, minute)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return 0
  }
  return date.getTime()
}

function createDefaultForm(memberId = '') {
  const date = new Date(Date.now() + 30 * 60 * 1000)
  const remindDate = formatDatePart(date)
  const remindTime = formatTimePart(date)
  return {
    ...emptyForm,
    memberId,
    remindDate,
    remindTime,
    remindAt: buildRemindAt(remindDate, remindTime),
  }
}

function buildRemindAt(date, time) {
  return date && time ? `${date} ${time}` : ''
}

function splitRemindAt(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})$/)
  if (!match) {
    const fallback = createDefaultForm()
    return { date: fallback.remindDate, time: fallback.remindTime }
  }
  const [, year, month, day, hour, minute] = match
  return {
    date: `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`,
    time: `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`,
  }
}

function formatDatePart(date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTimePart(date) {
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  return `${hour}:${minute}`
}

function confirmAction(content, title) {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      success: (result) => resolve(Boolean(result.confirm)),
      fail: () => resolve(false),
    })
  })
}
