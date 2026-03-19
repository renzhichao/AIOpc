# 事故复盘报告模板

**模板版本**: 1.0
**创建日期**: 2026-03-18
**维护者**: DevOps 团队

---

## 使用说明

本模板用于事故复盘报告的编写。请在事故解决后 48 小时内完成复盘报告。

**必须复盘的事故**:
- 所有 P0 事故
- MTTR > 2 小时的 P1 事故
- 导致数据丢失的事故

**可选复盘的事故**:
- MTTR < 2 小时的 P1 事故
- 重要的 P2 事故
- 有学习价值的事故

---

# Incident Postmortem: {事故标题}

**Date**: {YYYY-MM-DD}
**Severity**: P{0/1/2}
**Incident ID**: #{issue_number}
**Incident Commander**: {name}
**Duration**: {start_time} - {end_time} ({duration})
**MTTR**: {Mean Time To Resolution}
**Postmortem Author**: {name}
**Reviewers**: {names}

---

## 执行摘要 (Executive Summary)

**一句话描述**:
{用一句话描述这个事故}

**详细概要** (2-3 句话):
{用 2-3 句话描述事故的核心情况，包括影响、持续时间和解决状态}

**关键指标**:
- 持续时间: {duration}
- MTTR: {mttr}
- 影响用户: {count/%}
- 业务影响: {description}

---

## 影响分析 (Impact Analysis)

### 用户影响

- **受影响用户数量**: {count} ({percentage}%)
- **受影响用户群体**: {description}
- **受影响地理区域**: {regions}
- **用户投诉数量**: {count}

### 功能影响

- **受影响功能**: {feature_list}
- **功能可用性**: {availability_during_incident}%
- **错误率**: {error_rate}%

### 业务影响

- **收入影响**: {description}
- **用户信任影响**: {description}
- **合规影响**: {description}

### 数据影响

- **数据丢失**: 是/否
- **数据损坏**: 是/否
- **数据恢复**: {recovery_description}

---

## 时间线 (Timeline)

### 事故前 (Pre-Incident)

| 时间 (UTC+8) | 事件 | 负责人 |
|-------------|------|--------|
| {YYYY-MM-DD HH:mm} | {event} | {name} |
| {YYYY-MM-DD HH:mm} | {event} | {name} |

### 事故期间 (During Incident)

| 时间 (UTC+8) | 事件 | 负责人 |
|-------------|------|--------|
| {YYYY-MM-DD HH:mm} | **事故检测**: {detection_source} | {name} |
| {YYYY-MM-DD HH:mm} | **分诊完成**: 确定级别 P{level} | {name} |
| {YYYY-MM-DD HH:mm} | **响应开始**: {initial_actions} | {name} |
| {YYYY-MM-DD HH:mm} | {event} | {name} |
| {YYYY-MM-DD HH:mm} | {event} | {name} |
| {YYYY-MM-DD HH:mm} | **临时修复**: {mitigation_action} | {name} |
| {YYYY-MM-DD HH:mm} | **服务恢复**: {recovery_percentage}% | {name} |
| {YYYY-MM-DD HH:mm} | **完全恢复**: 100% | {name} |
| {YYYY-MM-DD HH:mm} | **监控确认**: 无复发 | {name} |

### 事故后 (Post-Incident)

| 时间 (UTC+8) | 事件 | 负责人 |
|-------------|------|--------|
| {YYYY-MM-DD HH:mm} | **复盘会议**: {attendees} | {name} |
| {YYYY-MM-DD HH:mm} | **复盘报告发布** | {name} |

---

## 根本原因分析 (Root Cause Analysis)

### 直接原因 (Direct Cause)

{直接导致事故的原因}

### 5 Whys 分析

**Why 1**: 为什么{事故现象}发生？
{回答}

**Why 2**: 为什么{Why 1 的答案}发生？
{回答}

**Why 3**: 为什么{Why 2 的答案}发生？
{回答}

**Why 4**: 为什么{Why 3 的答案}发生？
{回答}

**Why 5**: 为什么{Why 4 的答案}发生？
{回答}

**根本原因**: {5 Whys 的最终答案}

### 系统性原因 (Systemic Causes)

**技术原因**:
- {technical_cause_1}
- {technical_cause_2}
- {technical_cause_3}

**流程原因**:
- {process_cause_1}
- {process_cause_2}
- {process_cause_3}

**人为因素** (Human Factors - 注意无责文化):
- {human_factor_1}
- {human_factor_2}
- {human_factor_3}

