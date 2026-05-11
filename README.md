# 家庭健康记录与药箱管理小程序

这是知识库项目“家庭健康记录与药箱管理系统”的微信小程序版本，目标是对外发布，而不是单独的 Web 页面。

## 当前架构

- `miniprogram/`：微信原生小程序前端
- `cloudfunctions/login`：用户登录、openid 获取、首次家庭初始化
- `cloudfunctions/healthApi`：统一业务后台接口
- `docs/`：数据库与发布说明
- `src/`：上一轮 Web 原型，仅作为交互参考，不是发布主线

## 已实现

- 用户 openid 登录与家庭初始化
- 家庭成员管理
- 药箱库存管理
- 生病记录
- 用药记录自动扣减库存
- 检查单 / 处方图片上传到云存储，并生成附件记录
- AI 查询助手安全版，先基于数据库检索，不做诊断或处方
- 家庭数据导出
- 按家庭 `familyId` 做数据隔离

## 微信开发者工具运行

1. 用微信开发者工具打开本仓库根目录。
2. 在 `project.config.json` 中替换正式 `appid`。
3. 在 `miniprogram/app.js` 中填写云开发环境 `ENV_ID`。
4. 在云开发控制台创建数据库集合，见 [docs/wechat-cloud-database.md](docs/wechat-cloud-database.md)。
5. 上传并部署 `cloudfunctions/login` 和 `cloudfunctions/healthApi`。
6. 编译运行小程序。

## Web 原型验证

如果需要查看上一版 Web 原型：

```bash
npm install
npm run dev
```

## 发布前检查

见 [docs/release-checklist.md](docs/release-checklist.md)。

## 医疗安全边界

本系统仅用于家庭健康记录、历史信息查询和医嘱整理，不提供疾病诊断、处方建议或剂量调整建议。用药请遵医嘱或咨询医生/药师；如症状加重或出现紧急情况，请及时就医。
