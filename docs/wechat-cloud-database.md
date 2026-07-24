# 微信云开发数据库设计

本项目使用微信小程序云开发作为发布主线。

## 集合

- `users`：用户信息，按 openid 创建。
- `admins`：管理后台白名单。
- `families`：家庭空间。
- `family_roles`：登录账号在家庭中的权限，`owner/admin/member/viewer`；每个有效账号通过 `memberId` 关联一个成员档案。
- `family_invites`：家庭共享邀请，记录邀请码、角色、有效期和使用状态；邀请必须带 `targetMemberId`。
- `family_members`：家庭成员健康档案。儿童、老人等无独立登录账号的成员只创建档案，不创建虚假用户。
- `medicines`：家庭药箱药品记录。
- `illness_records`：病程主记录，前端表达为“生病记录/本次病程”。
- `course_events`：病程内时间线事件，记录体温、症状、备注、就诊、检查和用药事件；就诊事件可通过 `prescribedMedicineIds` / `prescribedMedicines` 关联本次开药快照，但不会生成用药记录或扣减库存。
- `medication_logs`：用药记录。
- `attachments`：检查单、处方、外包装、说明书等附件。
- `reminders`：健康待办，关联成员和可选病程，并记录微信订阅授权与发送状态。
- `feedback`：用户反馈，记录类型、内容、联系方式、来源页面和处理状态。
- `plans`：会员套餐。
- `orders`：会员订单。
- `subscriptions`：会员订阅记录。
- `coupons`：优惠券。
- `coupon_code_batches`：会员兑换码批次，用于小红书成交后批量发码。
- `coupon_codes`：单个会员兑换码，记录发放、兑换、外部订单号和激活订阅。
- `coupon_redemptions`：优惠券使用记录。
- `ai_tasks`：AI 图片解析任务。
- `ai_usage_logs`：AI 使用额度记录。
- `app_configs`：面向应用的后台配置；`membership` 文档保存会员购买提示文案。
- `admin_operation_logs`：后台敏感查看和管理操作的最小化审计日志。

## 权限原则

小程序端不直接写数据库，统一通过 `healthApi` 云函数读写。

因此所有业务集合、身份集合、订单集合和审计集合在云控制台都应设为“仅管理端可读写（`ADMINONLY`）”。不要给小程序端开放公有读、创建者读写或自定义直读规则；家庭共享权限统一在云函数内按 `family_roles + familyId` 校验。微信官方文档说明云函数属于管理端，不受小程序端数据库权限限制，适合处理高安全要求数据；每次发布前需要在控制台逐集合复核权限。

云函数每次请求都会：

1. 通过 `cloud.getWXContext()` 获取 openid。
2. 查询 `family_roles` 得到当前用户所属家庭。
3. 读取 `users.currentFamilyId`，也支持请求显式传入 `familyId`。
4. 所有业务集合按 `familyId` 隔离。
5. 所有写入操作校验当前 openid 在该家庭的角色权限。
6. 删除采用软删除，写入 `deletedAt`。
7. 用药记录若关联病程主记录，必须校验该病程也属于当前家庭，并自动写入一条 `course_events` 时间线事件。
8. 修改用药记录时必须在事务中返还旧剂量、扣减新剂量并同步病程事件；作废时恢复库存并软删除关联事件。
8. 附件解析和确认必须逐个校验附件、任务及关联对象属于当前家庭，不能信任客户端传入的 ID。
9. 管理接口必须以管理员登录身份调用，并写入 `admin_operation_logs`；禁止浏览器共享 token。
10. 健康待办必须校验 `memberId` 属于当前家庭；若存在 `illnessRecordId`，病程必须属于同一家庭和同一成员。订阅消息接收人只能由服务端写入当前 openid，不能信任客户端传值。

## 健康待办与微信订阅消息

`reminders` 主要字段：

```json
{
  "familyId": "家庭 ID",
  "memberId": "成员 ID",
  "illnessRecordId": "可选病程 ID",
  "type": "medication | follow_up | stock_check | other",
  "title": "待办标题",
  "remindAt": "2026-07-22 20:30",
  "remindAtMs": 1784723400000,
  "status": "active | completed",
  "subscriptionStatus": "accepted",
  "notificationOpenid": "由服务端写入",
  "deliveryStatus": "scheduled | sending | sent | failed | cancelled | not_scheduled"
}
```

在云数据库为 `reminders` 建立复合索引：`status`、`deliveryStatus`、`remindAtMs`（升序），以支持每分钟查询到期待办。

配置步骤：