**环境因素**:
- {environmental_factor_1}
- {environmental_factor_2}

### 贡献因素 (Contributing Factors)

- {contributing_factor_1}
- {contributing_factor_2}
- {contributing_factor_3}

### 预防措施缺口 (Gaps in Prevention)

**本应该阻止这个事故的措施**:
- {prevention_gap_1}
- {prevention_gap_2}
- {prevention_gap_3}

**为什么这些措施没有生效**:
- {reason_1}
- {reason_2}

---

## 解决方案 (Resolution)

### 临时修复 (Temporary Fix)

**实施时间**: {YYYY-MM-DD HH:mm}
**修复措施**:
```markdown
{description_of_temporary_fix}
```
**效果**: {effectiveness}
**副作用**: {side_effects}

### 永久修复 (Permanent Fix)

**实施时间**: {YYYY-MM-DD HH:mm}
**修复措施**:
```markdown
{description_of_permanent_fix}
```
**代码变更**: {pull_request_links}
**配置变更**: {config_changes}
**架构改进**: {architecture_improvements}

### 验证结果 (Verification)

**功能测试**:
- [ ] {test_case_1} - 通过/失败
- [ ] {test_case_2} - 通过/失败
- [ ] {test_case_3} - 通过/失败

**性能验证**:
- P95 延迟: {before} → {after}
- 错误率: {before}% → {after}%
- 吞吐量: {before} → {after}

**监控确认**:
- 监控时长: {duration}
- 是否复发: 是/否

---

## 响应效果评估 (Response Effectiveness)

### 响应时间分析

| 指标 | 目标 | 实际 | 达标 | 备注 |
|------|------|------|------|------|
| 检测时间 (MTTD) | < 5 min | {actual} | ✅/❌ | {notes} |
| 响应时间 | < 15 min | {actual} | ✅/❌ | {notes} |
| 初步诊断 | < 30 min | {actual} | ✅/❌ | {notes} |
| 临时修复 | < 1 hour | {actual} | ✅/❌ | {notes} |
| 永久修复 | < 4 hours | {actual} | ✅/❌ | {notes} |

### 沟通效果

**内部沟通**:
- 更新频率: {actual_frequency} vs 目标 {target_frequency}
- 沟通质量: ✅ 良好 / ⚠️ 需改进 / ❌ 不足
- 沟通问题: {issues}

**外部沟通** (如适用):
- 状态页面更新: ✅ 是 / ❌ 否
- 用户通知: ✅ 是 / ❌ 否
- 通知及时性: {assessment}

### 决策效果

**关键决策**:
1. {decision_1} - ✅ 正确 / ⚠️ 有争议 / ❌ 错误
2. {decision_2} - ✅ 正确 / ⚠️ 有争议 / ❌ 错误
3. {decision_3} - ✅ 正确 / ⚠️ 有争议 / ❌ 错误

**升级决策**:
- 是否升级: 是/否
- 升级时机: {timing}
- 升级效果: {effectiveness}

### 团队协作

**协作亮点**:
- {highlight_1}
- {highlight_2}

**协作问题**:
- {issue_1}
- {issue_2}

---

## 改进行动项 (Action Items)

### 紧急行动项 (Critical Actions)

> 必须在 7 天内完成

- [ ] **{action_title}**
  - **描述**: {description}
  - **负责人**: @name
  - **截止日期**: {YYYY-MM-DD}
  - **优先级**: P0
  - **状态**: 🔄 进行中 / ⏳ 待开始 / ✅ 已完成
  - **关联 Issue**: #{issue_number}

### 短期行动项 (Short-term Actions)

> 必须在 30 天内完成

- [ ] **{action_title}**
  - **描述**: {description}
  - **负责人**: @name
  - **截止日期**: {YYYY-MM-DD}
  - **优先级**: P1
  - **状态**: 🔄 进行中 / ⏳ 待开始 / ✅ 已完成
  - **关联 Issue**: #{issue_number}

### 长期行动项 (Long-term Actions)

> 必须在 90 天内完成

- [ ] **{action_title}**
  - **描述**: {description}
  - **负责人**: @name
  - **截止日期**: {YYYY-MM-DD}
  - **优先级**: P2
  - **状态**: 🔄 进行中 / ⏳ 待开始 / ✅ 已完成
  - **关联 Issue**: #{issue_number}

### 流程改进项 (Process Improvements)

