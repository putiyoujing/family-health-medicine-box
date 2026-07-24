# P0 发布证据记录（2026-07-24）

本页记录 `1.0.12` 在 2026-07-24 的实际发布证据。结论只覆盖已经执行并可回查的层级；本机环境变量中的 `true` 不替代微信平台、真实账号或真机证据。

## 发布对象

- 代码基线：`master`，应用源码基线提交 `fbb0d84664902fecdd32f1785d8689321fbc5c04`
- CloudBase 环境：`family-health-prod-d9csm29f27d75`
- 生产管理后台：<https://family-health-prod-d9csm29f27d75-1307117498.tcloudbaseapp.com/admin/>
- 构建入口：`admin/index.html`
- 当前 JS：`admin/assets/index-BCuvfXR-.js`
- 当前 CSS：`admin/assets/index-C7NKJGpi.css`

## 已完成证据

| 项目 | 状态 | 证据 |
|---|---|---|
| 干净依赖安装 | PASS | `npm ci --no-audit --no-fund` 成功 |
| 构建、Lint、语法、配置、动作覆盖 | PASS | `npm run check` 成功 |
| 自动化回归 | PASS | 154/154 |
| 安全与发布静态门禁 | PASS | 22 项保护通过 |
| 本机生产声明门禁 | PASS（仅声明） | `npm run check:release:production` 通过；不扩大为真实环境证据 |
| CloudBase 现网备份 | PASS | 上传前已将现有 `admin/` 下载到本机临时回滚目录 |
| 1.0.12 管理后台上传 | PASS | `admin/index.html`、新 JS/CSS 与图标均上传成功 |
| CloudBase 对象核验 | PASS | 新 JS 的 ETag 为 `2aa7da62a965d21ec30d4fcc85fa8ac4`；入口 ETag 为 `95c846286d87f21bdc3eb35c7e4c6ee0` |
| 公网入口与资源 | PASS | `/admin/` 返回 200 且引用 `index-BCuvfXR-.js`；该资源返回 200，长度 975821 字节 |
| 已登录浏览器渲染 | PASS | 生产后台完成实际渲染；未记录真实业务数据 |

首次全量回归在 Windows CRLF 工作区暴露了两个测试源码片段提取断言只接受 LF 的问题。测试正则已改为同时接受 LF/CRLF，定向测试 23/23、全量测试 154/154 均通过；业务实现未改动。

## 尚未完成的 P0

| 项目 | 状态 | 阻塞与完成条件 |
|---|---|---|
| 生产 WeChat AppSecret 轮换 | BLOCKED | 必须由管理员在微信公众平台重置，并直接写入 CloudBase `reminderDispatcher` 的 `WECHAT_MINIPROGRAM_APP_SECRET`；密钥不得发送到聊天、仓库或知识库 |
| AppSecret 轮换后函数回归 | BLOCKED | 保存配置并重新部署函数后，确认函数 Active、定时触发器启用、访问令牌无错误，再完成一条真实提醒 |
| 匿名管理后台拒绝 | BLOCKED | 本轮浏览器已有管理员会话；需使用无会话浏览器确认未登录用户无法读取任何业务数据 |
| 微信隐私保护指引 | BLOCKED | 保存后台配置或审核记录截图，覆盖实际使用的隐私接口 |
| 双账号家庭共享与跨家庭隔离 | BLOCKED | 两个真实微信账号执行邀请、角色权限、移除权限和跨家庭越权用例，并保存时间、步骤、结果与截图 |
| iOS 真机 | BLOCKED | 记录机型、系统、微信版本和 P0 黄金流程结果 |
| Android 真机 | BLOCKED | 记录机型、系统、微信版本和 P0 黄金流程结果 |
| 真实订阅消息触达 | BLOCKED | 保存授权、计划时间、实际送达、单次发送、点击跳转及数据库状态证据 |
| 微信审核与正式发布 | BLOCKED | 上述 P0 证据齐全后再提交审核 |

## AppSecret 安全交接步骤

1. 管理员登录微信公众平台，在开发配置中重置小程序 AppSecret。
2. 不复制到聊天或文档；直接在 CloudBase 控制台更新 `reminderDispatcher` 的 `WECHAT_MINIPROGRAM_APP_SECRET`。
3. 保留同一函数的其他环境变量，保存配置并重新部署。
4. 完成后只回复“已轮换并重新部署”，再由维护者核验函数状态、触发器与提醒链路，不读取或回显密钥。

## 当前发布结论

管理后台已经达到 `deployed + live verified（已登录会话）`。小程序公开发布仍为 `NO-GO`：AppSecret、匿名拒绝、隐私、双账号、iOS/Android 真机和真实提醒触达尚未形成闭环证据。
