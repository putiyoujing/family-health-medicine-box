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

左侧菜单已按独立页面组织，方便后续扩展：

- 总览：用户、家庭、会员家庭、订单、药品、健康记录等核心指标。
- 运营中心：会员收入、付费订单、待支付订单、优惠券核销、AI 用量、套餐结构。
- 风险关注：快过期药品、低库存药品、成员档案缺口、待 OCR 附件。
- 趋势分析：7 天新增用户、订单、付费订单、AI 用量、健康记录、用药记录。
- 数据总表：所有业务数据表的总量、当前已载入行数和分表入口。
- 分表详情：用户表、家庭表、订单表、会员家庭表、优惠券表、AI 用量表、药品表、健康记录表、用药记录表、附件表。

每个分表都是独立页面，后续可以分别增加筛选、分页、导出、详情弹窗和运营操作。

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

已支持的核心 action：

- `getDashboard`
- `getDataOverview`
- `listUsers`
- `listFamilies`
- `listOrders`
- `listSubscriptions`
- `listCoupons`
- `listAiUsage`
- `listMedicines`
- `listIllness`
- `listMedication`
- `listAttachments`

各分表接口会返回 `list`、`skip`、`limit`、`total`、`hasMore`，用于后续分页和导出扩展。

也可以通过请求头传：

```http
X-Admin-Token: 同一个 ADMIN_WEB_TOKEN
```

## 部署建议

微信云函数本身不是传统 Web API。实际部署时推荐二选一：

1. 使用云开发 HTTP 触发器/云托管网关暴露 `adminApi`。
2. 单独部署一个轻量 Node.js 管理网关，再由网关调用云开发环境。

不要把云数据库权限直接暴露给浏览器。
