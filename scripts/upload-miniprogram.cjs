const path = require('node:path')
const ci = require('miniprogram-ci')

const appid = 'wxc3d708e7c51d5c87'
const privateKeyPath = process.env.MINIPROGRAM_PRIVATE_KEY_PATH

if (!privateKeyPath) {
  throw new Error('Set MINIPROGRAM_PRIVATE_KEY_PATH to the downloaded WeChat upload key file path.')
}

const project = new ci.Project({
  appid,
  ignores: ['node_modules/**/*', '.git/**/*', 'dist/**/*', 'screenshots/**/*'],
  privateKeyPath: path.resolve(privateKeyPath),
  type: 'miniProgram',
  projectPath: path.resolve(__dirname, '..'),
})

ci.upload({
  desc: process.env.MINIPROGRAM_UPLOAD_DESC || '上线前最终测试版',
  onProgressUpdate: console.log,
  project,
  setting: {
    es6: true,
    minify: true,
    minifyWXSS: true,
    minifyWXML: true,
    uploadWithSourceMap: true,
  },
  version: process.env.MINIPROGRAM_VERSION || '1.0.0',
}).then(
  () => console.log('Mini program upload completed.'),
  (error) => {
    console.error(error)
    process.exitCode = 1
  },
)
