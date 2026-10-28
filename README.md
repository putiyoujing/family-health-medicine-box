# 生病记录助手小程序

这是「生病记录助手」的微信小程序版本，定位为家庭健康管理与记录工具，目标是对外发布，而不是单独的 Web 页面。

## 当前版本与入口

- 当前线上版本：`1.0.14`（2026-07-27 已发布）
- 当前发布候选版本：`1.1.3`（体验优化、优惠券支付安全闭环；云函数与生产管理后台已部署，待真机验收、审核和正式发布）
- GitHub：<https://github.com/putiyoujing/family-health-medicine-box>
- 生产管理后台入口：<https://family-health-prod-d9csm29f27d75-1307117498.tcloudbaseapp.com/admin/>；1.1.3 候选后台已部署并通过生产数据读取核验；小程序线上版本仍为 1.0.14。
- GitHub Pages：历史演示入口，不作为生产后台或真实数据入口。
- 发布记录：[CHANGELOG.md](CHANGELOG.md)

## 当前架构

- `miniprogram/`：微信原生小程序前端
- `cloudfunctions/login`：用户登录、openid 获取；家庭空间按需创建或通过邀请加入
- `cloudfunctions/healthApi`：统一业务后台接口
- `cloudfunctions/reminderDispatcher`：每分钟派发到期的微信订阅消息
- `cloudfunctions/paymentApi`：会员兑换、虚拟支付签名、平台查单及订单权益发放
- `cloudfunctions/adminApi`：管理后台统计接口
- `docs/`：数据库与发布说明
- `src/`：产品管理者使用的独立 Web 管理后台

完整文档地图见 [docs/README.md](docs/README.md)。

## 已实现

- 用户 openid 登录、按需创建家庭与邀请加入家庭
- 多家庭、家庭切换、家庭共享邀请和角色权限
- 家庭成员管理
- 家庭药箱记录
- 外包装 / 药瓶 / 说明书拍照上传，并关联药品记录
- 健康记录
- 用药记录自动扣减库存
- 检查单 / 处方 / 外包装 / 说明书图片上传到云存储，并生成附件记录
- 图片整理确认页：图片解析结果必须经用户确认后保存
- 1.0.14 已下线原 AI 查询入口；新的图片与语音解析流程尚未开放
- 病程复诊摘要导出
- 健康待办：关联家庭成员和病程，支持用药、复诊、药箱检查及微信订阅提醒
- 按家庭 `familyId` 做数据隔离
- 会员中心：兑换码激活、会员权益对比和当前用量
- 管理后台：用户、家庭、订单、会员家庭、优惠券、AI 用量、药品、记录、附件统计与列表
- 独立 Web 管理后台：产品管理者查看整体用户、会员收入和运营数据

## 微信开发者工具运行

1. 用微信开发者工具打开本仓库根目录。
2. 确认 `project.config.json` 中的正式 `appid` 与目标小程序一致。
3. 确认 `miniprogram/app.js` 中的云开发环境 `ENV_ID` 与目标环境一致。
4. 在云开发控制台创建数据库集合，见 [docs/wechat-cloud-database.md](docs/wechat-cloud-database.md)。
5. 上传并部署 `cloudfunctions/login`、`cloudfunctions/healthApi`、`cloudfunctions/paymentApi`、`cloudfunctions/adminApi` 和 `cloudfunctions/reminderDispatcher`，并上传定时触发器。
6. 按 [docs/wechat-cloud-database.md](docs/wechat-cloud-database.md) 配置健康待办订阅模板和云函数环境变量。
7. 编译运行小程序。

## 管理后台

管理后台是面向产品管理者的独立 Web 后台，不在 C 端小程序内展示入口。

- 独立 Web 管理后台：见 [docs/web-admin.md](docs/web-admin.md)。

管理后台使用 CloudBase Web Auth。需要把管理员账号的认证 UID 写入云数据库 `admins` 集合：

```json
{
  "authUid": "CloudBase Auth 用户 UID",
  "role": "owner",
  "status": "active",
  "name": "管理员名称"
}
```

## Web 管理后台本地验证

如果需要查看上一版 Web 原型：

```bash
npm install
npm run dev
```

## 发布前检查

见 [docs/release-checklist.md](docs/release-checklist.md)。

## 完整性评估

三角色评估见 [docs/role-review-and-gap-plan.md](docs/role-review-and-gap-plan.md)。

## 当前未开放或待补证据

- 图片识别默认关闭；当前保留图片上传、任务、额度记录和用户确认保存闭环。
- 当前支付候选已实现虚拟支付签名、平台查单、可信发货回调、每 5 分钟订单对账，以及仅后台主管理员可申请的金额退款。四个正式道具和 ¥1 测试道具已发布。Android 体验版完成一笔 ¥1 实付并开通会员；后台申请的 ¥0.99 部分退款已到账、订单关闭，关联会员权益已回收，订单仍有 ¥0.01 未退。支付成功页和新版后台已部署候选代码，但其真机与管理员页面验收未完成。正常购买开关仍关闭；密钥轮换及剩余生产门禁未完成。详见 [支付上线进度](docs/payment-release-readiness-2026-10-22.md)。
- 生产环境、5 个云函数、24 个 `ADMINONLY` 集合、管理后台静态托管及提醒定时触发器已核验。
- 1.1.2 候选 Web 管理后台已部署；公网入口返回 200，并引用最新构建。管理员搜索、订单详情和退款表仍需在线验收。
- 小程序 1.0.14 已由项目负责人提供的微信公众平台版本管理截图确认于 2026-07-27 正式发布。
- 小程序 1.0.15 已上传微信体验版；微信审核和正式发布仍待完成。
- 隐私配置、双账号隔离、iOS/Android 真机和真实提醒触达已由项目负责人于 2026-07-24 确认通过；原始截图、日志或测试记录未纳入仓库。
- Git 全历史密钥扫描未发现仓库内泄漏；支付相关现用密钥仍需在正式收款前轮换。

## 医疗安全边界

本系统仅用于家庭健康记录、历史信息查询和医嘱整理，不提供疾病诊断、处方建议或剂量调整建议。用药请遵医嘱或咨询医生/药师；如症状加重或出现紧急情况，请及时就医。
