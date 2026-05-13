# 家人健康记小程序开发结果总结

更新时间：2026-05-12

## 1. 项目定位

本项目是一个微信小程序产品，产品名为「家人健康记」，定位为家庭健康管理与记录工具。核心目标是帮助家庭记录成员健康情况、管理家庭药箱药品、追踪用药记录，并为产品管理者提供后台数据统计。

项目包含三部分：

- 微信小程序前端：面向家庭用户使用。
- 微信云开发后端：负责用户身份、家庭数据、药箱记录、健康记录、用药记录和管理统计接口。
- Web 管理后台：面向产品管理者查看用户规模、会员收入、订单、优惠券、AI 用量、风险数据和明细列表。

## 2. 代码与发布地址

- 本地项目目录：`F:\Project\xiaochengxu\family-health-medicine-box`
- GitHub 仓库：<https://github.com/putiyoujing/family-health-medicine-box>
- Web 管理后台线上地址：<https://putiyoujing.github.io/family-health-medicine-box/>
- 微信开发者工具导入目录：`F:\Project\xiaochengxu\family-health-medicine-box`

## 3. 小程序功能完成情况

已完成页面：

- 首页数据概览
- 家庭药箱记录
- 健康记录
- 用药记录
- AI 助手
- 个人中心
- 家庭管理、邀请家人、切换家庭
- 会员中心、优惠券选择、支付确认
- 图片整理确认页
- 导出就医记录
- 提醒管理

已完成能力：

- 家庭成员与家庭空间初始化
- 多家庭列表、家庭切换、家庭邀请、共享角色管理
- 家庭药箱药品记录
- 外包装、药瓶和说明书拍照上传，并可关联药品记录
- 药品有效期、低库存提醒基础能力
- 健康记录录入与查看
- 检查单和处方图片上传，并可进入图片整理确认页
- 用药记录录入
- 用药后自动扣减库存
- AI 助手基于本地记录进行检索式整理
- 会员中心支持套餐选择、优惠券选择、订单创建和支付确认开通
- 就医沟通记录导出
- 用药提醒、复诊提醒和药箱检查提醒记录
- 医疗安全边界提示，不提供诊断、处方或剂量建议
- 底部 tabBar 图标已补齐，并重新优化了「用药」图标
- 文案已统一为「健康记录」作为产品表达

## 4. 后端完成情况

已完成微信云函数：

- `login`：获取 openid，初始化用户、家庭和成员数据。
- `healthApi`：提供小程序核心业务接口，包括药箱记录、健康记录、用药记录、附件、统计和 AI 安全查询。
- `healthApi`：新增图片解析任务、解析确认、就医记录导出和提醒记录。
- `paymentApi`：提供会员套餐、优惠券、订单创建和支付确认开通。
- `adminApi`：提供管理后台统计、订单、会员家庭、优惠券和 AI 用量列表接口。

核心数据集合设计：

- `users`
- `families`
- `family_members`
- `medicines`
- `illness_records`（前端统一展示为「健康记录」）
- `medication_logs`
- `attachments`
- `admins`
- `family_invites`
- `plans`
- `orders`
- `subscriptions`
- `coupons`
- `coupon_redemptions`
- `ai_tasks`
- `ai_usage_logs`

管理后台权限：

- C 端小程序不展示管理后台入口。
- Web 管理后台支持 `ADMIN_WEB_TOKEN` 作为接口访问 token。

## 5. Web 管理后台完成情况

Web 后台位于项目 `src/` 目录，使用 React + Vite 实现。

已完成模块：

- 总览统计：用户数、家庭数、成员数、药品数、健康记录数、用药记录数、附件数、提醒数。
- 运营中心：会员收入、付费订单、待支付订单、会员家庭、优惠券核销、AI 用量。
- 7 天趋势：新增用户、订单、付费订单、AI 用量、健康记录、用药记录。
- 风险数据：临期药品、低库存药品、资料未完善成员、待处理附件。
- 健康度指标：平均家庭成员数、平均药品数、平均健康记录数、用药/健康记录比例、附件覆盖率。
- 左侧菜单已拆分为独立页面，后续每个模块可以单独扩展筛选、分页、导出和运营动作。
- 数据总表：展示所有业务表总量、当前已载入行数和分表入口。
- 分表详情：用户、家庭、订单、会员家庭、优惠券、AI 用量、药品、健康记录、用药记录、附件均有独立明细页。
- 未配置真实接口时显示演示数据。
- 配置真实接口后可读取 `adminApi` 的真实数据。

线上后台当前已通过 GitHub Pages 发布：

<https://putiyoujing.github.io/family-health-medicine-box/>

## 6. GitHub Pages 发布情况

仓库已从 Private 改为 Public，并启用 GitHub Pages。

已添加发布工作流：

- `.github/workflows/pages.yml`

发布方式：

- 推送到 `master` 后自动构建 Web 管理后台。
- 构建产物来自 `dist/`。
- Pages 地址为：<https://putiyoujing.github.io/family-health-medicine-box/>

## 7. 微信开发者工具使用说明

在微信开发者工具中导入：

1. 打开微信开发者工具。
2. 选择「导入项目」。
3. 项目目录选择：`F:\Project\xiaochengxu\family-health-medicine-box`
4. AppID 可先使用测试号，正式上线前换成正式小程序 AppID。
5. 进入 `miniprogram/app.js`，把 `ENV_ID` 改成正式微信云开发环境 ID。
6. 上传并部署云函数：
   - `cloudfunctions/login`
   - `cloudfunctions/healthApi`
   - `cloudfunctions/adminApi`
   - `cloudfunctions/paymentApi`
7. 按 `docs/wechat-cloud-database.md` 初始化数据库集合与索引。

## 8. 已执行验证

已通过检查：

- 云函数 JS 语法检查
- 小程序 JS 语法检查
- `npm run build`
- `npm run lint`
- 运行代码旧口径扫描：未再命中非「健康记录」表达
- GitHub Pages 发布成功
- 线上后台访问返回 200

最后确认的线上后台地址：

<https://putiyoujing.github.io/family-health-medicine-box/>

## 9. 上线前仍需配置

正式上线前需要补齐这些真实环境配置：

- 微信小程序正式 AppID
- 微信云开发正式环境 ID
- 云数据库集合权限与索引
- 管理员 openid 写入 `admins` 集合
- `ADMIN_WEB_TOKEN`
- Web 管理后台真实接口地址 `VITE_ADMIN_API_BASE`
- Web 管理后台访问 token `VITE_ADMIN_API_TOKEN`
- 上传并部署 `paymentApi` 云函数
- 在云数据库创建 `orders`、`subscriptions`、`coupons`、`coupon_redemptions`、`ai_usage_logs`
- 微信小程序隐私协议、用户协议、医疗安全免责声明
- 小程序审核所需截图、类目、服务说明

## 10. 当前结论

当前项目已经具备一个可演示、可继续上线配置的完整 MVP：

- 对用户端来说，小程序已覆盖家庭药箱记录、健康记录、用药记录和基础 AI 检索整理。
- 对商业化来说，已具备家庭共享、会员权益、订单、优惠券和支付确认闭环。
- 对产品管理者来说，已有独立 Web 管理后台，可查看用户、家庭、订单、会员、优惠券和 AI 用量。
- 对工程交付来说，代码已上传 GitHub，Web 后台已发布到 GitHub Pages。

后续重点不是继续补页面，而是接入真实微信云开发环境、配置数据库权限、接入真实图片识别、真实支付和订阅消息模板，并进行真实设备测试。
