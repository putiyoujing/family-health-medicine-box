# 1.0.15 发布证据记录（2026-09-12）

本页只记录已实际执行并可回查的发布动作。体验版上传不等于微信审核通过或正式发布。

## 发布对象

- 版本：`1.0.15`
- 候选提交：`6f12765`
- CloudBase 环境：`family-health-prod-d9csm29f27d75`
- 小程序 AppID：`wxc3d708e7c51d5c87`
- GitHub：`feature/quick-illness-vision-review`、`release/v1.0.15-quick-illness-vision`

## 结果

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| 本地工程门禁 | PASS | `npm run check`：201/201 测试通过；22 项静态发布保护通过 |
| 生产声明门禁 | PASS | `npm run check:release:production`：22 项通过 |
| CloudBase 云函数 | PASS | 更新 `healthApi`、`adminApi`、`login`、`paymentApi`；线上返回成功，函数保持 Active |
| CloudBase 管理后台 | PASS | `/admin/` 上传成功；公网入口返回 HTTP 200 并引用新构建资源 |
| CloudBase 回滚 | PASS | 上传前已下载现网 `admin/` 到本机独立回滚目录 |
| 微信体验版上传 | PASS | 开发者工具上传 1.0.15 成功，包大小约 499.4 KB |
| GitHub 分支 | PASS | 两个发布相关分支已推送到 `origin` |
| PC 端真机闭环 | PASS（登录与入口） | 用户已完成微信昵称/头像授权；PC 端已进入已登录家庭首页，并实际打开“快速记录”页。为避免写入真实健康数据，停在“提交并保存病程”之前 |
| 微信审核 | PENDING | 尚未取得审核通过证据 |
| 正式发布 | PENDING | 体验版上传不代表正式上线 |

## 安全边界

- 未上传 `.env`、密钥、本地测试数据、处方/门诊病历/药品图片。
- 未迁移数据库、未改写生产健康数据。
- 现网旧后台资源未删除，保留用于回滚。
