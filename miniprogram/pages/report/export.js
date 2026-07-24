const api = require('../../services/api')
const { ensureLoginReady } = require('../../utils/operation-guards')

const IMAGE_WIDTH = 1080
const IMAGE_MIN_HEIGHT = 1600
const IMAGE_PADDING = 72
const IMAGE_CONTENT_TOP = 154
const IMAGE_FOOTER_HEIGHT = 134

Page({
  data: {
    loading: false,
    illnessRecordId: '',
    doctorQuestions: '',
    reportText: '',
    imageGenerating: false,
    imageStatus: '',
    reportImagePaths: [],
  },

  onLoad(options) {
    if (!options.illnessRecordId) {
      wx.showToast({ title: '请从病程详情生成复诊摘要', icon: 'none' })
      wx.navigateBack()
      return
    }
    this.setData({ illnessRecordId: options.illnessRecordId })
  },

  onQuestionsInput(event) {
    this.setData({ doctorQuestions: event.detail.value })
  },

  async generate() {
    const loggedIn = await ensureLoginReady()
    if (!loggedIn) {
      return
    }
    this.setData({ loading: true, reportText: '' })
    wx.showLoading({ title: '整理中' })
    try {
      const data = await api.exportReport({
        illnessRecordId: this.data.illnessRecordId,
        doctorQuestions: this.data.doctorQuestions,
      })
      wx.hideLoading()
      this.setData({
        loading: false,
        reportText: normalizeIllnessReport(data.reportText, this.data.doctorQuestions),
      })
      wx.showToast({ title: '摘要已生成', icon: 'success' })
    } catch (error) {
      wx.hideLoading()
      this.setData({ loading: false })
      wx.showToast({ title: error.message || '导出失败', icon: 'none' })
    }
  },

  copyReport() {
    if (!this.data.reportText) {
      wx.showToast({ title: '请先生成摘要', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: String(this.data.reportText),
      success: () => wx.showToast({ title: '已复制全部内容' }),
      fail: showCopyFailure,
    })
  },

  async generateReportImage() {
    if (!this.data.reportText || this.data.imageGenerating) {
      return
    }
    this.setData({
      imageGenerating: true,
      imageStatus: '正在排版摘要…',
      reportImagePaths: [],
    })
    wx.showLoading({ title: '生成图片中' })
    try {
      const canvas = await getReportCanvas()
      canvas.width = IMAGE_WIDTH
      canvas.height = IMAGE_MIN_HEIGHT
      const context = canvas.getContext('2d')
      const lines = buildDrawableLines(context, this.data.reportText)
      canvas.height = calculateReportImageHeight(lines)
      this.setData({ imageStatus: '正在生成长图…' })
      drawReportImage(context, lines, canvas.height)
      await waitForCanvasPaint()
      const imagePath = await exportReportCanvas(canvas)
      wx.hideLoading()
      this.setData({
        imageGenerating: false,
        imageStatus: '已生成 1 张长图',
        reportImagePaths: [imagePath],
      })
      wx.previewImage({ current: imagePath, urls: [imagePath] })
    } catch (error) {
      wx.hideLoading()
      this.setData({
        imageGenerating: false,
        imageStatus: '图片生成失败，请查看提示',
      })
      console.error('generate report image failed', error)
      wx.showModal({
        title: '图片生成失败',
        content: error.message || '画布暂不可用，请重新编译后再试。',
        showCancel: false,
        confirmText: '知道了',
      })
    }
  },
})

function getReportCanvas() {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery()
      .select('#reportCanvas')
      .fields({ node: true, size: true })
      .exec((result) => {
        const canvas = result && result[0] && result[0].node
        if (!canvas) {
          reject(new Error('图片画布初始化失败'))
          return
        }
        resolve(canvas)
      })
  })
}

function buildDrawableLines(context, reportText) {
  const result = []
  String(reportText || '')
    .split(/\r?\n/)
    .forEach((sourceLine) => {
      const trimmed = sourceLine.trim()
      if (!trimmed) {
        result.push({ text: '', font: '30px sans-serif', color: '#18322d', lineHeight: 24, spaceBefore: 0 })
        return
      }
      const style = imageLineStyle(trimmed)
      const displayText = trimmed.replace(/^#{1,2}\s*/, '')
      context.font = style.font
      wrapCanvasText(context, displayText, IMAGE_WIDTH - IMAGE_PADDING * 2).forEach((text, index) => {
        result.push({
          ...style,
          text,
          spaceBefore: index === 0 ? style.spaceBefore : 0,
        })
      })
    })
  return result
}

function calculateReportImageHeight(lines) {
  const contentHeight = (lines.length ? lines : [bodyImageLine('暂无摘要内容')])
    .reduce((total, line) => total + line.spaceBefore + line.lineHeight, 0)
  return Math.max(IMAGE_MIN_HEIGHT, IMAGE_CONTENT_TOP + contentHeight + IMAGE_FOOTER_HEIGHT)
}

function imageLineStyle(line) {
  if (/^#\s/.test(line)) {
    return { font: 'bold 44px sans-serif', color: '#123f37', lineHeight: 64, spaceBefore: 0 }
  }
  if (/^##\s/.test(line)) {
    return { font: 'bold 34px sans-serif', color: '#187565', lineHeight: 54, spaceBefore: 22 }
  }
  return bodyImageLine('')
}

function bodyImageLine(text) {
  return { text, font: '30px sans-serif', color: '#18322d', lineHeight: 48, spaceBefore: 0 }
}

function wrapCanvasText(context, text, maxWidth) {
  const lines = []
  let current = ''
  for (const character of String(text || '')) {
    const candidate = current + character
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current)
      current = character
    } else {
      current = candidate
    }
  }
  if (current || !lines.length) {
    lines.push(current)
  }
  return lines
}

