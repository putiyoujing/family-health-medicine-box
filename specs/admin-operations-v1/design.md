# 管理后台一期设计

## 边界与数据复用

后台继续使用根目录的 Vite React 应用和 `cloudfunctions/adminApi`。业务数据复用 `users`、`families`、`family_roles`、`family_members`、`subscriptions`、`medicines`、`illness_records`、`medication_logs`、`feedback`、`coupon_*` 与 `admin_operation_logs`。

会员归属家庭而非用户；用户详情先读取用户，再通过 `family_roles.openid` 汇总家庭。家庭详情以 `familyId` 为唯一查询条件，所有健康数据只返回本家庭的聚合和近期安全摘要。

## 认证与授权

CloudBase Web Auth 负责用户名密码登录和会话；Publishable Key 通过构建时环境变量传入 Web 端。后台请求采用 CloudBase Event Function 调用，服务端读取认证 UID，并在 `admins` 中校验 `authUid`、`role` 和 `status=active`。现有只依赖小程序 `openid` 的管理员校验在切换时保留兼容迁移路径，但不允许 Web 请求伪造 `openid`。

管理员账号创建是部署前人工步骤：先创建 CloudBase Auth 用户，再在 `admins` 写入对应 `authUid` 和角色。密码不落入项目、云函数或数据库业务集合。

## 接口

新增/调整 `adminApi` 动作：

- `searchUsers({ keyword, skip, limit })`
- `getUserDetail({ userId })`
- `getFamilyDetail({ familyId, includeSensitive })`
- `updateFeedback({ feedbackId, status, operatorNote })`
- `revealFamilySensitiveFields({ familyId })`，只写审计，不将健康详情持久化到日志。

列表动作保留，以免破坏现有后台。所有动作在授权后写入 `admin_operation_logs`；日志只保存 ID 与动作，不保存联系方式、病史、过敏史或兑换码明文。

## 界面

现有单页后台增加用户检索与详情抽屉/面板。用户详情中的家庭条目可进入家庭详情；家庭详情使用概览卡、成员表、统计和最近记录区。默认隐藏敏感字段，Owner 的“查看敏感信息”按钮必须有确认文案。

本地开发 API 同步实现相同动作和固定的本地管理令牌，供 Vite 开发与自动化测试使用；生产代码不使用该令牌。

## 兑换码修复

`paymentApi.redeemMembershipCode` 在任何写操作前解析兑换码、计划与有效期，使用实际定义的变量写入订阅、兑换记录、批次和券状态。新增回归测试覆盖成功兑换和重复兑换拒绝。
