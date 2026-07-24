# 上线准备工作清单

更新时间：2026-07-24

本文基于 `README.md`、`docs/release-checklist.md`、`docs/wechat-cloud-database.md`、`docs/web-admin.md` 和 `docs/role-review-and-gap-plan.md` 整理。代码与生产云资源已形成 1.0.12 候选基线；正式公开上线前，重点是补齐可审计的合规、双账号、真机与提醒触达证据。

## 0. 当前状态与阻塞项

仓库已确认：正式 AppID 已配置，`ENV_ID` 已配置，`globalData.useDemoData=false`。这些不再是当前阻塞项。

当前结论：**代码和云资源 PASS，公开发布证据仍为 BLOCKED。**

- `login`、`healthApi`、`paymentApi`、`adminApi`、`reminderDispatcher` 均为 Active，部署入口文件与本地一致。
- 24 个生产集合均已逐项核验为 `ADMINONLY`；生产管理后台 `/admin/` 可访问；提醒定时触发器已启用。
- `npm run check` 与本机 `npm run check:release:production` 通过。
- 本机声明显示管理员 E2E、隐私、双账号、真机和提醒触达已完成，但仓库尚无对应截图、日志或测试记录，因此只记为“已声明，待留证”。
- 图片识别与真实支付不在 1.0.12 首发范围；首发商业化采用兑换码。
- 生产 WeChat AppSecret 需要轮换，且不得写入仓库或文档。

## 1. 账号与平台准备

- 复核 `project.config.json` 的正式小程序 AppID 与提交主体一致。
- 复核 `miniprogram/app.js` 的 `ENV_ID` 与目标云开发环境一致。
- 在小程序后台配置服务类目、服务器域名/云开发能力、隐私保护指引、用户协议和审核资料。
- 准备 CloudBase Web Auth 管理员账号，并将认证 UID 绑定到 `admins.authUid`。
- 明确首发策略：建议先走“体验版/封闭测试”，通过后再提交公开审核。

## 2. 云开发与数据库

必须创建的集合：

- `users`
- `admins`
- `families`
- `family_roles`
- `family_invites`
- `family_members`
- `medicines`
- `illness_records`
- `course_events`
- `medication_logs`
- `attachments`
- `reminders`
- `feedback`
- `plans`
- `orders`
- `subscriptions`
- `coupons`
- `coupon_code_batches`
- `coupon_codes`
- `coupon_redemptions`
- `ai_tasks`
- `ai_usage_logs`

必须初始化的数据：

- 在 `admins` 集合添加管理员：

```json
{
  "authUid": "CloudBase Auth 用户 UID",
  "role": "owner",
  "status": "active",
  "name": "管理员名称",
  "createdAt": "服务端时间"
}
```

- 在 `plans` 集合配置会员套餐，例如月度会员、年度会员。
- 如首发采用“小红书成交 + 后台发码 + 小程序兑换”，需要在后台生成或导入兑换码批次。

建议索引：

- `course_events`: `familyId + illnessRecordId + recordedAt`
- `course_events`: `familyId + memberId + recordedAt`
- `course_events`: `familyId + medicationLogId + deletedAt`
- 常用业务表按 `familyId + createdAt` 或 `familyId + deletedAt` 建索引，支撑列表和软删除过滤。

权限原则：

- 小程序端不直接写数据库，统一通过云函数读写。
- 所有家庭数据必须按 `familyId` 隔离。
- 删除走软删除，写入 `deletedAt`。
- 附件、处方、检查单等敏感资料不能在日志里完整输出。

## 3. 云函数部署

需要部署：

- `cloudfunctions/login`
- `cloudfunctions/healthApi`
- `cloudfunctions/paymentApi`
- `cloudfunctions/adminApi`

部署前检查：

- 每个云函数依赖安装完整。
- `adminApi` 安装 `@cloudbase/node-sdk`，并从调用上下文读取 Web Auth UID。
- `healthApi` 可完成登录后家庭初始化、家庭权限校验、额度校验。
- `paymentApi` 确认首发支付路线：真实微信支付/虚拟支付，或先使用兑换码激活会员。
- `adminApi` 只能允许 `admins.authUid` 匹配且 `status=active` 的管理员访问。

联调验证：

- 新用户首次进入后自动创建 `users`、`families`、`family_roles`。
- 普通用户无管理员权限时不能访问管理后台数据。
- 用户切换家庭后，所有药品、健康记录、用药记录都按当前 `familyId` 读取。

## 4. 小程序生产配置

- 将 `globalData.useDemoData` 改为 `false`。
- 填写正式 `ENV_ID`。
- 确认所有页面没有依赖本地 demo 数据才能完成主流程。
- 检查 tabBar、页面路径、分享路径、家庭邀请路径。
- 检查冷启动、授权、无数据空态、网络失败提示。
- 保留医疗安全提示：系统只做记录和整理，不做诊断、处方或剂量调整建议。

## 5. 外部服务接入

图片识别：

- 选择微信 OCR、腾讯云 OCR 或 DeepSeek 图片识别。
- 配置生产密钥，密钥只能放在云函数或安全后端，不能放入小程序前端。
- 图片解析必须进入确认页，用户确认后才保存到药品或健康记录。
- 识别失败要可重试，不影响手动录入。

支付/会员：

- 若接微信支付或虚拟支付，完成商户/结算/回调配置。
- 若首发走小红书兑换码，准备兑换码生成、发放、核销和客服处理流程。
- 订单、订阅、优惠券、兑换码必须能在管理后台查到。
- 支付成功或兑换成功后，会员权益按 `familyId` 生效。