- [ ] **{action_title}**
  - **描述**: {description}
  - **负责人**: @name
  - **截止日期**: {YYYY-MM-DD}
  - **优先级**: P1/P2
  - **状态**: 🔄 进行中 / ⏳ 待开始 / ✅ 已完成
  - **关联 Issue**: #{issue_number}

### 文档更新项 (Documentation Updates)

- [ ] **{action_title}**
  - **描述**: {description}
  - **负责人**: @name
  - **截止日期**: {YYYY-MM-DD}
  - **优先级**: P2
  - **状态**: 🔄 进行中 / ⏳ 待开始 / ✅ 已完成
  - **关联 Issue**: #{issue_number}

---

## 学习和反思 (Learnings and Reflections)

### 技术学习 (Technical Learnings)

**我们学到了什么**:
1. {learning_1}
2. {learning_2}
3. {learning_3}

**哪些做得好**:
- {what_went_well_1}
- {what_went_well_2}
- {what_went_well_3}

**哪些可以改进**:
- {what_could_be_improved_1}
- {what_could_be_improved_2}
- {what_could_be_improved_3}

### 流程学习 (Process Learnings)

**事故响应流程**:
- {process_learning_1}
- {process_learning_2}

**监控和告警**:
- {monitoring_learning_1}
- {monitoring_learning_2}

**沟通机制**:
- {communication_learning_1}
- {communication_learning_2}

### 文化反思 (Cultural Reflections)

**无责文化实践**:
- {blameless_culture_practice_1}
- {blameless_culture_practice_2}

**团队协作**:
- {team_collaboration_1}
- {team_collaboration_2}

**知识分享**:
- {knowledge_sharing_1}
- {knowledge_sharing_2}

---

## 预防措施 (Prevention Measures)

### 技术预防 (Technical Prevention)

**监控改进**:
- [ ] {monitoring_improvement_1}
- [ ] {monitoring_improvement_2}

**架构改进**:
- [ ] {architecture_improvement_1}
- [ ] {architecture_improvement_2}

**代码质量**:
- [ ] {code_quality_improvement_1}
- [ ] {code_quality_improvement_2}

**测试覆盖**:
- [ ] {test_coverage_improvement_1}
- [ ] {test_coverage_improvement_2}

### 流程预防 (Process Prevention)

**变更管理**:
- [ ] {change_management_improvement_1}
- [ ] {change_management_improvement_2}

**值班流程**:
- [ ] {on_call_improvement_1}
- [ ] {on_call_improvement_2}

**培训计划**:
- [ ] {training_improvement_1}
- [ ] {training_improvement_2}

### 组织预防 (Organizational Prevention)

**知识管理**:
- [ ] {knowledge_management_improvement_1}
- [ ] {knowledge_management_improvement_2}

**工具改进**:
- [ ] {tool_improvement_1}
- [ ] {tool_improvement_2}

---

## 附录 (Appendix)

### 附录 A: 日志和指标

**日志链接**:
- Backend 日志: {link}
- Agent 日志: {link}
- 数据库日志: {link}
- Nginx 日志: {link}

**指标链接**:
- Grafana Dashboard: {link}
- Prometheus 查询: {query}

### 附录 B: 截图和证据

**关键截图**:
1. {screenshot_description_1}: {link}
2. {screenshot_description_2}: {link}
3. {screenshot_description_3}: {link}

### 附录 C: 相关文档

**相关 Runbooks**:
- {runbook_link_1}
- {runbook_link_2}

**相关文档**:
- {document_link_1}
- {document_link_2}

### 附录 D: 复盘会议记录

**会议时间**: {YYYY-MM-DD HH:mm}
**参会人员**: {attendees}
**会议纪要**:
```
{meeting_minutes}
```

**关键讨论点**:
1. {discussion_point_1}
2. {discussion_point_2}
3. {discussion_point_3}

**决策记录**:
1. {decision_1}
2. {decision_2}

---

## 评审和批准 (Review and Approval)

**草稿完成日期**: {YYYY-MM-DD}
**草稿作者**: {name}

**评审记录**:

| 评审人 | 角色 | 评审日期 | 状态 | 意见 |
|--------|------|---------|------|------|
| {name} | Tech Lead | {YYYY-MM-DD} | ✅ 批准 / ⚠️ 需修改 | {comments} |
| {name} | CTO | {YYYY-MM-DD} | ✅ 批准 / ⚠️ 需修改 | {comments} |

**最终批准日期**: {YYYY-MM-DD}
**发布日期**: {YYYY-MM-DD}

---

## 参考文献和资源 (References and Resources)

