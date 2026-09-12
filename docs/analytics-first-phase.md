# 健康助手第一期数据监控

## 目标

第一期只监控“健康记录是否完成”和“AI/图片链路是否健康”。We 分析负责匿名用户行为，现有数据库和管理后台继续负责病程、药品、AI 用量等业务事实。

## 事件字典

| 事件 | 触发时机 | 关键属性 |
| --- | --- | --- |
| `quick_record_start` | 进入快速记录页 | `entry=quick` |
| `record_content_add` | 首次输入文字或成功上传图片 | `input_type` |
| `image_upload_result` | 健康图片上传完成或失败 | `image_type`, `status`, `count_bucket` |
| `record_ai_start` | 开始整理文字/图片 | `input_type` |
| `record_ai_result` | 本次整理全部完成或部分失败 | `input_type`, `status`, `latency_bucket` |
| `record_result_view` | AI 返回结果并展示给用户 | `image_type`, `status` |
| `record_confirm` | 用户确认 AI 结果或成功保存手动病程 | `entry`, `status` |
| `record_created` | 新病程记录创建成功 | `entry`, `status` |
| `record_quota_blocked` | 快速记录因额度被拦截 | `entry`, `status`, `source` |
| `medicine_suggest_view` | 处方识别出药品建议并展示 | `count_bucket`, `status` |
| `medicine_confirm_add` | AI 处方建议成功加入药箱 | `status` |
| `medicine_skip` | 用户暂不加入某项药品 | `status` |
| `medicine_manual_add` | 手动新增药品成功 | `entry`, `status` |
| `service_error` | 上传、AI、保存等服务失败 | `source`, `status` |
| `family_create_result` | 首次写入时按需创建家庭 | `entry`, `status` |
| `family_invite_result` | 创建或接受家庭邀请 | `entry`, `status` |
| `membership_redeem_result` | 会员兑换成功或失败 | `tier`, `status` |

属性只使用枚举和分档值，不传姓名、OpenID、手机号、疾病名称、诊断原文、处方原文、OCR 全文、语音全文或症状描述。`tier` 只允许 `free`、`paid`、`unlimited`、`unknown`。

## 第一期漏斗

1. 快速记录：`quick_record_start` → `record_content_add` → `record_created` → `record_ai_start` → `record_ai_result`
2. AI 审核：`record_ai_result` → `record_result_view` → `record_confirm`
3. 处方药品：`medicine_suggest_view` → `medicine_confirm_add` / `medicine_skip`
4. 新用户写入：`family_create_result` → `record_created` 或药品新增
5. 快速记录权益：`record_quota_blocked` → `membership_redeem_result`

## 上线前动作

在微信公众平台 We 分析中创建与代码同名的自定义事件，并配置上表中的属性。开发版先验证事件上报，再进入体验版；本期不新增第三方分析 SDK、不抓取 We 分析网页，也不新增 `daily_metrics` 数据表。