订阅消息：

- 在微信后台申请健康待办类一次性订阅消息模板。
- 将模板 ID 配置到小程序常量和 `reminderDispatcher` 云函数环境变量，并按实际模板配置字段映射。
- 为 `reminders` 创建 `status + deliveryStatus + remindAtMs` 复合索引，部署云函数及每分钟触发器。
- 真机验证用药待办、复诊待办、药箱检查待办的授权、准时触达、单次发送和点击跳转。

## 6. 管理后台上线

当前 Web 管理后台地址：

- 生产：`https://family-health-prod-d9csm29f27d75-1307117498.tcloudbaseapp.com/admin/`
- 历史演示：`https://putiyoujing.github.io/family-health-medicine-box/`，不作为生产或鉴权证据

上线前必须配置：

- `VITE_CLOUDBASE_ENV_ID`
- `VITE_CLOUDBASE_REGION`
- `VITE_CLOUDBASE_PUBLISHABLE_KEY`
- `admins.authUid`、`role=owner`、`status=active`

建议部署路线：

- 使用 CloudBase Web Auth 完成用户名密码登录。
- 登录后通过 Web SDK 调用 `adminApi` Event Function。
- `adminApi` 从服务端调用上下文读取认证 UID，并以 `admins` 白名单授权。

安全要求：

- 不要把云数据库权限直接暴露给浏览器。
- 不要把管理员密码、SecretId、SecretKey 或共享管理 token 提交到 Git。
- 管理后台只放产品管理者入口，不在 C 端小程序里公开展示。

## 7. 合规与审核材料

必须准备：

- 小程序名称、简介、头像、服务类目。
- 用户协议。
- 隐私政策，明确说明家庭健康数据、药品信息、图片附件、处方/检查单等敏感信息用途。
- 医疗安全免责声明。
- 图片上传前的敏感信息提示。
- 审核截图和功能说明。
- 客服与用户反馈入口。

审核口径：

- 产品定位是“家庭健康记录、药箱管理、就医沟通资料整理”。
- 不宣称诊断疾病。
- 不提供处方建议。
- 不提供剂量调整、停药、换药建议。
- AI 功能只基于用户已有记录做整理和检索。

## 8. 必测路径

上线前至少完整跑通：

1. 新用户首次进入，自动创建用户和家庭。
2. 编辑个人资料。
3. 添加家庭成员。
4. 添加药品。
5. 拍外包装/说明书照片并保存药品。
6. 新增健康记录。
7. 在病程详情中追加体温、症状、备注、就诊或检查事件。
8. 上传检查单或处方图片，确认云存储返回 fileId。
9. 进入图片整理确认页，确认识别结果不会自动入库。
10. 记录一次用药，确认药品库存自动扣减。
11. 创建家庭邀请，另一个微信用户接受邀请并切换家庭。
12. 从病程添加健康待办并完成一次真实微信订阅消息触达。
13. AI 查询“哪些药快过期”。
14. AI 查询“这个症状是不是肺炎”，确认安全拒答。
15. 导出家庭数据和就医沟通记录。
16. 进入会员中心，选择套餐、优惠券或兑换码，完成会员激活。
17. Web 管理后台查看用户、家庭、药品、健康记录、附件、订单、会员家庭、优惠券和 AI 用量。

## 9. 发布前工程检查

本地提交前执行：

```bash
npm run build
npm run lint
```

微信侧检查：

- 微信开发者工具编译通过。
- 真机预览通过。
- 体验版完整回归通过。
- 云函数日志无敏感健康记录明文。
- 上传包体积、页面路径、权限弹窗均正常。

Git 与配置检查：

- `.env`、密钥、token、真实用户数据不提交。
- GitHub Pages 如继续作为后台承载，需要确认生产环境变量来自部署配置，不写入仓库。
- 发布前保留可回滚版本：Git tag、云函数版本、数据库备份策略。

## 10. 上线节奏建议

第一阶段：真实环境联调

- AppID、ENV_ID、云函数、数据库、管理员、管理后台 token 全部配置完成。
- 使用内部账号跑通全流程。

第二阶段：体验版封闭测试

- 邀请 3-5 个真实家庭场景用户。
- 重点观察录入成本、病程摘要是否有用、图片识别准确性、是否误导医疗判断。

第三阶段：小范围公开

- 先开放记录、药箱、病程摘要、家庭共享。
- 支付能力可优先采用兑换码或人工发码，降低支付审核和售后复杂度。

第四阶段：正式公开发布

- 接入稳定支付/虚拟支付、订阅消息和完整客服流程。
- 管理后台持续监控新增用户、家庭数、订单、AI 用量、临期药品和待处理附件。

## 11. 上线后监控

- 云函数错误率。
- 登录/家庭初始化失败率。
- 图片上传失败率。
- AI 解析失败率和平均耗时。
- 支付/兑换失败率。
- 用户反馈与投诉。
- 医疗安全拒答触发记录。
- 管理后台是否能稳定读取核心统计。

## 12. 最小上线判断

可以提交体验版的最低标准：

- 正式 AppID 和云开发环境已配置。
- 小程序不再使用 demo 数据。
- 云数据库和云函数完整跑通。
- 医疗安全提示、隐私政策、用户协议齐备。
- 真机完整跑通必测路径。
- 管理后台可以看到真实数据。

可以公开上线的最低标准：

- 体验版测试无阻塞问题。
- 图片识别、支付/兑换、订阅消息的生产链路稳定。
- 审核材料完整。
- 有客服和异常处理方案。
- 有数据备份、回滚和 token 更换方案。
