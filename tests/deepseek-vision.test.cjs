const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')
const vision = loadCjsModule(path.join(root, 'cloudfunctions/healthApi/deepseek-vision.js'))

test('DeepSeek Vision accepts the supported image signatures', () => {
  const png = Buffer.alloc(12)
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png)
  const jpeg = Buffer.alloc(12)
  Buffer.from([255, 216, 255]).copy(jpeg)
  const gif = Buffer.from('GIF89a000000')
  const webp = Buffer.from('RIFF0000WEBP')

  assert.equal(vision.detectImageMimeType(png), 'image/png')
  assert.equal(vision.detectImageMimeType(jpeg), 'image/jpeg')
  assert.equal(vision.detectImageMimeType(gif), 'image/gif')
  assert.equal(vision.detectImageMimeType(webp), 'image/webp')
})

test('DeepSeek Vision rejects unsupported or empty image content', async () => {
  assert.throws(
    () => vision.detectImageMimeType(Buffer.alloc(12)),
    /图片格式不受支持/,
  )
  await assert.rejects(
    vision.callDeepSeekVision({ apiKey: 'local-test-key', imageBuffer: Buffer.alloc(0) }),
    /图片内容为空或格式不受支持/,
  )
})

test('DeepSeek Vision parses object JSON and rejects arrays', () => {
  assert.equal(
    JSON.stringify(vision.parseJsonContent('```json\n{"name":"药品"}\n```')),
    JSON.stringify({ name: '药品' }),
  )
  assert.throws(
    () => vision.parseJsonContent('[{"name":"药品"}]'),
    /JSON 根节点必须是对象/,
  )
})

test('DeepSeek Vision requires an API key before making a request', async () => {
  await assert.rejects(
    vision.callDeepSeekVision({ imageBuffer: Buffer.from('image') }),
    /未配置 API Key/,
  )
})