function drawReportImage(context, sourceLines, imageHeight) {
  const lines = sourceLines.length ? sourceLines : [bodyImageLine('暂无摘要内容')]
  context.fillStyle = '#eef8f4'
  context.fillRect(0, 0, IMAGE_WIDTH, imageHeight)
  drawRoundedRect(context, 32, 32, IMAGE_WIDTH - 64, imageHeight - 64, 32, '#ffffff')

  context.textBaseline = 'top'
  context.fillStyle = '#123f37'
  context.font = 'bold 30px sans-serif'
  context.fillText('家庭健康记录 · 复诊沟通摘要', IMAGE_PADDING, 76)

  let y = IMAGE_CONTENT_TOP
  lines.forEach((line) => {
    y += line.spaceBefore
    if (line.text) {
      context.fillStyle = line.color
      context.font = line.font
      context.fillText(line.text, IMAGE_PADDING, y)
    }
    y += line.lineHeight
  })

  const footerTop = imageHeight - 98
  context.strokeStyle = '#d8ebe5'
  context.beginPath()
  context.moveTo(IMAGE_PADDING, footerTop)
  context.lineTo(IMAGE_WIDTH - IMAGE_PADDING, footerTop)
  context.stroke()
  context.fillStyle = '#6c817b'
  context.font = '22px sans-serif'
  context.fillText('仅整理已记录信息，不提供诊断或用药建议', IMAGE_PADDING, footerTop + 20)
}

function drawRoundedRect(context, x, y, width, height, radius, color) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
  context.fillStyle = color
  context.fill()
}

function waitForCanvasPaint() {
  return new Promise((resolve) => {
    if (typeof wx.nextTick === 'function') {
      wx.nextTick(resolve)
      return
    }
    setTimeout(resolve, 0)
  })
}

function exportReportCanvas(canvas) {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      destWidth: IMAGE_WIDTH,
      destHeight: canvas.height,
      fileType: 'png',
      success: (result) => resolve(result.tempFilePath),
      fail: (error) => reject(new Error((error && error.errMsg) || '图片导出失败')),
    })
  })
}

function normalizeIllnessReport(reportText, doctorQuestions) {
  const text = String(reportText || '').trim()
  if (!text) {
    return ''
  }
  const blocks = text.split(/\r?\n(?=##\s)/)
  if (blocks.length === 1) {
    return text
  }

  const intro = blocks[0].trim()
  const sections = new Map()
  blocks.slice(1).forEach((block) => {
    const title = block.split(/\r?\n/, 1)[0].trim()
    if (title && !sections.has(title)) {
      sections.set(title, block.trim())
    }
  })

  const questions = String(doctorQuestions || '')
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (questions.length) {
    sections.set(
      '## 想问医生的问题',
      ['## 想问医生的问题', ...questions.map((item, index) => `${index + 1}. ${item}`)].join('\n'),
    )
  }

  const preferredOrder = [
    '## 本次病程',
    '## 想问医生的问题',
    '## 时间线',
    '## 用药记录',
    '## 检查/诊断/医嘱',
    '## 基础信息',
    '## 安全提示',
  ]
  const ordered = []
  preferredOrder.forEach((title) => {
    if (sections.has(title)) {
      ordered.push(sections.get(title))
      sections.delete(title)
    }
  })
  return [intro, ...ordered, ...sections.values()].filter(Boolean).join('\n\n')
}

function showCopyFailure(error) {
  const reason = String((error && (error.errMsg || error.message)) || '系统剪贴板暂不可用')
    .replace(/^setClipboardData:fail\s*/i, '')
    .slice(0, 100)
  console.error('setClipboardData failed', error)
  const scopeNotDeclared = /api scope|privacy agreement|errno[:=]?\s*112/i.test(reason)
  wx.showModal({
    title: scopeNotDeclared ? '需配置剪贴板权限' : '复制失败',
    content: scopeNotDeclared
      ? '微信已禁用直接复制。请在小程序管理后台「设置 → 服务内容声明 → 用户隐私保护指引」中声明“读取你的剪切板”，用途填写“用户主动复制复诊摘要”。配置后约 5 分钟生效。'
      : reason,
    showCancel: false,
    confirmText: '知道了',
  })
}
