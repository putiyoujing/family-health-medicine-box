# 家人健康记项目文档地图

本目录用于沉淀「家人健康记」小程序、云函数、Web 管理后台、商业化与上线准备相关文档。阅读时建议先看当前状态，再看上线与配置，最后查设计归档。

## 推荐阅读顺序

1. [项目根说明](../README.md)：项目定位、目录结构、已实现能力、运行入口和医疗安全边界。
2. [版本记录](../CHANGELOG.md)：当前版本、重要变更、安全修复和已知后续项。
3. [开发结果总结](development-summary.md)：当前功能、后端、Web 管理后台、发布情况和已执行验证。
4. [上线准备工作清单](launch-prep-workplan.md)：上线前从账号、云开发、云函数、外部服务、审核材料到监控的工作拆解。
5. [发布检查清单](release-checklist.md)：发布前可逐项勾选的工程、隐私、医疗安全、测试、后台和 GitHub 检查。
6. [P0 发布证据记录（2026-07-24）](p0-release-evidence-2026-07-24.md)：1.0.12 发布证据、1.0.13 管理后台部署跟进和剩余阻塞项。
7. [P0 人工验收执行单](p0-manual-acceptance-runbook.md)：保留隐私、双账号、iOS/Android 真机、真实提醒的验收步骤与当前判定。
8. [微信云开发数据库设计](wechat-cloud-database.md)：集合、权限、云函数、管理员配置、发布前配置和外部服务接入。
9. [Web 管理后台](web-admin.md)：本地打开、后台能力、后端接口和部署建议。

## 核心文档

| 文档 | 用途 | 适合什么时候看 |
|---|---|---|
| [开发结果总结](development-summary.md) | 说明当前已经完成什么、还有什么真实环境配置未完成 | 接手项目、汇报当前进度、确认功能边界 |
| [上线准备工作清单](launch-prep-workplan.md) | 细化上线前所有准备任务与阻塞项 | 准备小程序审核、云开发部署、生产环境配置 |
| [发布检查清单](release-checklist.md) | 发布前最终核对项 | 每次发布前逐项检查 |
| [P0 发布证据记录（2026-07-24）](p0-release-evidence-2026-07-24.md) | 保存生产部署证据、1.0.13 跟进、阻塞项与安全交接步骤 | 判断当前审核候选是否具备继续发布条件 |
| [P0 人工验收执行单](p0-manual-acceptance-runbook.md) | 统一现场账号、设备、步骤、截图命名和 PASS/FAIL/BLOCKED 结论 | 组织发布前人工验收 |
| [微信云开发数据库设计](wechat-cloud-database.md) | 数据库集合、云函数、权限和外部服务说明 | 配置云开发、排查接口、扩展数据模型 |
| [Web 管理后台](web-admin.md) | 管理后台运行、功能和接口说明 | 本地调试后台、部署后台、确认管理视角 |
| [初始化状态操作逻辑与测试矩阵](initial-state-operation-logic.md) | 新用户、空数据、初始化状态下的操作门禁与测试矩阵 | 修空状态、做冒烟测试、检查首次使用体验 |
| [三角色评估与缺口计划](role-review-and-gap-plan.md) | 从产品经理、项目经理、测试经理视角评估完整性与缺口 | 评审项目质量、排优先级、制定补齐计划 |
| [商业版开发设计 v1](commercial-development-design-v1.md) | 商业化、会员、优惠券、AI 用量、支付和后台设计 | 扩展商业版、核对会员和订单相关设计 |

## 设计与原型归档

设计归档集中在 [design-archive/](design-archive/)；它不是上线操作文档，而是用于追溯产品逻辑、页面范围、状态机和前后台一致性。

| 文档 | 用途 |
|---|---|
| [design-archive/README.md](design-archive/README.md) | 原型资料来源、已纳入与未纳入说明 |
| [前台-后台-服务端一致性设计规范](design-archive/family-health-product-logic-spec.md) | 核心对象、关键交互链、前后台与服务端映射 |
| [前台-后台-服务端字段矩阵](design-archive/family-health-field-matrix.md) | 前台展示、服务端字段、后台展示之间的字段对照 |
| [完整中保真页面清单](design-archive/family-health-page-inventory.md) | 前台、后台、状态与服务端对象的完整清单 |
| [核心状态机](design-archive/family-health-state-machines.md) | 病程、附件、复诊摘要状态流转 |
| [低保真原型评审说明](design-archive/family-health-lowfi-wireframes.md) | 早期 9 个关键页面的低保真评审 |
| [核心 4 屏中保真说明](design-archive/family-health-midfi-4screens.md) | 首页、快速记录、病程详情、药箱等核心屏设计取向 |

同目录下的 `.html`、`.png`、`.svg` 是对应原型或视觉材料，优先与同名 `.md` 说明一起使用。

## 维护规则

- 项目当前状态、已实现能力、验证结果：更新 [development-summary.md](development-summary.md)。
- 上线前任务、阻塞项、生产配置：更新 [launch-prep-workplan.md](launch-prep-workplan.md)。
- 每次发布前最终核对：更新 [release-checklist.md](release-checklist.md)。
- 数据库集合、云函数、权限、外部服务：更新 [wechat-cloud-database.md](wechat-cloud-database.md)。
- Web 管理后台接口或部署变化：更新 [web-admin.md](web-admin.md)。
- 新用户空状态、操作门禁、测试矩阵：更新 [initial-state-operation-logic.md](initial-state-operation-logic.md)。
- 原型、字段矩阵、页面清单、状态机：放入 [design-archive/](design-archive/) 并同步更新 [design-archive/README.md](design-archive/README.md)。

## 当前文档状态

- 主线文档覆盖：项目说明、开发总结、上线准备、发布检查、云数据库、Web 后台、初始化状态、商业化设计、角色评估。
- 设计归档覆盖：低保真、中保真、页面清单、字段矩阵、状态机、前后台服务端一致性规范及对应图片/HTML/SVG 资产。
- 后续新增文档建议先放在 `docs/` 根目录；如果是历史设计、原型或评审材料，再放入 `docs/design-archive/`。
