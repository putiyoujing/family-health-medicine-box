# Web 管理后台

更新时间：2026-10-29

本项目包含面向产品运营人员的独立 Web 后台。生产环境使用 CloudBase Web Auth 用户名密码会话，并通过 CloudBase Event Function 调用 `adminApi`。真实健康数据不会由浏览器直接查询数据库。

生产入口：<https://family-health-prod-d9csm29f27d75-1307117498.tcloudbaseapp.com/admin/>

GitHub Pages 仅用于历史演示，不是生产后台，也不能作为真实数据与鉴权验收依据。

部署状态（2026-10-29）：1.1.5 候选代码已部署到现有 CloudBase `/admin/` 入口，`adminApi` 为 `Active`。真实管理员登录后的退款关联搜索已回归；完整发布状态以 [1.1.5 发布候选核验记录](release-evidence-2026-10-29.md) 为准。

## 商业资产边界

- “优惠券表”独立生成优惠券码，只用于订单抵扣，并只读写 `coupons`。
- “兑换码批次表”和“会员兑换码表”独立批量生成会员兑换码，只读写 `coupon_code_batches` 与 `coupon_codes`。
- 会员兑换只记录兑换码、批次、订阅和兑换记录；不读取、写入或核销优惠券。已有历史记录仅保留审计，不做迁移。

## 本地运行

```bash
npm install
npm run dev
```

未配置 CloudBase 环境变量时，开发模式使用 `/api/admin` 本地接口和 `.local-data/admin-store.json`。配置 CloudBase 环境变量后，开发模式也会进入真实管理员登录流程。

如本机已经配置 CloudBase，但只想使用可逆的本地模拟数据做界面测试：

```bash
npm run dev:local
```

`local-admin` 模式只有在 Vite 开发环境中生效，生产构建仍强制使用 CloudBase 登录配置。

## 生产连接方式

前端使用以下公开配置：

```env
VITE_CLOUDBASE_ENV_ID=family-health-prod-d9csm29f27d75
VITE_CLOUDBASE_REGION=ap-shanghai
VITE_CLOUDBASE_PUBLISHABLE_KEY=从云开发身份认证获取的-Publishable-Key
```

`Publishable Key` 是浏览器公开配置，不是服务端密钥。严禁把 SecretId、SecretKey、API Key、管理员密码或共享管理 token 放进任何 `VITE_*` 变量。

上传生产静态文件前必须执行：

```bash
npm run build:hosting
```

该命令会先检查三项公开配置，再开始构建；普通 `npm run build` 仍可用于本地演示与测试，不可作为生产静态托管构建命令。

生产调用链：

1. 浏览器调用 `auth.signInWithPassword({ username, password })`。
2. 页面使用 `auth.getSession()` 判断是否存在真实、非匿名登录会话。
3. 登录成功后使用 `cloudbaseApp.callFunction()` 调用 `adminApi` Event Function。
4. `adminApi` 从调用上下文读取认证 UID，并查询 `admins` 集合。
5. 仅 `status=active` 的管理员记录可以继续访问业务数据。

不得用请求参数传入 UID、OpenID 或角色来替代服务端身份判断。

## 云函数权限

`cloudfunctions/adminApi` 不接受浏览器共享 token。Web 管理员以 `authUid` 授权；小程序 OpenID 仅保留为兼容迁移路径：

```json
{
  "authUid": "CloudBase Auth 用户 UID",
  "role": "owner",
  "status": "active",
  "name": "管理员名称"
}
```

每次管理接口调用会向 `admin_operation_logs` 写入最小化审计信息，包括管理员、动作、目标 ID、家庭 ID、是否查看敏感健康字段和时间；用户、反馈、家庭、兑换码批次及订单动作都必须能定位目标。日志不得保存完整健康内容、兑换码明文或密钥。

运营中心可编辑会员中心的兑换提示文案。配置保存在 `app_configs/membership` 文档的 `membershipPurchaseGuide` 字段中，不能为空且最多 120 字；文案不得包含购买或外部渠道信息，审计日志只记录配置目标和操作动作，不保存完整文案。

## 当前模块

- 总览：用户、家庭、会员、记录、药箱、附件和趋势。
- 运营中心：会员、兑换码和 AI 用量。
- 风险关注：临期、低库存、资料缺口、待确认附件。
- 数据总表与分表：用户、家庭、订单、退款、会员、优惠券、兑换码、AI、药品、病程、用药、附件和反馈。
- 所有分表支持搜索与服务端分页；总览统计卡片可进入对应分表。退款表从订单中的真实退款字段生成，显示申请金额、确认已退金额、未退金额、状态和时间，以订单号关联；每笔订单目前只允许一次后台退款。全局规则和未兑换码没有用户归属时显示未关联，不伪造用户。
- 支付订单和退款历史是保留记录：退款只更新原订单状态及退款字段，订单表不提供删除操作，列表也包含已退款订单；退款视图引用同一订单数据，避免复制后金额不一致。

## 上线前验收

- 浏览器构建产物中不存在管理密钥、服务端 secret 或共享管理 token。
- 未登录、会话过期、非管理员账号均无法读取真实数据。
- 真实管理员可以分页查看授权范围内的数据。
- 每次敏感查看、导出和写操作都有审计记录。
- 用户列表和家庭详情不返回 OpenID；家庭成员默认隐藏过敏史和既往病史，仅 Owner 二次确认后临时查看。
- 在桌面和 390px 移动宽度验证导航与表格可用。
- `ADMIN_WEB_AUTH_E2E_PASSED=true` 只能在 Owner 登录、非管理员拒绝和真实 Event Function 调用全部通过后填写。
