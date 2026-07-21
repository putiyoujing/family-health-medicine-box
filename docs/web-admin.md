# Web 管理后台

更新时间：2026-07-12

本项目包含面向产品运营人员的独立 Web 后台。公开部署的静态页面默认只能展示演示数据；真实健康数据必须通过带管理员登录会话的可信服务端网关访问。

## 本地运行

```bash
npm install
npm run dev
```

开发模式自动使用 `/api/admin` 本地接口和 `.local-data/admin-store.json`，不需要把生产管理密钥放入浏览器。

## 生产连接方式

前端只接受一个公开配置：

```env
VITE_ADMIN_API_BASE=https://your-authenticated-admin-gateway.example.com/api/admin
```

生产网关必须：

- 有独立的管理员登录、会话过期和退出能力。
- 使用 `HttpOnly`、`Secure`、合适 `SameSite` 的 Cookie 保存会话。
- 在服务端校验管理员身份和权限，再调用微信云环境。
- 限制允许来源，不能使用 `Access-Control-Allow-Origin: *` 搭配敏感接口。
- 对敏感详情查看、导出、兑换码操作等写入审计日志。
- 不把服务端密钥、管理员 token 或云开发密钥返回给浏览器。

严禁使用 `VITE_ADMIN_API_TOKEN`、`VITE_*SECRET` 等变量保存共享管理密钥。所有 `VITE_*` 变量都会进入浏览器静态包，访问者可直接读取。

当前仓库尚未包含生产管理员登录网关，因此：

- GitHub Pages 版本只能作为无真实数据的演示后台。
- 不得把 `adminApi` 直接以共享 token 方式暴露到公网。
- 正式连接真实数据前，`npm run check:release:production` 应保持失败。

## 云函数权限

`cloudfunctions/adminApi` 不再接受浏览器共享 token。云函数调用必须带可信的微信身份上下文，并要求 `admins` 集合存在一条启用记录：

```json
{
  "openid": "管理员 openid",
  "status": "active",
  "name": "管理员名称"
}
```

每次管理接口调用会向 `admin_operation_logs` 写入最小化审计信息，包括管理员、动作、目标 ID、家庭 ID 和时间；日志不得保存完整健康内容或密钥。

## 当前模块

- 总览：用户、家庭、会员、记录、药箱、附件和趋势。
- 运营中心：会员、兑换码和 AI 用量。
- 风险关注：临期、低库存、资料缺口、待确认附件。
- 数据总表与分表：用户、家庭、订单、会员、优惠券、兑换码、AI、药品、病程、用药和附件。
- 分表列表支持服务端分页；统计异常会明确报错，不再伪装成零数据。

## 上线前验收

- 浏览器构建产物中不存在管理 token、secret 或 `ADMIN_WEB_TOKEN`。
- 未登录、会话过期、错误角色全部返回 401/403。
- 真实管理员可以分页查看授权范围内的数据。
- 每次敏感查看、导出和写操作都有审计记录。
- 在桌面和 390px 移动宽度验证导航与表格可用。
- 生产网关完成限流、CSRF 防护、会话撤销和安全告警。
