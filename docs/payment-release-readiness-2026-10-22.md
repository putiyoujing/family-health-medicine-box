# 家人健康记：需求、开发进度与支付上线状态（2026-10-22）

> 进展更新：支付道具素材 PR #16 与退款失败状态修复 PR #17 均已通过 CI 并合并。最新本地 `npm run check` 为 337/337；后台退款规则见[后台退款规则与验收](admin-refund-acceptance-2026-10-22.md)。四个微信道具已发布；生产 `orders` 两个支付复合索引、两支新版云函数与五分钟对账触发器已创建并回读，timer 空队列运行通过。密钥需轮换，发货推送、真机付款和真实退款尚未验收，上线判定继续为 NO-GO。

## 结论

`1.1.1` 支付候选源码已合并到 GitHub `master`；定时器兼容修复单独提交为 PR #19，本次运行 `npm run check`，337 项测试全部通过。生产 `paymentApi` 和 `adminApi` 已部署新版事件函数；`paymentApi.getPlans` 云端调用成功且返回 `paymentCapability.ready: false`，`adminApi` 拒绝未登录访问；标准 timer 已在空队列下运行成功。**真实支付上线仍为 BLOCKED**：密钥轮换、发货推送路由、真实订单补偿、真机付款与退款证据未完成。不能将代码部署或本地通过写成已完成支付测试或可正式收款。

## 当前需求与完成情况

| 需求 | 源码进度 | 生产/设备证据 |
| --- | --- | --- |
| 家庭登录、成员/药箱/病程/用药/报告/提醒 | 已有实现及自动测试 | 线上版本与设备回归需按本次候选重新确认 |
| 会员绑定家庭、兑换码激活、权益限制 | 已有实现；兑换事务和并发恢复纳入 1.1.1 | 新版 `paymentApi` 已部署；兑换真机回归未完成 |
| 四档会员套餐、订单和优惠券 | 已有前后端及自动测试 | 四个微信虚拟支付道具已发布；用户截图核对 ID、价格和图片，商品 ID 已录入 `paymentApi` |
| 虚拟支付双签名、平台查单、可信发货回调、幂等开通 | 1.1.1 源码和专项测试已完成，云函数已部署 | 凭证轮换、消息推送、真机付款均未验收 |
| 五分钟漏回调对账与退款状态识别 | 源码、后台退款与权益回收测试已完成；定时器事件格式已修复 | 两个订单索引和触发器已创建；空队列实际运行通过，真实订单补偿与退款未验收 |
| iOS 购买 | 代码默认关闭 | 平台截图显示 Apple IAP 已开通，但服务端边界与 iOS 真机未验收，继续关闭 |
| Web 管理后台统计及订单查看 | 已有实现 | 本轮未重新核对线上后台 |

## 本次核验依据

