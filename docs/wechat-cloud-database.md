# 微信云开发数据库设计

本项目使用微信小程序云开发作为发布主线。

## 集合

- `users`：用户信息，按 openid 创建。
- `admins`：管理后台白名单。
- `families`：家庭空间。
- `family_roles`：家庭成员权限，`owner/admin/member/viewer`。
- `family_members`：家庭成员档案。
- `medicines`：药箱药品库存。
- `illness_records`：健康记录。
- `medication_logs`：用药记录。
- `attachments`：检查单、处方、药盒、说明书等附件。
- `reminders`：提醒记录。

## 权限原则

小程序端不直接写数据库，统一通过 `healthApi` 云函数读写。

云函数每次请求都会：

1. 通过 `cloud.getWXContext()` 获取 openid。
2. 查询 `family_roles` 得到当前用户所属家庭。
3. 所有业务集合按 `familyId` 隔离。
4. 删除采用软删除，写入 `deletedAt`。

## 云函数

### login

首次进入时创建：

- `users`
- `families`
- `family_roles`

### healthApi

统一业务入口：

- `getHome`
- `saveMember` / `deleteMember`
- `saveMedicine` / `deleteMedicine`
- `saveIllness` / `deleteIllness`
- `saveMedication` / `deleteMedication`
- `saveAttachment` / `deleteAttachment`
- `saveReminder` / `deleteReminder`
- `assistantQuery`
- `exportData`

### adminApi

管理后台接口，必须先通过 `admins` 集合校验。

支持：

- `getDashboard`：全局统计。
- `listUsers`：用户列表。
- `listFamilies`：家庭列表。
- `listMedicines`：药品列表。
- `listIllness`：健康记录列表。
- `listMedication`：用药记录列表。
- `listAttachments`：附件列表。

## 管理员配置

上线前需要手动在 `admins` 集合添加管理员：

```json
{
  "openid": "管理员 openid",
  "status": "active",
  "name": "管理员名称",
  "createdAt": "2026-05-12"
}
```

普通用户没有 `admins.status=active` 时，访问管理后台会返回无权限。

## 发布前必须配置

1. 在微信开发者工具中开通云开发环境。
2. 把云环境 ID 写入 `miniprogram/app.js` 的 `ENV_ID`。
3. 上传并部署 `cloudfunctions/login`。
4. 上传并部署 `cloudfunctions/healthApi`。
5. 上传并部署 `cloudfunctions/adminApi`。
6. 创建上述数据库集合。
7. 云存储开启，用于检查单、处方、药盒、说明书图片。

## 后续增强

- 微信 OCR 或腾讯云 OCR 接入 `attachments.ocrText`。
- DeepSeek API 接入 `assistantQuery`，但必须维持当前安全边界：模型只接收必要上下文，不直接访问全量数据库。
- 家庭邀请可扩展 `family_roles`。
