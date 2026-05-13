const api = require('../../services/api')
const { SAFETY_NOTICE } = require('../../utils/constants')

Page({
  data: {
    question: '药箱里哪些药快到期了？',
    result: {
      intent: '等待问题',
      answer: '输入问题后，我会只基于当前家庭记录做检索和整理。',
      facts: [],
      safetyNotice: SAFETY_NOTICE,
    },
    quickQuestions: [
      '药箱里哪些药快到期了？',
      '上次孩子咳嗽吃了什么？',
      '家里有没有退烧药？',
      '这个症状是不是肺炎？',
    ],
  },

  onInput(event) {
    this.setData({ question: event.detail.value })
  },

  async ask(event) {
    const question = event.currentTarget.dataset.question || this.data.question
    if (!question) {
      wx.showToast({ title: '请输入问题', icon: 'none' })
      return
    }
    wx.showLoading({ title: '查询中' })
    try {
      const result = await api.assistantQuery(question)
      wx.hideLoading()
      this.setData({
        question,
        result,
      })
    } catch (error) {
      wx.hideLoading()
      wx.showToast({ title: error.message || '查询失败', icon: 'none' })
    }
  },
})
