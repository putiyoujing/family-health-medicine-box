# 家人健康记｜前台-后台-服务端字段矩阵

## 1. 病程与事件

| 前台展示 | 服务端对象 | 服务端字段 | 后台展示 | 来源 |
|---|---|---|---|---|
| 成员 | `illness_records` | `memberId` | 病程记录-成员 | 用户选择 |
| 病程开始时间 | `illness_records` | `startedAt` | 病程记录-开始时间 | 用户输入 / 自动创建 |
| 当前状态 | `illness_records` | `status` | 病程记录-状态 | 用户更新 |
| 主症状 | `illness_records` | `mainSymptoms` / `symptoms` | 病程记录-主症状 | 事件聚合 |
| 最高体温 | `illness_records` | `temperatureMax` | 病程记录-最高体温 | 事件聚合 |
| 体温事件 | `course_events` | `eventType=temperature` | 病程事件-体温 | 快速记录 / 追加记录 |
| 症状事件 | `course_events` | `eventType=symptom` | 病程事件-症状 | 快速记录 / 追加记录 |
| 备注事件 | `course_events` | `eventType=note` | 病程事件-备注 | 快速记录 / 追加记录 |
| 就诊事件 | `course_events` | `eventType=visit` | 病程事件-就诊 | 用户补充 / 附件确认 |
| 检查事件 | `course_events` | `eventType=exam` | 病程事件-检查 | 附件确认 |
| 用药事件 | `course_events` | `eventType=medication` | 病程事件-用药 | `medication_logs` 派生 |

## 2. 附件与解析

| 前台展示 | 服务端对象 | 服务端字段 | 后台展示 | 来源 |
|---|---|---|---|---|
| 已上传附件 | `attachments` | `status=uploaded` | 附件与解析-状态 | 用户上传 |
| 解析结果 | `ai_tasks` | `output` | AI 任务-输出 | OCR / AI |
| 待确认 | `attachments` | `status=parsed` | 附件与解析-待确认 | 系统解析后 |
| 已确认 | `attachments` | `status=confirmed` | 附件与解析-已确认 | 用户确认 |
| 被拒绝 | `attachments` | `status=rejected` | 附件与解析-已拒绝 | 用户拒绝 |
| 附件来源事件 | `course_events` | `sourceType=attachment_confirmed` | 病程事件-来源 | 用户确认后派生 |

## 3. 用药与药箱

| 前台展示 | 服务端对象 | 服务端字段 | 后台展示 | 来源 |
|---|---|---|---|---|
| 药品名称 | `medicines` | `name` | 药箱管理-药名 | 用户录入 / 识别确认 |
| 剩余量 | `medicines` | `remainingQuantity` | 药箱管理-剩余量 | 初始录入 / 自动扣减 |
| 用药记录 | `medication_logs` | `medicineId / doseQuantity / takenAt` | 用药记录 | 用户保存 |
| 用药后反应 | `medication_logs` | `reaction` | 用药记录-反应 | 用户填写 |
| 关联病程 | `medication_logs` | `illnessRecordId` | 用药记录-病程 | 用户选择 / 自动带入 |

## 4. 复诊摘要

| 前台展示 | 服务端对象 | 服务端字段 | 后台展示 | 来源 |
|---|---|---|---|---|
| 病程概览 | `followup_summaries` | `summaryText` | 复诊摘要-正文 | 已确认数据整理 |
| 想问医生的问题 | `followup_summaries` | `questions[]` | 复诊摘要-问题数 | 用户手动输入 / 模板选择 |
| 生成时间 | `followup_summaries` | `generatedAt` | 复诊摘要-生成时间 | 系统 |
| 是否复制 | `followup_summaries` | `copiedAt` | 复诊摘要-复制状态 | 用户动作 |
| 是否下载 / 分享 | `followup_summaries` | `exportedAt / sharedAt` | 复诊摘要-下载分享 | 用户动作 |

## 5. 需要补充的新接口

| 接口 | 说明 |
|---|---|
| `saveCourseEvent` | 保存单个病程事件 |
| `listCourseEvents` | 查询某病程事件流 |
| `getIllnessDetail` | 查询病程主表 + 事件摘要 |
| `generateFollowupSummary` | 生成单病程复诊摘要 |
| `getFollowupSummary` | 查询摘要快照 |
| `listFollowupSummaries` | 后台列表 |
| `listCourseEventsForAdmin` | 后台查看事件 |

## 6. 现有接口需要调整

| 现有接口 | 调整 |
|---|---|
| `saveIllness` | 仅保存病程主表，不再承接每一次变化 |
| `saveMedication` | 保存后同时派生 `medication event` |
| `confirmAiParseResult` | 确认后根据类型派生 `exam / visit / medicine` |
| `exportReport` | 保留家庭周期报告；新增单病程摘要接口，不再混用 |
