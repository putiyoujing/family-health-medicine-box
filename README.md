# 家庭健康记录与药箱管理小程序

这是知识库项目“家庭健康记录与药箱管理系统”的微信小程序版本，目标是对外发布，而不是单独的 Web 页面。

## 当前架构

- `miniprogram/`：微信原生小程序前端
- `cloudfunctions/login`：用户登录、openid 获取、首次家庭初始化
- `cloudfunctions/healthApi`：统一业务后台接口
- `cloudfunctions/paymentApi`：会员、订单、优惠券和支付确认接口
- `cloudfunctions/adminApi`：管理后台统计接口
- `docs/`：数据库与发布说明
- `src/`：产品管理者使用的独立 Web 管理后台

## 已实现

- 用户 openid 登录与家庭初始化
- 多家庭、家庭切换、家庭共享邀请和角色权限
- 家庭成员管理
- 药箱库存管理
- 药盒 / 药瓶 / 说明书拍照上传，并关联药品记录
- 健康记录
- 用药记录自动扣减库存
- 检查单 / 处方 / 药盒 / 说明书图片上传到云存储，并生成附件记录
- 图片整理确认页：图片解析结果必须经用户确认后保存
- AI 查询助手安全版，先基于数据库检索，不做诊断或处方
- 家庭数据导出与就医沟通记录导出
- 提醒管理：用药提醒、复诊提醒、药箱检查提醒
- 按家庭 `familyId` 做数据隔离
- 会员中心：套餐选择、优惠券选择、订单创建、支付确认开通
- 管理后台：用户、家庭、订单、会员家庭、优惠券、AI 用量、药品、记录、附件统计与列表
- 独立 Web 管理后台：产品管理者查看整体用户、会员收入和运营数据

## 微信开发者工具运行

1. 用微信开发者工具打开本仓库根目录。
2. 在 `project.config.json` 中替换正式 `appid`。
3. 在 `miniprogram/app.js` 中填写云开发环境 `ENV_ID`。
4. 在云开发控制台创建数据库集合，见 [docs/wechat-cloud-database.md](docs/wechat-cloud-database.md)。
5. 上传并部署 `cloudfunctions/login`、`cloudfunctions/healthApi`、`cloudfunctions/paymentApi` 和 `cloudfunctions/adminApi`。
6. 编译运行小程序。

## 管理后台

管理后台是面向产品管理者的独立 Web 后台，不在 C 端小程序内展示入口。

- 独立 Web 管理后台：见 [docs/web-admin.md](docs/web-admin.md)。

管理后台需要在云数据库 `admins` 集合中添加管理员 openid：

```json
{
  "openid": "管理员 openid",
  "status": "active",
  "name": "管理员名称"
}
```

## Web 原型验证

如果需要查看上一版 Web 原型：

```bash
npm install
npm run dev
```

## 发布前检查

见 [docs/release-checklist.md](docs/release-checklist.md)。

## 完整性评估

三角色评估见 [docs/role-review-and-gap-plan.md](docs/role-review-and-gap-plan.md)。

## 仍需真实环境配置

- 微信云开发环境、数据库集合、云存储权限。
- DeepSeek 或 OCR 图片识别服务密钥。当前已完成图片上传、AI 任务、额度记录和确认保存闭环。
- 微信支付或虚拟支付商户配置。当前已完成订单、优惠券、支付确认和会员开通闭环。
- 微信订阅消息模板 ID。当前已完成提醒记录管理。

## 医疗安全边界

本系统仅用于家庭健康记录、历史信息查询和医嘱整理，不提供疾病诊断、处方建议或剂量调整建议。用药请遵医嘱或咨询医生/药师；如症状加重或出现紧急情况，请及时就医。
