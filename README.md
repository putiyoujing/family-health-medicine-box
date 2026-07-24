# 家人健康记小程序

这是知识库项目“家人健康记”的微信小程序版本，定位为家庭健康管理与记录工具，目标是对外发布，而不是单独的 Web 页面。

## 当前版本与入口

- 当前版本：`1.0.13`
- GitHub：<https://github.com/putiyoujing/family-health-medicine-box>
- 生产管理后台入口：<https://family-health-prod-d9csm29f27d75-1307117498.tcloudbaseapp.com/admin/>；当前线上后台仍为已核验的 1.0.12；1.0.13 小程序已于 2026-07-24 提交微信审核，结果待定。
- GitHub Pages：历史演示入口，不作为生产后台或真实数据入口。
- 发布记录：[CHANGELOG.md](CHANGELOG.md)

## 当前架构

- `miniprogram/`：微信原生小程序前端
- `cloudfunctions/login`：用户登录、openid 获取、首次家庭初始化
- `cloudfunctions/healthApi`：统一业务后台接口
- `cloudfunctions/reminderDispatcher`：每分钟派发到期的微信订阅消息
- `cloudfunctions/paymentApi`：会员兑换及保留的订单、优惠券接口
- `cloudfunctions/adminApi`：管理后台统计接口
- `docs/`：数据库与发布说明
- `src/`：产品管理者使用的独立 Web 管理后台

完整文档地图见 [docs/README.md](docs/README.md)。

## 已实现

- 用户 openid 登录与家庭初始化
- 多家庭、家庭切换、家庭共享邀请和角色权限
- 家庭成员管理
- 家庭药箱记录
- 外包装 / 药瓶 / 说明书拍照上传，并关联药品记录
- 健康记录
- 用药记录自动扣减库存
- 检查单 / 处方 / 外包装 / 说明书图片上传到云存储，并生成附件记录
- 图片整理确认页：图片解析结果必须经用户确认后保存
- AI 查询助手安全版，先基于数据库检索，不做诊断或处方
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
- 小程序仅保留会员兑换码激活入口，不展示套餐价格、购买渠道或支付入口。
- 生产环境、5 个云函数、24 个 `ADMINONLY` 集合、管理后台静态托管及提醒定时触发器已核验。
- 1.0.12 Web 管理后台已部署；无管理员会话的隔离浏览器只显示登录表单，未加载任何业务数据。1.0.13 后台源码将会员提示调整为中性兑换说明，待重新部署。
- 1.0.13 小程序已由项目负责人确认提交微信审核；该确认只证明已提交，不代表审核通过或正式发布。
- 隐私配置、双账号隔离、iOS/Android 真机和真实提醒触达目前只有本地发布门禁声明，仍需保存可审计的截图或测试记录。
- Git 全历史密钥扫描未发现泄漏。AppSecret 轮换由项目负责人延期处理，仍建议在正式公开发布前完成。

## 医疗安全边界

本系统仅用于家庭健康记录、历史信息查询和医嘱整理，不提供疾病诊断、处方建议或剂量调整建议。用药请遵医嘱或咨询医生/药师；如症状加重或出现紧急情况，请及时就医。