- GitHub PR #12–#18 均已合并，CI `verify` 通过；独立工作区的 `npm run check` 通过：337/337 测试、构建、lint、119 个 JavaScript 文件语法、28 个页面、61 个云函数动作及 22 项静态安全检查。新增测试覆盖腾讯云标准 `Timer` 事件及带用户身份的伪造请求。
- CloudBase `family-health-prod-d9csm29f27d75` 只有一个环境；2026-10-22 21:04（北京时间）`paymentApi` 与 `adminApi` 更新了代码，回读状态均为 `Active`，源码分别包含退款权益回放与后台退款模块。两支函数的 `WX_APP_SECRET`、`VIRTUAL_PAYMENT_APP_KEY` 环境变量已设置，四个商品 ID 与微信后台一致；本文件不记录密钥值。`VIRTUAL_PAYMENT_ENABLED` 仍未开启。`paymentApi` 超时为 10 秒，五分钟 timer 触发器已创建并回读；空队列实际运行日志已确认。
- 上线前须由项目负责人轮换 AppSecret 与现网 AppKey，并更新两支云函数的同名环境变量。轮换完成前禁止开启支付；任何文档、提交、测试记录均不得包含密钥值。
- 首次 timer 于 21:10:06（北京时间）调用 `paymentApi`，日志返回 `unknown payment action: empty`，说明旧代码未识别标准 SCF Timer 事件。已依据[腾讯云定时触发器事件格式](https://cloud.tencent.com/document/product/583/9708)和[运行时内置 `TRIGGER_SRC` 标识](https://docs.cloudbase.net/cloud-function/function-configuration/env)修复，于 21:13:40 部署；21:15:01 的真实 timer 日志返回 `ok: true, scanned: 0, succeeded: 0, failed: 0`。这证明调度和空队列分支，不能证明真实订单补偿。
- 首次核验时生产 `orders` 集合记录数为 0，仅有 `_id` 和 `_openid` 默认索引；随后已新增并回读核验 `payment_status_created` 与 `payment_status_delivery_created`。`orders` 权限为 `ADMINONLY`，`paymentApi` 仅允许非匿名调用。
- 浏览器安全策略禁止直接读取 `mp.weixin.qq.com`。项目负责人提供的线上道具截图显示 `pro_month_01` / ¥9.90、`pro_year_01` / ¥99.00、`unlimited_month_01` / ¥19.90、`unlimited_year_01` / ¥199.00 均于 2026-10-22 发布；基础配置截图中的 AppID `wxc3d708e7c51d5c87` 和 Offer ID `1450655131` 与源码一致。回调配置仍待截图及实际验证。
- 原工作区 `feature/membership-center-display` 有未提交的会员展示和健康审查改动，未纳入本次支付分支。

## 可执行的收尾顺序

1. 项目负责人在小程序后台轮换 AppSecret 与现网 AppKey，并只在 CloudBase `paymentApi` 与 `adminApi` 的 `WX_APP_SECRET`、`VIRTUAL_PAYMENT_APP_KEY` 环境变量中填入新值；保留其他变量。密钥不放入聊天或仓库。轮换后仅回读配置项**是否存在**，不展示值。保持 `VIRTUAL_PAYMENT_ENABLED` 与 `VIRTUAL_PAYMENT_IOS_ENABLED` 关闭。
2. 核对小程序后台「虚拟支付 → 基本配置 → 发货推送配置」及跳转的「开发管理 → 消息推送」实际字段，选择能订阅虚拟支付事件并将可信推送送到 `paymentApi` 的方式。新版 `paymentApi`、`adminApi`、订单复合索引、10 秒超时和五分钟触发器已配置；timer 空队列实际运行通过，继续核对发货/退款推送与真实订单补偿，再考虑启用支付。
3. 在隔离测试条件下验证下单、取消、超时、回调重放、漏回调补偿和退款规则；核对金额、微信订单号、单次权益发放和后台记录。生产健康数据、兑换码与现有订单不作测试夹具。
4. 用 Android 微信真机完成一笔经项目负责人同意金额的付款并保存订单、回调日志和会员状态证据；随后验证后台退款、上传体验版、做全功能回归，再进入微信审核。正式发布使用尚未上线的新版本号。

项目负责人接受的真实付款上限为 **1.00 元**。现有最低套餐为 **9.90 元**，因此不能直接以现有套餐做这笔实付。当前账号只发现生产云环境；若要用 1 元测试商品，须先建立真正隔离的测试环境及匹配价格的测试套餐，或经平台支持的测试模式验证。不能临时改写生产 `plans` 价格。CloudBase [虚拟支付指南](https://docs.cloudbase.net/integration/wechat-virtual-pay)要求道具价与签名价一致，并说明其示例固定使用现网，真机付款才可证明完整链路。

## 发布判定

| 层次 | 状态 |
| --- | --- |
| 本地源码与自动测试 | PASS |
| GitHub 合并及 CI | 既有 PR 已合并；定时器修复 PR #19 的 CI 通过 |
| 云端支付代码与资源配置 | PARTIAL：函数、索引、触发器已就绪，timer 空队列运行通过；密钥待轮换，真实订单未验证 |
| 微信平台商品 | PASS：四个正式道具已发布 |
| 微信平台发货/退款回调 | BLOCKED |
| Android 真机实付及退款规则 | BLOCKED |
| 1.1.1 正式收款上线 | NO-GO |

`npm run check:release:production` 的支付声明只能在对应证据真实取得后填写。声明通过本身仍不等于微信审核或真机验证通过。
