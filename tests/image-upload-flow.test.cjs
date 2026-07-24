const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { loadCjsModule } = require('./helpers/cjs-harness.cjs')

const root = path.resolve(__dirname, '..')
const uploadHelper = path.join(root, 'miniprogram/utils/image-upload.js')

test('photo source choices map camera actions to camera and gallery actions to album', () => {
  const { getMediaSourceType } = loadCjsModule(uploadHelper)

  assert.deepEqual(Array.from(getMediaSourceType(0, 2)), ['camera'])
  assert.deepEqual(Array.from(getMediaSourceType(1, 2)), ['camera'])
  assert.deepEqual(Array.from(getMediaSourceType(2, 2)), ['album'])
  assert.deepEqual(Array.from(getMediaSourceType(0, 1)), ['camera'])
  assert.deepEqual(Array.from(getMediaSourceType(1, 1)), ['album'])
})

test('upload failures preserve the platform reason and explain privacy failures', () => {
  const { getImageUploadErrorMessage, isImageSelectionCanceled } = loadCjsModule(uploadHelper)

  assert.equal(
    getImageUploadErrorMessage({
      errMsg: 'chooseMedia:fail api scope is not declared in the privacy agreement',
      errno: 112,
    }, '单据图片'),
    '微信后台尚未声明照片或摄像头权限，请在「设置 → 服务内容声明 → 用户隐私保护指引」完成配置后重试。',
  )
  assert.equal(
    getImageUploadErrorMessage({ errMsg: 'uploadFile:fail permission denied' }, '药品图片'),
    '药品图片上传失败：uploadFile:fail permission denied',
  )
  assert.equal(isImageSelectionCanceled({ errMsg: 'chooseMedia:fail cancel' }), true)
})

test('medicine and illness uploads expose explicit camera and gallery choices', () => {
  const medicine = fs.readFileSync(path.join(root, 'miniprogram/pages/medicines/form.js'), 'utf8')
  const illnessForm = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/form.js'), 'utf8')
  const illnessDetail = fs.readFileSync(path.join(root, 'miniprogram/pages/illness/detail.js'), 'utf8')

  assert.match(medicine, /itemList: \['拍外包装\/药瓶', '拍说明书', '从相册选择'\]/)
  assert.match(medicine, /getMediaSourceType\(res\.tapIndex, 2\)/)
  for (const source of [illnessForm, illnessDetail]) {
    assert.match(source, /itemList: \['拍照', '从相册选择'\]/)
    assert.match(source, /getMediaSourceType\(sourceResult\.tapIndex, 1\)/)
    assert.match(source, /getImageUploadErrorMessage\(error, '单据图片'\)/)
  }
})
