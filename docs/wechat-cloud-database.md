# 微信云开发数据库设计

本项目使用微信小程序云开发作为发布主线。

## 集合

- `users`：用户信息，按 openid 创建。
- `admins`：管理后台白名单。
- `families`：家庭空间。
- `family_roles`：家庭成员权限，`owner/admin/member/viewer`。
- `family_invites`：家庭共享邀请，记录邀请码、角色、有效期和使用状态。
- `family_members`：家庭成员档案。
- `medicines`：药箱药品库存。
- `illness_records`：健康记录。
- `medication_logs`：用药记录。
- `attachments`：检查单、处方、药盒、说明书等附件。
- `reminders`：提醒记录。
- `plans`：会员套餐。
- `orders`：会员订单。
- `subscriptions`：会员订阅记录。
- `coupons`：优惠券。
- `coupon_redemptions`：优惠券使用记录。
- `ai_tasks`：AI 图片解析任务。
- `ai_usage_logs`：AI 使用额度记录。

## 权限原则

小程序端不直接写数据库，统一通过 `healthApi` 云函数读写。

云函数每次请求都会：

1. 通过 `cloud.getWXContext()` 获取 openid。
2. 查询 `family_roles` 得到当前用户所属家庭。
3. 读取 `users.currentFamilyId`，也支持请求显式传入 `familyId`。
4. 所有业务集合按 `familyId` 隔离。
5. 所有写入操作校验当前 openid 在该家庭的角色权限。
4. 删除采用软删除，写入 `deletedAt`。
5. 用药记录若关联健康记录，必须校验该健康记录也属于当前家庭。

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

角色权限：

- `owner`：家庭创建者。
- `admin`：管理员。
- `member`：协作者。
- `viewer`：查看者。

## 云函数

### login

首次进入时创建：

- `users`
- `families`
- `family_roles`

### healthApi

统一业务入口：

- `getHome`
- `listMyFamilies`
- `switchFamily`
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
- `saveMedication` / `deleteMedication`
- `saveAttachment` / `deleteAttachment`
- `saveReminder` / `deleteReminder`
- `assistantQuery`
- `exportData`

商业版底座规则：

- 所有 action 可通过 `familyId` 显式指定家庭。
- 不传 `familyId` 时使用 `users.currentFamilyId`。
- 免费版最多 3 个家庭成员、1 个共享查看者、30 个药品、30 条健康记录、100 条用药记录、30 个附件、每月 10 次 AI 问答。
- 会员版最多 10 个家庭成员、6 个共享成员、300 个药品、3000 条健康记录、10000 条用药记录、1000 个附件、每月 300 次 AI 问答。
- `exportData` 当前设为会员权益。

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

## 管理员配置

上线前需要手动在 `admins` 集合添加管理员：

```json
{
  "openid": "管理员 openid",
  "status": "active",
  "name": "管理员名称",
  "createdAt": "2026-05-12"
}
```

普通用户没有 `admins.status=active` 时，访问管理后台会返回无权限。

## 发布前必须配置

1. 在微信开发者工具中开通云开发环境。
2. 把云环境 ID 写入 `miniprogram/app.js` 的 `ENV_ID`。
3. 上传并部署 `cloudfunctions/login`。
4. 上传并部署 `cloudfunctions/healthApi`。
5. 上传并部署 `cloudfunctions/adminApi`。
6. 创建上述数据库集合。
7. 创建商业版新增集合：`family_invites`、`plans`、`orders`、`subscriptions`、`coupons`、`coupon_redemptions`、`ai_tasks`、`ai_usage_logs`。
8. 云存储开启，用于检查单、处方、药盒、说明书图片。

## 后续增强

- 微信 OCR 或腾讯云 OCR 接入 `attachments.ocrText`。
- DeepSeek 图片解析接入 `ai_tasks`，但解析结果必须进入确认页，不能直接入库。
- 微信支付或虚拟支付接入 `orders` 和 `subscriptions`。
