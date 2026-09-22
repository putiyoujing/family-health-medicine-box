# 会员支付与兑换修复验收（2026-09-22）

## 范围与发布判定

- 修复分支：`fix/membership-payment-recovery`，候选版本 `1.1.1`。
- 仅处理会员页面、兑换、支付订单可靠性及相应测试；原工作区未提交的健康解析、病程复核、报告导出改动不属于本次发布。
- 保留原工作区，使用独立工作树集成现有会员展示改动。
- 正式收款仍为 **BLOCKED**，不能宣称端到端付款已跑通。用户提供的公众平台截图确认虚拟支付已开通，AppID `wxc3d708e7c51d5c87` 和 OfferID `1450655131` 已核验；AppKey、AppSecret、四个已发布商品 ID 的云函数配置、函数部署及真实支付确认链路仍待完成。
- 本轮不使用生产数据做成功兑换测试，不消费生产兑换码、不扣款。

## 公司团队角色与验收责任

| 角色 | 责任 | 必须给出的证据 |
|---|---|---|
| 后端可靠性工程师 | 兑换和模拟支付原子事务、订单幂等、权限 | 写入故障回滚、并发和重试测试 |
| 前端工程师 | 会员加载、套餐兼容、支付能力提示、服务端结果确认 | 页面行为及错误恢复测试 |
| 独立 QA / 发布验收负责人 | 独立寻找遗漏并复验修复 | PASS / FAIL / BLOCKED 与未验证范围 |
| 集成负责人 | 全量检查、部署前核查、版本和文档 | 完整检查与线上只读调用证据 |

## 修复前证据

- 原工作区全量自动测试 227 项：218 通过、9 失败。
- 本地故障注入复现：订阅创建失败后兑换码停留在 `processing`，重试不可用。
- 本地故障注入复现：模拟支付先标 `paid` 后开通失败，重试返回成功但家庭仍为免费。
- 线上 `getPlans` 返回旧 `unlimited_pro`；新页面仅接受新月度/年度套餐标识，导致畅享版消失。
- 本地下单固定返回 `payment.ready: false`，正式支付没有完成实现。

## 服务端支付配置

真实支付配置只能写入 `paymentApi` 云函数环境变量，不写入小程序代码。`.env.example` 仅列出变量名和空占位值；不得把真实 AppSecret 或 AppKey 提交到仓库或聊天。

需要配置 `WX_APPID`、`WX_APP_SECRET`、`VIRTUAL_PAYMENT_ENABLED`、`VIRTUAL_PAYMENT_OFFER_ID`、`VIRTUAL_PAYMENT_APP_KEY`，以及四个已发布道具 ID：

- `VIRTUAL_PAYMENT_PRODUCT_MONTHLY_PRO`
- `VIRTUAL_PAYMENT_PRODUCT_YEARLY_PRO`
- `VIRTUAL_PAYMENT_PRODUCT_MONTHLY_UNLIMITED`
- `VIRTUAL_PAYMENT_PRODUCT_YEARLY_UNLIMITED`

