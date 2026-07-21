---
title: 家人健康记小程序-商业版开发设计-v1
date: 2026-05-12
tags: [项目, 家庭健康, 小程序, 商业化, 会员, 优惠券, 家庭共享]
project: 家人健康记
source: family_health_commercial_product_plan_v1.md
---

# 家人健康记小程序-商业版开发设计-v1

> 来源方案：[[家庭健康记录工具小程序-收费版产品与开发优化方案-v1]]
> 当前代码仓库：`F:\Project\xiaochengxu\family-health-medicine-box`
> 线上后台：<https://putiyoujing.github.io/family-health-medicine-box/>

## 1. 开发判断

当前 MVP 已经完成基础记录闭环，但商业版不能继续零散补功能。下一阶段必须先做商业版底座：

```text
多家庭能力
+ 家庭共享邀请
+ 会员权益判断
+ 订单/优惠券
+ AI 用量额度
+ 温馨视觉升级
```

这样后续 DeepSeek 图片解析、导出、会员付费、家庭协作才不会反复返工。

## 2. 产品口径

小程序名称继续保留：

> 家人健康记

产品主标题升级为：

> 家庭健康管理助手

一句话定位：

> 帮家庭记录每次健康情况、每次用药、每一盒药，让家人的健康信息不再靠记忆。

前端统一使用「健康记录」作为产品表达。数据库短期可继续保留 `illness_records`，避免迁移风险。

## 3. 商业版 P0 范围

P0 必须包含：

1. 用户可加入和切换多个家庭。
2. 家庭可邀请共享成员。
3. 会员绑定 `familyId`，而不是单个用户。
4. 免费版和会员版有统一权益判断。
5. 月度会员 9.9 元 / 30 天，年度会员 99 元 / 365 天。
6. 后台可管理优惠券、订单、会员家庭。
7. AI 图片解析和 AI 问答都进入用量额度。
8. 小程序视觉从基础工具升级为温馨、可靠、清爽的家庭工具。

## 4. 数据模型设计

### 4.1 现有集合

继续保留：

- `users`
- `families`
- `family_roles`
- `family_members`
- `medicines`
- `illness_records`
- `medication_logs`
- `attachments`
- `reminders`
- `admins`

### 4.2 新增集合

商业版新增：

- `family_invites`
- `plans`
- `orders`
- `subscriptions`
- `coupons`
- `coupon_redemptions`
- `ai_tasks`
- `ai_usage_logs`

### 4.3 families 增量字段

```js
{
  plan: 'free' | 'pro',
  proExpireAt: Date,
  proSource: 'monthly' | 'yearly' | 'coupon' | 'admin_grant',
  proUpdatedAt: Date,
  currentQuotaSnapshot: {
    maxMembers: 10,
    maxSharedUsers: 6,
    maxMedicines: 300,
    maxAttachments: 1000,
    aiImageParseMonthly: 100,
    aiAssistantMonthly: 300
  }
}
```

### 4.4 family_roles 标准角色

```text
owner  家庭创建者：全部权限
admin  管理员：管理成员、药品、健康记录、用药记录、邀请成员
member 协作者：新增和编辑记录，不能管理付费和删除家庭
viewer 查看者：仅查看
```

### 4.5 family_invites

```js
{
  inviteCode: 'ABCD1234',
  familyId: '',
  familyNameSnapshot: '',
  inviterOpenid: '',
  inviterNameSnapshot: '',
  role: 'viewer',
  status: 'active',
  maxUses: 1,
  usedCount: 0,
  expiresAt: Date,
  acceptedOpenids: [],
  createdAt: Date,
  updatedAt: Date
}
```

### 4.6 plans

```js
{
  planId: 'yearly_pro',
  name: '年度会员',
  price: 9900,
  displayPrice: '99',
  durationDays: 365,
  badge: '推荐',
  status: 'active',
  benefits: {},
  sort: 0,
  createdAt: Date,
  updatedAt: Date
}
```

### 4.7 orders

```js
{
  orderNo: 'FH202605120001',
  familyId: '',
  payerOpenid: '',
  planId: 'yearly_pro',
  planName: '年度会员',
  originalAmount: 9900,
  discountAmount: 2000,
  payableAmount: 7900,
  couponId: '',
  couponCode: 'NEWUSER20',
  status: 'pending',
  paymentProvider: 'mock',
  paymentTradeNo: '',
  paidAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

### 4.8 coupons

```js
{
  code: 'NEWUSER20',
  name: '新用户年费立减 20 元',
  type: 'fixed_amount',
  value: 20,
  applicablePlans: ['yearly'],
  minAmount: 9900,
  maxDiscountAmount: 2000,
  totalQuantity: 500,
  usedQuantity: 0,
  perUserLimit: 1,
  perFamilyLimit: 1,
  startAt: Date,
  endAt: Date,
  status: 'active',
  createdAt: Date,
  updatedAt: Date
}
```

### 4.9 ai_tasks / ai_usage_logs

`ai_tasks` 记录 DeepSeek 图片解析任务，`ai_usage_logs` 记录家庭维度的 AI 用量。

解析结果不能直接写入药品或健康记录，必须进入确认页，由用户确认后保存。

## 5. 云函数设计

### 5.1 healthApi 必改底座

当前 `getFamily(openid)` 只取第一个家庭角色，必须升级为：

```text
listMyFamilies
getCurrentFamily(openid, familyId)
switchFamily
assertFamilyAccess(openid, familyId, requiredRole)
```

所有业务 action 支持传入 `familyId`：

```js
{
  action: 'saveMedicine',
  familyId: 'xxx',
  payload: {}
}
```

后端必须校验当前 openid 是否拥有该家庭权限。

### 5.2 healthApi 新增 action

家庭：

- `listMyFamilies`
- `switchFamily`
- `createFamilyInvite`
- `acceptFamilyInvite`
- `listFamilyRoles`
- `updateFamilyRole`
- `removeFamilyUser`

会员：

- `getMembershipStatus`
- `getEntitlement`

AI：

- `parseAttachment`
- `getAiTask`
- `confirmAiParseResult`

### 5.3 新建 paymentApi

为避免 `healthApi` 过大，商业支付相关建议新建：

```text
cloudfunctions/paymentApi
```

action：

- `getPlans`
- `previewOrder`
- `createOrder`
- `mockPaymentSuccess`
- `applyCoupon`
- `listCouponsForUser`

第一版支付先走 mock，正式上线再接微信官方虚拟支付。

### 5.4 adminApi 新增 action

- `adminListCoupons`
- `adminCreateCoupon`
- `adminUpdateCoupon`
- `adminListOrders`
- `adminListSubscriptions`
- `adminListAiUsage`

## 6. 权益判断设计

统一限制：

```js
const FREE_LIMITS = {
  maxOwnedFamilies: 1,
  maxMembers: 3,
  maxSharedUsers: 2,
  sharedRoles: ['viewer', 'member', 'admin'],
  maxMedicines: 30,
  maxHealthRecords: 10,
  maxMedicationLogs: 100,
  maxAttachments: 10,
  aiImageParseMonthly: 3,
  aiAssistantMonthly: 10,
  exportPdf: false,
  familyMonthlyReport: false
}