**内部文档**:
- [Incident Response Guide](./INCIDENT_RESPONSE.md)
- [On-Call Handbook](./ONCALL.md)
- [SLIs and SLOs](./SLIS_SLOS.md)

**外部参考**:
- Google SRE Book - Incident Management
- PagerDuty Incident Response Documentation
- Atlassian Incident Management Playbook

**相关事故**:
- [Past Incident #{number}]({link})
- [Past Incident #{number}]({link})

---

**模板维护**: 每季度评审一次
**问题反馈**: 在 GitHub 创建 Issue
**最后更新**: 2026-03-18

---

## 使用示例

### 示例 1: P0 事故复盘

**事故标题**: Platform 服务完全不可用 - OAuth 配置错误

**执行摘要**:
由于错误的应用配置，所有用户无法登录 Platform 服务。事故持续 45 分钟，影响 100% 用户。根因是部署时使用了包含占位符的配置文件。已恢复服务并更新配置管理流程。

**影响分析**:
- 受影响用户: 100% (约 {count} 用户)
- 持续时间: 45 分钟
- 功能影响: OAuth 登录完全不可用
- 业务影响: 用户无法访问任何功能

**根本原因**:
1. Why: OAuth 登录失败
   → 因为 FEISHU_APP_ID 和 FEISHU_APP_SECRET 包含占位符值
2. Why: 配置包含占位符
   → 因为部署脚本读取了错误的配置文件
3. Why: 读取错误配置文件
   → 因为配置文件路径硬编码，未验证配置有效性
4. Why: 配置文件路径硬编码
   → 因为没有配置验证机制
5. Why: 没有配置验证机制
   → 因为这是流程缺失

**根本原因**: 缺少部署前的配置验证机制

**解决方案**:
- 临时修复: 手动更新容器环境变量
- 永久修复: 实施配置验证脚本，在部署前检查所有必需变量

**改进行动项**:
1. [ ] 添加配置验证脚本 (P0, @devops, 7 天)
2. [ ] 更新部署文档 (P1, @devops, 30 天)
3. [ ] 添加配置监控告警 (P1, @sre, 30 天)

### 示例 2: P1 事故复盘

**事故标题**: 数据库连接池耗尽 - 性能严重下降

**执行摘要**:
由于数据库连接池配置不当，在高负载情况下连接池耗尽，导致 API 响应时间从 200ms 升至 5s，错误率升至 15%。事故持续 2 小时，影响 60% 用户。根因是连接池大小不足以应对峰值负载。

**影响分析**:
- 受影响用户: 60% (高峰时段)
- 持续时间: 2 小时
- 功能影响: API 性能严重下降
- 业务影响: 用户投诉，体验下降

**根本原因**:
1. Why: 数据库连接池耗尽
   → 因为连接池大小只有 10，不足以应对峰值
2. Why: 连接池大小只有 10
   → 因为使用默认配置，未根据负载调优
3. Why: 未根据负载调优
   → 因为没有性能基准测试
4. Why: 没有性能基准测试
   → 因为缺少性能测试流程
5. Why: 缺少性能测试流程
   → 因为这是流程缺失

**根本原因**: 缺少性能测试和容量规划流程

**解决方案**:
- 临时修复: 增加连接池大小到 50
- 永久修复: 实施性能测试流程，建立容量规划机制

**改进行动项**:
1. [ ] 建立性能测试流程 (P1, @qa, 30 天)
2. [ ] 实施容量规划机制 (P1, @sre, 30 天)
3. [ ] 添加连接池监控 (P2, @sre, 90 天)

---

## 检查清单

在提交复盘报告前，请确认:

### 内容完整性

- [ ] 执行摘要完整 (2-3 句话)
- [ ] 影响分析详细
- [ ] 时间线完整 (精确到分钟)
- [ ] 根因分析完成 (5 Whys)
- [ ] 解决方案清晰
- [ ] 行动项具体且可追踪
- [ ] 学习和反思有价值

### 质量标准

- [ ] 语言简洁专业
- [ ] 无责文化 (关注系统，不关注个人)
- [ ] 行动项有明确负责人和截止日期
- [ ] 预防措施具体可执行
- [ ] 附录和证据充分

### 评审完成

- [ ] 自我评审完成
- [ ] Tech Lead 评审完成
- [ ] 所有评审意见已处理
- [ ] 准备发布

### 发布准备

- [ ] GitHub Issue 已更新
- [ ] 团队已通知
- [ ] 学习已分享
- [ ] 行动项已创建