缺少任一商品 ID 时，服务端支付能力保持未就绪，不会把套餐 ID 当作道具 ID 回退使用。`WX_APP_SECRET` 用于服务端将 `wx.login` code 换成 `session_key` 并校验 openid；CloudBase 官方小程序认证示例同样在云函数中通过 `https://api.weixin.qq.com/sns/jscode2session` 调用该接口，因此本实现保留服务端密钥变量。[CloudBase 小程序认证示例](https://docs.cloudbase.net/recipes/add-auth-wechat-miniprogram)

部署 `paymentApi` 后，还必须在 CloudBase 消息推送中为该云函数订阅 `event/xpay_goods_deliver_notify`。回调只接受 `cloud.getWXContext().SOURCE === 'wx_paycallback'` 的平台来源，并校验回调订单、openid、商品、金额和微信支付订单号；部署前无法证明平台推送已正确配置。

## iOS 支付配置

iOS 只有在公众平台已配置小程序简称并开通苹果 IAP、实际商品已发布后，才可将 `VIRTUAL_PAYMENT_IOS_ENABLED=true`。客户端还会检查 iOS 15 及以上、微信 8.0.68 及以上，并阻止低于 1 元的订单。当前代码和本地测试不能证明公众平台开通、商品同步或真机支付已通过；iOS 开关保持关闭，直到完成对应的体验版和真机验收。

## 用户提供的平台配置证据

- 用户提供的公众平台截图确认该小程序已开通虚拟支付；用户提供并核验的 AppID 为 `wxc3d708e7c51d5c87`，OfferID 为 `1450655131`。
- 截图显示 iOS 支付当前关闭。服务端 `VIRTUAL_PAYMENT_IOS_ENABLED` 默认关闭；用户愿意开启，但应在配置小程序简称、开通苹果 IAP、发布并同步商品后，再启用并完成真机检查。
- 截图和本地代码不能证明 AppKey、AppSecret 或商品 ID 已部署到云函数环境，也不能证明任何支付成功或权益发放链路已在云端运行。

## 修复前生产配置只读核验

- 环境：`family-health-prod-d9csm29f27d75`。
- 5 个现有云函数为 Active；`paymentApi` 为 Active / Available。
- 修复前 `paymentApi` 环境变量为空，无支付集成函数，超时时间 3 秒。
- `paymentApi` 调用规则要求非匿名身份；6 个兑换/订单核心集合均为 `ADMINONLY`。
- `orders`、`plans`、`subscriptions`、`coupon_codes`、`coupon_code_batches`、`coupon_redemptions`、`families` 集合均存在。
- 无身份下单与兑换返回 `no family permission`；生产模拟支付返回 `mock payment is disabled`。
- 上述平台开通状态来自用户提供的截图；本轮没有重新登录公众平台或读取云函数环境变量。

## 历史异常记录

旧 `processing` 兑换码必须核对订阅、兑换记录及家庭权益后再人工处理；不能仅因等待时间超过阈值就自动恢复可兑换，以免重复发放。新事务路径的失败回滚并不等于历史异常记录已修复。

## 正式支付后续验收门槛

1. 已确认虚拟支付开通及 AppID、OfferID；后续需确认四个商品已发布并同步，密钥只配置在服务端，不通过聊天或仓库传递。
2. 核验服务端下单签名、平台查单与已验证回调、订单与金额匹配、幂等开通；退款后的权益回收策略仍需单独设计和验收。
3. 在适当测试环境验证成功支付、取消、超时、回调重放、查询重试，保留订单状态证据。
4. 用户授权具体金额后进行必要真机实付验收；分别记录 Android、iOS 结果。

代码已加入每 5 分钟执行一次的虚拟订单对账触发器，只有 CloudBase 的 `wx_trigger` 来源能进入该路径；每批最多查询 20 笔、最多 3 笔并发，逐单隔离失败，微信已关闭的订单会更新为 `closed`，已确认发货订单不再进入批次。部署 `paymentApi` 后仍须创建并核验该定时触发器，将函数超时提高到至少 10 秒，并核验 `orders` 集合的复合索引 `(paymentMode, status, createdAt)` 与 `(paymentMode, status, deliveryStatus, createdAt)`。代码和本地测试不能证明云端触发器、索引或函数超时配置已生效。

## 本轮最终结果

- 后端可靠性、前端交互、独立 QA、安全复核和集成验收均已完成；专项支付/兑换故障注入、并发、伪造回调、回调重放、查单补偿及页面恢复用例全部通过。
- `npm run check` 通过：323/323 自动测试、22 项静态发布安全检查、构建、lint、114 个 JavaScript 文件语法、28 个页面配置和 61 个云函数动作覆盖均通过。
- `git diff --check` 通过；仓库未写入 AppSecret、AppKey、session_key 或生产兑换码。
- 云函数部署、CloudBase 消息推送订阅、定时触发器与索引核验、真实支付、退款权益回收和真机验收尚未完成，不能据本地测试宣称生产收款链路已通过。
