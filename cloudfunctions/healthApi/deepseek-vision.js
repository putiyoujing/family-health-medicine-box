const https = require('https')

const MODEL = 'deepseek-v4-flash-vision-exp'
const MAX_REQUEST_BYTES = 48 * 1024 * 1024

function detectImageMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    throw new Error('图片内容为空或格式不受支持')
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png'
  }
  if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) {
    return 'image/jpeg'
  }
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') {
    return 'image/gif'
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  throw new Error('图片格式不受支持，请上传 JPEG、PNG、GIF 或 WebP 图片')
}

async function callDeepSeekVision({ apiKey, imageBuffer, mimeType, prompt }) {
  const key = String(apiKey || '').trim()
  if (!key) {
    throw new Error('DeepSeek 图片识别服务未配置 API Key')
  }
  if (!Buffer.isBuffer(imageBuffer) || !imageBuffer.length) {
    throw new Error('图片内容为空或格式不受支持')
  }
  const detectedMimeType = mimeType || detectImageMimeType(imageBuffer)
  const dataUrl = `data:${detectedMimeType};base64,${imageBuffer.toString('base64')}`
  const requestBody = JSON.stringify({
    model: MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: String(prompt || '').trim() },
        {
          type: 'image_url',
          image_url: {
            url: dataUrl,
            detail: 'original',
          },
        },
      ],
    }],
    response_format: { type: 'json_object' },
  })
  return requestDeepSeek({ apiKey: key, requestBody, sizeError: '图片过大，请压缩图片后重试', errorLabel: '图片识别' })
}

async function callDeepSeekText({ apiKey, prompt }) {
  const key = String(apiKey || '').trim()
  if (!key) {
    throw new Error('DeepSeek 文字整理服务未配置 API Key')
  }
  const text = String(prompt || '').trim()
  if (!text) {
    throw new Error('文字整理内容不能为空')
  }
  const requestBody = JSON.stringify({
    model: MODEL,
    messages: [{
      role: 'user',
      content: [{ type: 'text', text }],
    }],
    response_format: { type: 'json_object' },
  })
  return requestDeepSeek({ apiKey: key, requestBody, sizeError: '文字内容过长，请缩短后重试', errorLabel: '文字整理' })
}

async function requestDeepSeek({ apiKey, requestBody, sizeError, errorLabel }) {
  if (Buffer.byteLength(requestBody, 'utf8') > MAX_REQUEST_BYTES) {
    throw new Error(sizeError)
  }
  const response = await postJson({
    hostname: 'api.deepseek.com',
    path: '/chat/completions',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody, 'utf8'),
    },
    body: requestBody,
  })
  const content = response && response.choices && response.choices[0]
    && response.choices[0].message && response.choices[0].message.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(`DeepSeek ${errorLabel}未返回有效内容`)
  }
  return {
    model: response.model || MODEL,
    output: parseJsonContent(content),
    rawContent: content,
    usage: response.usage || {},
  }
}

function parseJsonContent(content) {
  const text = String(content || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('JSON 根节点必须是对象')
    }
    return parsed
  } catch (error) {
    throw new Error(`DeepSeek 返回内容不是有效 JSON：${error.message}`)
  }
}

function postJson({ hostname, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname,
      path,
      method: 'POST',
      headers,
      timeout: 120000,
    }, (response) => {
      let text = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        text += chunk
      })
      response.on('end', () => {
        let data
        try {
          data = text ? JSON.parse(text) : {}
        } catch (error) {
          reject(new Error(`DeepSeek 返回内容无法解析：${error.message}`))
          return
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const message = data && data.error && data.error.message
          reject(new Error(message || `DeepSeek 请求失败（HTTP ${response.statusCode}）`))
          return
        }
        resolve(data)
      })
    })
    request.on('timeout', () => request.destroy(new Error('DeepSeek 请求超时')))
    request.on('error', reject)
    request.write(body)
    request.end()
  })
}

module.exports = {
  MODEL,
  callDeepSeekVision,
  callDeepSeekText,
  detectImageMimeType,
  parseJsonContent,
}