1. 在微信公众平台「功能 > 订阅消息」申请一次性提醒模板，至少包含事项名称和提醒时间，可选包含成员、备注。
2. 把模板 ID 同时填入 `miniprogram/utils/constants.js` 的 `HEALTH_TODO_TEMPLATE_ID`，以及 `reminderDispatcher` 云函数环境变量 `HEALTH_TODO_TEMPLATE_ID`。
3. 在云函数环境变量配置 `HEALTH_TODO_TEMPLATE_FIELDS`，例如 `{"title":"thing1","time":"time2","member":"thing3","note":"thing4"}`；字段名必须以实际模板为准，不得照抄示例。
4. 根据测试环境设置 `HEALTH_TODO_MINIPROGRAM_STATE=developer|trial|formal`。
5. 上传部署 `reminderDispatcher` 后，单独上传其 `healthTodoEveryMinute` 定时触发器。
6. 在真机上创建一条未来几分钟的待办，接受授权并核对消息、跳转页面和数据库发送状态。

## 家庭与会员字段

`families` 集合新增商业版字段：

```json
{
  "plan": "free",
  "proExpireAt": null,
  "proSource": "",
  "proUpdatedAt": null,
  "currentQuotaSnapshot": {}
}
```

会员权益绑定 `familyId`，不是绑定单个用户。

家庭创建额度按账号“自己创建且仍有效的家庭”计算：

- 免费账号最多创建 1 个家庭；首次登录自动生成的默认家庭占用该名额。
- 账号自己创建的任一家庭处于有效会员期时，该账号最多可创建 3 个家庭。
- 受邀加入别人的家庭不计入创建额度，也不能借用对方家庭的会员权益创建新家庭。
- 新创建的家庭默认是免费版；会员仍只归属实际开通会员的 `familyId`。
- 会员到期不会删除或退出已经创建的家庭，只会在当前数量达到免费上限时禁止继续创建。

角色权限：

- `owner`：家庭创建者。
- `admin`：管理员。
- `member`：协作者。
- `viewer`：查看者。

成员档案与登录账号遵循“界面统一、数据分层”：

- `family_members` 表示健康数据属于谁，不要求本人登录。
- `family_roles` 表示谁可以访问家庭；除历史待迁移数据外，有效角色必须关联对应的 `memberId`。
- `family_invites.targetMemberId` 必填；受邀人接受后认领现有成员档案，不允许创建无档案的普通协作账号。
- 创建家庭时自动创建“本人”成员档案并绑定 owner；既有未绑定 owner 在登录或读取家庭时幂等补齐。
- 接受定向邀请不得新建成员档案；同一家庭内一个成员档案最多关联一个有效账号，一个账号最多关联一个成员档案。
- 移除协作账号只撤销访问权限，不删除成员档案和健康记录。
- 移除成员在产品侧表达为“归档”；历史病程和用药记录保留，同时解除账号与该档案的关联。
- owner 的本人档案不能归档；必须先按未来的家庭转让流程处理 owner 身份。

## 云函数

### login

首次进入时创建：

- `users`
- `families`
- `family_members`（创建者本人档案）
- `family_roles`

### healthApi

统一业务入口：

- `getHome`
- `listMyFamilies`
- `switchFamily`
- `createFamily`
- `getMembershipStatus`
- `getFamilyInvite`
- `createFamilyInvite`
- `acceptFamilyInvite`
- `listFamilyRoles`
- `updateFamilyRole`
- `removeFamilyUser`
- `saveMember` / `deleteMember`
- `saveMedicine` / `deleteMedicine`
- `saveIllness` / `deleteIllness`
- `saveCourseEvent` / `deleteCourseEvent`
- `saveMedication` / `deleteMedication`
- `saveAttachment` / `deleteAttachment`
- `saveReminder` / `deleteReminder`
- `saveFeedback`
- `parseAttachment` / `getAiTask` / `confirmAiParseResult`
- `assistantQuery`
- `exportReport`

商业版底座规则：

- 所有 action 可通过 `familyId` 显式指定家庭。
- 不传 `familyId` 时使用 `users.currentFamilyId`。
- `createFamily` 由服务端校验创建额度；成功后自动创建并绑定 owner 的“本人”档案，并把新家庭设为当前家庭。
- `listMyFamilies` 同时返回 `ownedFamilyCount`、`maxOwnedFamilies`、`canCreateFamily` 和 `multiFamilyPlan`，供页面展示创建状态；客户端显示不能替代服务端校验。
- 免费版最多 3 个家庭成员（创建者及另外 2 个关联账号），3 人均可按需设为管理员、协作者或查看者；另含 30 个药品、10 条健康记录、100 条用药记录、10 个附件、每月 10 次 AI 问答。
- 会员版最多 10 个家庭成员、6 个共享成员、300 个药品、3000 条健康记录、10000 条用药记录、1000 个附件、每月 300 次 AI 问答。