const PRO_LIMITS = {
  maxOwnedFamilies: 3,
  maxMembers: 10,
  maxSharedUsers: 6,
  sharedRoles: ['viewer', 'member', 'admin'],
  maxMedicines: 300,
  maxHealthRecords: 3000,
  maxMedicationLogs: 10000,
  maxAttachments: 1000,
  aiImageParseMonthly: 100,
  aiAssistantMonthly: 300,
  exportPdf: true,
  familyMonthlyReport: true
}
```

`maxOwnedFamilies` 是账号级创建权益：只统计该账号作为 owner 创建的家庭，受邀加入的家庭不计入；其他额度仍按当前 `familyId` 独立统计。

所有涉及额度的操作都必须走统一函数：

```js
getFamilyEntitlement(familyId)
assertQuota(familyId, usageType)
```

## 7. 小程序页面设计

新增页面：

- `/pages/membership/index`
- `/pages/payment/checkout`
- `/pages/family/index`
- `/pages/family/invite`
- `/pages/family/accept`
- `/pages/family/switch`
- `/pages/attachment/parse`
- `/pages/report/export`
- `/pages/coupon/index`

保留 tabBar：

```text
首页 / 药箱 / 健康 / 用药 / 我的（AI 使用首页悬浮入口）
```

入口位置：

- 首页顶部家庭名称点击进入家庭切换。
- 我的页面进入会员中心、家庭管理、管理后台。
- 附件上传后进入图片解析确认页。

## 8. Web 管理后台设计

新增「运营中心」：

- 会员套餐
- 优惠券
- 订单记录
- 会员家庭
- AI 用量

后台优先实现查询和配置，不直接处理真实支付退款。

## 9. 视觉升级原则

设计关键词：

```text
温馨 / 可靠 / 清爽 / 有呼吸感 / 家庭陪伴 / 轻医疗工具
```

色彩：

- 主色：安心绿 `#3F7D5B`
- 背景：奶油米白 `#F8F4EC`
- 卡片：柔白 `#FFFFFF`
- 辅助：温暖橙 `#F4B95F`
- 主文字：`#24352E`

首页改造方向：

```text
早上好，Oscar
今天也记得照顾好家人

家庭切换
今日安心卡
悬浮入口：AI 健康整理；主要操作进入各功能页，首页不堆叠按钮
家庭成员卡
最近记录
```

## 10. 开发优先级

### 第一轮：商业版底座

1. 多家庭和 currentFamilyId。
2. familyId 显式传参和权限校验。
3. 家庭共享邀请。
4. 权益判断函数。
5. 数据库设计文档同步。

### 第二轮：会员与优惠券

1. `paymentApi`。
2. 会员中心页面。
3. 优惠券/订单集合。
4. Web 运营中心。
5. mock 支付闭环。

### 第三轮：AI 图片解析

1. `ai_tasks`。
2. `ai_usage_logs`。
3. DeepSeek 调用封装。
4. 图片解析确认页。
5. 额度判断。

### 第四轮：视觉升级

1. 全局样式系统。
2. 首页重构。
3. 空状态文案。
4. 会员中心和邀请页打磨。

## 11. 本轮建议执行范围

本轮开发不建议一口气把真实支付、DeepSeek 图片解析、家庭共享和视觉全部写完。最稳的工程切入是：

```text
先实现商业版底座的数据模型和接口设计
再实现小程序页面入口和 mock 流程
最后接真实支付与 DeepSeek
```

这样可以确保每一步都可运行、可验证、可回滚。

## 12. 验收标准

商业版底座完成后，至少应能验证：

1. 一个用户可看到自己加入的所有家庭。
2. 用户可切换当前家庭。
3. owner 可创建邀请。
4. 被邀请用户可接受邀请进入家庭。
5. 免费家庭只能邀请 1 个 viewer。
6. 会员家庭可邀请 6 个共享成员。
7. 保存药品、健康记录、用药记录时均按 familyId 隔离。
8. 会员状态可以按 familyId 返回。
9. Web 后台能看到订单、优惠券、会员家庭入口。
10. 旧的核心 MVP 功能不被破坏。
