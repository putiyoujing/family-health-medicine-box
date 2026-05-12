# Web 管理后台

本项目包含一个独立 Web 管理后台，用于产品管理者查看整体运营数据。

## 本地打开

```bash
npm install
npm run dev
```

默认会显示演示数据。要连接真实数据，需要配置 `.env`：

```bash
copy .env.example .env
```

然后填写：

```env
VITE_ADMIN_API_BASE=https://你的管理接口地址
VITE_ADMIN_API_TOKEN=你的管理后台 token
```

## 后台可看什么

- 用户数
- 家庭数
- 家庭成员数
- 药品数
- 健康记录数
- 用药记录数
- 附件数
- 提醒数
- 快过期药品
- 低库存药品
- 成员档案缺口
- 待 OCR 附件
- 7 天新增趋势
- 用户/家庭/药品/健康记录/用药/附件列表

## 后端接口

Web 后台调用 `cloudfunctions/adminApi`。

为了让 Web 后台安全访问，需要给 `adminApi` 配置环境变量：

```env
ADMIN_WEB_TOKEN=一个足够长的随机密钥
```

Web 请求会携带：

```json
{
  "action": "getDashboard",
  "adminToken": "同一个 ADMIN_WEB_TOKEN",
  "payload": {}
}
```

也可以通过请求头传：

```http
X-Admin-Token: 同一个 ADMIN_WEB_TOKEN
```

## 部署建议

微信云函数本身不是传统 Web API。实际部署时推荐二选一：

1. 使用云开发 HTTP 触发器/云托管网关暴露 `adminApi`。
2. 单独部署一个轻量 Node.js 管理网关，再由网关调用云开发环境。

不要把云数据库权限直接暴露给浏览器。