### adminApi

管理后台接口，必须先通过 `admins` 集合校验。

支持：

- `getDashboard`：全局统计。
- `listUsers`：用户列表。
- `listFamilies`：家庭列表。
- `listMedicines`：药品列表。
- `listIllness`：健康记录列表。
- `listMedication`：用药记录列表。
- `listAttachments`：附件列表。
- `listOrders` / `adminListOrders`：订单列表。
- `listSubscriptions` / `adminListSubscriptions`：会员家庭列表。
- `listCoupons` / `adminListCoupons`：优惠券列表。
- `listCouponCodeBatches` / `adminListCouponCodeBatches`：会员兑换码批次列表。
- `listCouponCodes` / `adminListCouponCodes`：会员兑换码列表。
- `listAiUsage` / `adminListAiUsage`：AI 用量列表。
- `getMembershipSettings`：读取会员中心购买提示配置。
- `updateMembershipSettings`：修改会员中心购买提示配置，文案非空且不超过 120 字。
- `createCoupon` / `adminCreateCoupon`：创建优惠券。
- `updateCoupon` / `adminUpdateCoupon`：更新优惠券。
- `batchGenerateCouponCodes` / `adminBatchGenerateCouponCodes`：批量生成小红书发码用的会员兑换码。
- `markCouponCodeIssued` / `adminMarkCouponCodeIssued`：标记单个兑换码已发放，并记录小红书订单号或用户备注。
- `exportCouponCodes` / `adminExportCouponCodes`：按批次导出兑换码。
- `disableCouponCodeBatch` / `adminDisableCouponCodeBatch`：禁用整个兑换码批次及未兑换券码。

### paymentApi

会员与订单入口：

- `getPlans`：读取会员套餐及会员购买提示文案；配置缺失时返回内置默认文案。
- `previewOrder`：预览订单金额和优惠。
- `createOrder`：创建待支付订单。
- `applyCoupon`：校验并应用优惠券。
- `redeemMembershipCode`：用户输入小红书发放的会员兑换码后，激活当前家庭会员。
- `listCouponsForUser`：列出当前家庭可用优惠券。
- `mockPaymentSuccess`：仅限本地/测试/预发布联调；默认拒绝，且必须同时设置 `ALLOW_MOCK_PAYMENT=true` 和非生产 `NODE_ENV` 才可调用。生产环境严禁启用。

当前优先完成“小红书成交 + 后台发会员兑换码 + 小程序兑换激活”闭环；正式上线小程序内购买前再接入微信官方支付或虚拟支付能力。

## 管理员配置

上线前需要手动在 `admins` 集合添加管理员：

```json
{
  "authUid": "CloudBase Auth 用户 UID",
  "role": "owner",
  "status": "active",
  "name": "管理员名称",
  "createdAt": "服务端时间"
}
```

Web 管理请求只在认证 UID 匹配且 `status=active` 时放行；OpenID 仅保留为小程序调用兼容路径，不能由浏览器请求参数伪造。

## 发布前必须配置

1. 在微信开发者工具中开通云开发环境。
2. 把云环境 ID 写入 `miniprogram/app.js` 的 `ENV_ID`。
3. 上传并部署 `cloudfunctions/login`。
4. 上传并部署 `cloudfunctions/healthApi`。
5. 上传并部署 `cloudfunctions/adminApi`。
6. 上传并部署 `cloudfunctions/paymentApi`。
7. 创建上述数据库集合，并逐个设置为仅管理端可读写（`ADMINONLY`）。
8. 创建商业版新增集合：`family_invites`、`plans`、`orders`、`subscriptions`、`coupons`、`coupon_code_batches`、`coupon_codes`、`coupon_redemptions`、`ai_tasks`、`ai_usage_logs`、`app_configs`、`admin_operation_logs`。
9. 云存储开启，用于检查单、处方、外包装、说明书图片。

`course_events` 建议索引：

- `familyId + illnessRecordId + recordedAt`
- `familyId + memberId + recordedAt`
- `familyId + medicationLogId + deletedAt`

## 外部服务接入

- 微信 OCR、腾讯云 OCR 或 DeepSeek 图片识别接入 `ai_tasks`。解析结果必须进入确认页，不能直接入库。
- 微信支付或虚拟支付接入 `orders` 和 `subscriptions`。
- 微信订阅消息接入 `reminders`。
