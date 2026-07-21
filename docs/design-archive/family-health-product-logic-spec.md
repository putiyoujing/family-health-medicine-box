# 家人健康记｜前台-后台-服务端一致性设计规范

## 1. 核心对象分层

### 1.1 `illness_records`
一次连续病程的主记录，负责：

- 成员
- 开始时间
- 当前状态
- 主症状
- 最高体温
- 是否就医
- 本次总结

> 结论：它是 `Episode / 病程主表`，不应再承接每一次细碎变化。

### 1.2 `course_events`（新增）
病程中的事件流，负责时间线：

- `symptom`
- `temperature`
- `medication`
- `visit`
- `exam`
- `note`

字段建议：

```json
{
  "familyId": "",
  "illnessRecordId": "",
  "memberId": "",
  "eventType": "symptom|temperature|medication|visit|exam|note",
  "recordedAt": "",
  "title": "",
  "detail": "",
  "sourceType": "manual|medication_log|attachment_confirmed|doctor_note",
  "sourceId": "",
  "createdBy": ""
}
```

### 1.3 `attachments`
只负责文件与解析状态：

- 检查单
- 处方
- 药盒
- 说明书

关键状态：

- `uploaded`
- `parsed`
- `confirmed`
- `rejected`

> 原则：上传 ≠ 正式事件。必须经确认后，才能转成 `course_events`。

### 1.4 `ai_tasks`
负责 AI/OCR 的一次解析任务。

- 解析输入
- 结构化输出
- 状态
- 确认人
- 确认时间

### 1.5 `followup_summaries`（新增）
复诊摘要快照，负责：

- 所属病程
- 摘要生成时间
- 摘要正文
- 用户手动补充的问题
- 输出类型
- 是否已复制 / 下载 / 分享

## 2. 三条关键交互链

### 2.1 快速记录链

```text
首页点击“记一次生病”
  -> 进入快速记录
  -> 用户输入症状 / 体温 / 备注
  -> 服务端保存：
     - illness_records（若无进行中病程则新建）
     - course_events（按字段拆成事件）
  -> 病程详情按 recordedAt 排序展示事件
```

### 2.2 附件确认链

```text
上传图片
  -> attachments.status = uploaded
  -> parseAttachment
  -> ai_tasks.status = success / attachments.status = parsed
  -> 用户进入确认页，人工校对
  -> confirmAiParseResult
  -> attachments.status = confirmed
  -> 根据确认结果生成：
     - exam event
     - visit event
     - medicine data
     - 或仅保留附件
```

### 2.3 复诊摘要链

```text
病程详情点击“生成复诊摘要”
  -> 系统读取：
     - illness_records
     - course_events
     - medication_logs
     - 已确认 attachments
  -> 用户在生成前手动补充：
     - 想问医生的问题
  -> generateFollowupSummary
  -> followup_summaries 写入快照
  -> 前台显示复制文本 / 截图友好版
```

## 3. 前台页面与服务端对应

| 前台页面 | 关键数据 | 对应接口 |
|---|---|---|
| 首页 | 当前进行中病程、最近事件、最近摘要 | `getHome` |
| 快速记录 | 新病程 / 新事件 | `saveIllness` + `saveCourseEvent` |
| 病程列表 | 病程主记录 | `listIllness` |
| 病程详情 | 病程主记录 + 事件流 | `getIllnessDetail` + `listCourseEvents` |
| 上传确认 | 附件 + AI 解析结果 | `saveAttachment` + `parseAttachment` + `confirmAiParseResult` |
| 月视图 | 病程分布 + 日期聚合 | `listIllnessCalendar` |
| 复诊摘要 | 摘要快照 | `generateFollowupSummary` + `getFollowupSummary` |
| 药箱 | 药品库存 | `listMedicines` |
| 用药 | 用药记录 + 库存扣减 | `saveMedication` |

## 4. 后台页面与服务端对应

| 后台页面 | 关键对象 |
|---|---|
| 总览 | 用户、家庭、病程、事件、摘要、附件风险 |
| 病程记录 | `illness_records` |
| 病程事件 | `course_events` |
| 附件与解析 | `attachments` + `ai_tasks` |
| 复诊摘要 | `followup_summaries` |
| 用药记录 | `medication_logs` |
| 药箱管理 | `medicines` |
| AI 使用 | `ai_usage_logs` |

## 5. 现有实现与目标设计的差距

| 目标 | 当前状态 | 处理建议 |
|---|---|---|
| 病程主表 + 事件表分离 | 当前只有 `illness_records` | 新增 `course_events` |
| 附件确认后生成正式事件 | 当前 `confirmAiParseResult` 只回写附件结构化结果 | 确认后新增事件派生逻辑 |
| 单病程复诊摘要 | 当前 `exportReport` 只按最近 N 天导出 | 新增 `generateFollowupSummary(illnessRecordId)` |
| 想问医生的问题 | 当前无来源字段 | 放入 `followup_summaries.questions` |
| 后台查看事件 / 摘要 | 当前后台没有对应页面 | 增加 `listCourseEvents` / `listFollowupSummaries` |

## 6. 评审通过标准

1. 任何一个前台展示字段，都能追溯到：
   - 用户输入
   - 已确认附件
   - 已保存正式记录
2. 任何一个时间线事件，都能明确说出来源对象。
3. 未确认附件不会进入正式摘要。
4. “想问医生的问题”不能凭空出现，必须来自用户输入。
5. 前台、后台、服务端都能找到同一个对象的归宿。
