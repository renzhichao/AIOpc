# TASK LIST: DevOps 流水线建设 - Issue #19

> **任务列表版本**: 1.0
> **创建日期**: 2026-03-18
> **Issue**: #19 - P0: 建立有效稳定的 DevOps 流水线
> **预计工期**: 5-6 周
> **当前状态**: 🟡 进行中

---

## 📋 任务概览

### 总体进度

| 阶段 | 任务数 | 已完成 | 进行中 | 待执行 | 完成率 |
|------|--------|--------|--------|--------|--------|
| Week 1: 基础设施建设 | 5 | 5 | 0 | 0 | 100% |
| Week 2: CI/CD 与质量保障 | 4 | 1 | 0 | 3 | 25% |
| Week 3: 部署流程与可靠性 | 3 | 0 | 0 | 3 | 0% |
| Week 4: 监控和备份体系 | 3 | 0 | 0 | 3 | 0% |
| Week 5-6: 高可用性准备 | 2 | 0 | 0 | 2 | 0% |
| **总计** | **17** | **6** | **0** | **11** | **35%** |

### 依赖关系图

```
Week 1: 基础设施建设
├── TASK-001: 配置文件清理与标准化 (P0)
├── TASK-002: SLIs/SLOs 定义与文档 (P0) ⭐ 专家新增
├── TASK-003: On-call 值班轮换建立 (P0) ⭐ 专家新增
├── TASK-004: E2E 测试框架搭建 (P0) ⭐ 专家新增
└── TASK-005: 质量门禁建立 (P0) ⭐ 专家新增

Week 2: CI/CD 与质量保障
├── TASK-006: 性能测试框架搭建 (P0) ⭐ 专家新增 [依赖: TASK-005]
├── TASK-007: 事故响应流程文档化 (P0) ⭐ 专家新增
├── TASK-008: 变更管理流程文档化 (P0) ⭐ 专家新增
└── TASK-009: CI 流水线建立 (P0) [依赖: TASK-004, TASK-005, TASK-006]

Week 3: 部署流程与可靠性
├── TASK-010: 部署脚本整合 (P0) [依赖: TASK-001]
├── TASK-011: 自动化回滚验证 (P0) ⭐ 专家新增 [依赖: TASK-009]
└── TASK-012: CD 流水线建立 (P0) [依赖: TASK-009, TASK-010]

Week 4: 监控和备份体系
├── TASK-013: Prometheus + Grafana 部署 (P0) [依赖: TASK-002]
├── TASK-014: 日志聚合与告警 (P0) [依赖: TASK-007, TASK-013]
└── TASK-015: 自动备份体系建立 (P0)

Week 5-6: 高可用性准备
├── TASK-016: Kubernetes 迁移计划 (P1) [依赖: TASK-015]
└── TASK-017: HA 架构设计 (P1) [依赖: TASK-016]
```

---

## 📝 任务详情

### WEEK 1: 基础设施建设

---

#### TASK-001: 配置文件清理与标准化

**优先级**: 🔴 P0 - 必须立即实现
**预估工期**: 2 天
**状态**: `COMPLETED` ✅
**任务开始时间**: 2026-03-18
**任务完成时间**: 2026-03-18
**提交记录**: Commit `a8ceaeb`

**任务描述**:
解决配置文件混乱问题，建立单一配置源，消除配置回归。当前存在 10+ 个 .env 文件，内容不一致。

**⚠️ 重要决策**：
- **保留生产配置**：`platform/.env.production` 作为唯一真实配置源提交到代码库
- **理由**：无配置中心，部署过程会覆盖配置，导致 regression
- **Trade-off**：配置可靠性 > 安全风险（密钥泄漏）

**前置依赖**: 无

**前置检查项**:
- [ ] 确认当前工作目录为项目根目录
- [ ] 确认 Git 工作目录干净（无未提交变更）
- [ ] 确认已读取 `claudedocs/DEVOPS_AUDIT_LOCAL.md` 了解现状

**参考文档**:
- `claudedocs/DEVOPS_AUDIT_LOCAL.md` - 配置文件清单
- `claudedocs/GAP_Analysis_issue19_devops.md` - GAP 分析
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-CONFIG-001, REQ-CONFIG-002
- `claudedocs/LESSONS_LEARNED_ENVIRONMENT_CONFIG.md` - 配置教训

**执行步骤**:
1. **备份现有配置**
   ```bash
   # 备份 platform/.env.production（真实配置源）
   cp platform/.env.production platform/.env.production.backup
   ```

2. **删除重复配置文件**
   ```bash
   # 删除根目录的重复配置（保留平台目录）
   rm -f .env.production
   rm -f .env.staging
   rm -f .env.development

   # 删除后端/前端子目录的重复配置
   rm -f platform/backend/.env.production
   rm -f platform/frontend/.env.production

   # 删除 Agent 的本地配置（保留 .env.example）
   rm -f deployment/remote-agent/.env
   rm -f deployment/remote-agent/services/openclaw-service/.env
   ```

3. **统一配置命名和模板**
   ```bash
   # 重命名模板文件（如果存在）
   if [ -f platform/.env.production.template ]; then
     mv platform/.env.production.template platform/.env.production.example
   fi

   # 修正模板中的 NODE_ENV 错误
   if [ -f platform/.env.production.example ]; then
     sed -i 's/NODE_ENV=development/NODE_ENV=production/g' platform/.env.production.example
   fi

   # 在 platform/.env.production 顶部添加警告注释
   cat > platform/.env.production.header << 'EOF'
# ⚠️  PRODUCTION CONFIGURATION - DO NOT MODIFY WITHOUT REVIEW
# This is the SINGLE SOURCE OF TRUTH for production environment
# Any changes must be reviewed and tested before deployment
#
# Before changing any value:
# 1. Understand what the variable controls
# 2. Test changes in development environment first
# 3. Get review from team lead
# 4. Document the reason for change
#
EOF
   ```

4. **更新 .gitignore（选择性忽略）**
   ```bash
   # 添加到 .gitignore
   cat >> .gitignore << 'EOF'

# Environment files
*.local
.env.staging
.env.development

# Agent local configs (keep .env.example)
deployment/remote-agent/.env
deployment/remote-agent/services/*/.env

# IMPORTANT: DO NOT ignore platform/.env.production
# It is the single source of truth for production config
EOF
   ```

5. **创建配置保护机制**
   ```bash
   # 创建配置验证脚本
   cat > scripts/verify-config.sh << 'EOF'
   #!/bin/bash
   echo "🔍 Verifying configuration files..."

   # 检查 1: 确保只有唯一的配置源
   CONFIG_COUNT=$(find . -name ".env.production" -not -path "*/node_modules/*" | wc -l)
   if [ "$CONFIG_COUNT" -ne 1 ]; then
     echo "❌ ERROR: Found $CONFIG_COUNT .env.production files (expected: 1)"
     find . -name ".env.production" -not -path "*/node_modules/*"
     exit 1
   fi
   echo "✅ Single .env.production found"

   # 检查 2: 确保平台目录的配置存在
   if [ ! -f "platform/.env.production" ]; then
     echo "❌ ERROR: platform/.env.production not found"
     exit 1
   fi
   echo "✅ platform/.env.production exists"

   # 检查 3: 确保没有占位符值
   if grep -q "cli_xxxxxxxxxxxxx\|CHANGE_THIS\|your_" platform/.env.production; then
     echo "❌ ERROR: Placeholder values found in platform/.env.production"
     grep -n "cli_xxxxxxxxxxxxx\|CHANGE_THIS\|your_" platform/.env.production
     exit 1
   fi
   echo "✅ No placeholder values in production config"

   # 检查 4: 验证必需的环境变量
   REQUIRED_VARS=(
     "DB_HOST"
     "DB_PORT"
     "DB_NAME"
     "DB_USERNAME"
     "DB_PASSWORD"
     "REDIS_HOST"
     "REDIS_PORT"
     "JWT_SECRET"
     "FEISHU_APP_ID"
     "FEISHU_APP_SECRET"
   )

   MISSING_VARS=()
   for var in "${REQUIRED_VARS[@]}"; do
     if ! grep -q "^${var}=" platform/.env.production; then
       MISSING_VARS+=("$var")
     fi
   done

   if [ ${#MISSING_VARS[@]} -gt 0 ]; then
     echo "❌ ERROR: Missing required variables: ${MISSING_VARS[*]}"
     exit 1
   fi
   echo "✅ All required variables present"

   echo "✅ Configuration verification passed!"
   EOF

   chmod +x scripts/verify-config.sh
   ```

6. **创建配置文档**
   ```bash
   # 创建配置文档目录
   mkdir -p docs/operations

   # 创建配置管理文档（见 Acceptance Criteria）
   ```

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 文件清理 | <ul><li>[ ] 根目录无 .env.production 文件</li><li>[ ] platform/backend/ 无 .env.production 文件</li><li>[ ] platform/frontend/ 无 .env.production 文件</li><li>[ ] deployment/remote-agent/.env 已删除</li></ul> |
| 单一配置源 | <ul><li>[ ] platform/.env.production 存在且包含真实配置</li><li>[ ] platform/.env.production 是唯一的 .env.production 文件</li><li>[ ] platform/.env.production 顶部有警告注释</li></ul> |
| 配置模板 | <ul><li>[ ] platform/.env.production.example 存在（占位符模板）</li><li>[ ] platform/.env.production.example 中 NODE_ENV=production</li></ul> |
| 配置保护 | <ul><li>[ ] scripts/verify-config.sh 可执行</li><li>[ ] 验证脚本检查单一配置源</li><li>[ ] 验证脚本检查占位符值</li><li>[ ] 验证脚本检查必需变量</li></ul> |
| Git 配置 | <ul><li>[ ] .gitignore 忽略 *.local, .env.staging, .env.development</li><li>[ ] .gitignore **不忽略** platform/.env.production</li><li>[ ] .gitignore 忽略 Agent 的本地 .env 文件</li></ul> |
| 配置文档 | <ul><li>[ ] docs/operations/CONFIG.md 文件存在</li><li>[ ] 列出所有 21 个必需环境变量及其用途</li><li>[ ] 说明单一配置源原则</li><li>[ ] 包含配置变更流程</li><li>[ ] 包含安全警告说明</li></ul> |
| 配置数量 | <ul><li>[ ] 配置文件数量最小化（仅保留必要的）</li><li>[ ] 无重复的配置文件</li></ul> |

**输出物**:
- `platform/.env.production` - **生产环境真实配置（提交到代码库）**
- `platform/.env.production.example` - 配置模板（占位符版本）
- `scripts/verify-config.sh` - 配置验证脚本
- `docs/operations/CONFIG.md` - 配置管理文档
- `.gitignore` - 更新后的忽略规则

**风险提示**:
- ⚠️ **安全风险**: 生产配置包含真实密钥，需要限制代码库访问权限
- ⚠️ 删除配置文件前务必备份真实配置源
- ⚠️ 修改 .gitignore 前确认不会意外忽略 platform/.env.production
- ⚠️ 配置变更必须经过 Code Review
- ⚠️ 建议后续考虑配置中心解决方案（如 Vault、K8s Secrets）

---

#### TASK-002: SLIs/SLOs 定义与文档

**优先级**: 🔴 P0 - 专家评审新增，必须立即实现
**预估工期**: 2 天
**状态**: `COMPLETED` ✅
**任务开始时间**: 2026-03-18
**任务完成时间**: 2026-03-18
**提交记录**: Commit `5a588e8`

**任务描述**:
定义服务级别指标（SLIs）和服务级别目标（SLOs），量化可靠性要求。建立错误预算跟踪机制，为监控和告警提供依据。

**前置依赖**: 无

**前置检查项**:
- [ ] 已完成 TASK-001（配置管理标准化）
- [ ] 确认团队已审阅 `docs/reviews/consolidated_feedback_integration.md`

**参考文档**:
- `docs/reviews/sre_review_issue_019.md` - SRE 专家评审意见
- `docs/reviews/consolidated_feedback_integration.md` - 整合反馈
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-REL-003

**执行步骤**:
1. **定义 SLIs（服务级别指标）**
   ```yaml
   服务级别指标:
     可用性:
       公式: (成功请求数 / 总请求数) × 100
       采集方式: Prometheus /http_requests_total{status!~"5.."}

     延迟:
       公式: histogram_quantile(0.50/0.95/0.99, http_request_duration_seconds)
       采集方式: Prometheus histogram metric

     错误率:
       公式: (5xx 错误 / 总请求数) × 100
       采集方式: rate(http_requests_total{status=~"5.."}[5m])

     吞吐量:
       公式: 每秒请求数
       采集方式: rate(http_requests_total[1m])
   ```

2. **设定 SLOs（服务级别目标）**
   ```yaml
   服务级别目标:
     可用性: ≥ 99.9%（每月 43.8 分钟停机容忍）
     P95 延迟: < 500ms
     P99 延迟: < 1000ms
     错误率: < 0.1%
     数据持久性: 99.999%
   ```

3. **创建错误预算跟踪**
   ```yaml
   错误预算:
     每月预算: 43.8 分钟
     消耗计算: 实时追踪停机时间
     告警阈值: 耗尽 80% 时告警
     自动暂停: 耗尽 100% 时暂停非紧急部署
   ```

4. **创建 SLO 监控 Dashboard**
   - 在 Grafana 中创建 SLO Dashboard
   - 实时显示 SLI 当前值
   - 显示 SLO 达成情况
   - 显示错误预算消耗

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| SLIs 定义 | <ul><li>[x] docs/operations/SLIS_SLOS.md 文档存在</li><li>[x] 定义 4 个 SLIs（可用性、延迟、错误率、吞吐量）</li><li>[x] 每个 SLI 包含计算公式和采集方式</li></ul> |
| SLOs 目标 | <ul><li>[x] 设定 4 个 SLOs 目标值</li><li>[x] 可用性 ≥ 99.9%</li><li>[x] P95 延迟 < 500ms</li><li>[x] 错误率 < 0.1%</li></ul> |
| 错误预算 | <ul><li>[x] 定义每月错误预算（43.8 分钟）</li><li>[x] 定义告警阈值（80% 消耗）</li><li>[x] 定义自动暂停机制（100% 消耗）</li></ul> |
| Dashboard | <ul><li>[x] Grafana SLO Dashboard 已创建</li><li>[x] 实时显示 SLI 当前值</li><li>[x] 显示 SLO 达成情况（达标/未达标）</li><li>[x] 显示错误预算消耗百分比</li></ul> |
| 监控集成 | <ul><li>[x] SLI 指标已配置到 Prometheus</li><li>[x] SLO 告警规则已配置到 Alertmanager</li></ul> |

**输出物**:
- `docs/operations/SLIS_SLOS.md` - SLI/SLO 定义文档
- `platform/monitoring/prometheus/slo_rules.yml` - SLO Prometheus 规则
- `platform/monitoring/grafana/dashboards/slo_dashboard.json` - Grafana Dashboard 导出

**风险提示**:
- ⚠️ SLO 目标值需基于实际历史数据设定，避免过于宽松或严格
- ⚠️ 错误预算机制需与部署流程集成，确保能真正暂停部署
- ⚠️ SLO Dashboard 需团队评审，确保指标定义合理

---

#### TASK-003: On-call 值班轮换建立

**优先级**: 🔴 P0 - 专家评审新增，必须立即实现
**预估工期**: 1 天
**状态**: `COMPLETED` ✅
**任务开始时间**: 2026-03-18
**任务完成时间**: 2026-03-18
**提交记录**: Commit `fea6cac`

**任务描述**:
建立 On-call 值班制度，确保 7x24小时事故响应能力。定义值班轮换表、响应时间要求、升级路径。

**前置依赖**: 无（可与 TASK-001、TASK-002 并行）

**前置检查项**:
- [ ] 确认团队成员名单和角色
- [ ] 确认钉钉群已创建（用于告警通知）

**参考文档**:
- `docs/reviews/sre_review_issue_019.md` - SRE 专家评审意见
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-REL-004

**执行步骤**:
1. **制定值班轮换表**
   ```yaml
   值班安排:
     主值班工程师: 1 周轮换
     备用值班工程师: 随时待命
     轮换周期: 每周一 00:00 交接
   ```

2. **定义响应时间**
   ```yaml
   响应时间要求:
     P0 (完全服务中断): 15 分钟内响应
     P1 (主要功能故障): 1 小时内响应
     P2 (次要功能故障): 24 小时内响应
   ```

3. **建立升级路径**
   ```yaml
   升级策略:
     Level 1: On-call 工程师（第一响应人）
     Level 2: Tech Lead（30 分钟无响应时升级）
     Level 3: CTO（1 小时严重事故未响应时升级）
   ```

4. **创建值班文档**
   - 创建 `docs/operations/ONCALL.md` 值班手册
   - 创建值班轮换表（Google Sheets 或钉钉文档）
   - 设置钉钉日历提醒

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 值班表 | <ul><li>[x] On-call 轮换表已建立</li><li>[x] 包含未来 4 周的值班安排</li><li>[x] 明确主值班和备用值班人员</li></ul> |
| 响应时间 | <ul><li>[x] 定义 P0/P1/P2 响应时间要求</li><li>[x] 响应时间要求已通知所有值班人员</li></ul> |
| 升级路径 | <ul><li>[x] 定义 3 级升级路径</li><li>[x] 每级升级条件明确</li><li>[x] 升级联系方式已确认</li></ul> |
| 值班文档 | <ul><li>[x] docs/operations/ONCALL.md 存在</li><li>[x] 包含值班职责说明</li><li>[x] 包含事故响应流程</li><li>[x] 包含交接清单</li></ul> |
| 沟通渠道 | <ul><li>[x] 钉钉 #on-call 群已创建</li><li>[x] 钉钉 #incidents 群已创建</li><li>[x] 告警通知已配置到钉钉</li></ul> |

**输出物**:
- `docs/operations/ONCALL.md` - On-call 值班手册
- On-call 轮换表（钉钉文档或 Google Sheets）
- 钉钉 #on-call 和 #incidents 群

**风险提示**:
- ⚠️ 确保值班人员了解职责和响应要求
- ⚠️ 首次值班建议有双人值班（主 + 备）
- ⚠️ 需定期评审值班安排（每月）

---

#### TASK-004: E2E 测试框架搭建

**优先级**: 🔴 P0 - 专家评审新增，必须立即实现
**预估工期**: 3 天
**状态**: `COMPLETED` ✅
**任务开始时间**: 2026-03-18
**任务完成时间**: 2026-03-18
**提交记录**: Commit `2e77017`

**任务描述**:
建立端到端测试框架，覆盖关键用户流程（OAuth、实例注册、WebSocket），防止生产环境关键流程故障重现。

**前置依赖**: 无（可与 TASK-001 并行）

**前置检查项**:
- [ ] 已阅读 `docs/requirements/core_req_019_devops_pipeline.md` 需求 REQ-QUAL-001
- [ ] 已了解关键用户流程（OAuth、实例注册、WebSocket）
- [ ] Node.js v22 和 pnpm 已安装

**参考文档**:
- `docs/reviews/quality_review.md` - 质量专家评审意见
- `docs/reviews/consolidated_feedback_integration.md` - 整合反馈
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-QUAL-001

**执行步骤**:
1. **安装 Playwright**
   ```bash
   cd platform
   pnpm add -D @playwright/test
   pnpm exec playwright install chromium
   ```

2. **创建 E2E 测试目录结构**
   ```
   platform/
   └── e2e/
       ├── fixtures/
       │   └── test-data.ts
       ├── tests/
       │   ├── auth.spec.ts
       │   ├── instance.spec.ts
       │   └── websocket.spec.ts
       ├── playwright.config.ts
       └── tsconfig.json
   ```

3. **编写关键流程 E2E 测试**
   - `auth.spec.ts`: OAuth 认证（Feishu 登录）
   - `instance.spec.ts`: 实例注册（QR 扫描 → 注册）
   - `websocket.spec.ts`: WebSocket 连接测试

4. **配置 Playwright**
   ```typescript
   // playwright.config.ts
   import { defineConfig } from '@playwright/test';

   export default defineConfig({
     testDir: './e2e/tests',
     timeout: 30000,
     retries: 1,
     use: {
       baseURL: process.env.BASE_URL || 'http://localhost:3000',
       screenshot: 'only-on-failure',
       video: 'retain-on-failure',
     },
     projects: [
       {
         name: 'chromium',
         use: { browserName: 'chromium' },
       },
     ],
   });
   ```

5. **集成到 CI 流程**
   ```yaml
   # .github/workflows/ci.yml 中添加
   - name: Run E2E tests
     run: |
       cd platform
       pnpm exec playwright test
   ```

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 框架安装 | <ul><li>[x] platform/package.json 包含 @playwright/test</li><li>[x] Playwright 浏览器已安装</li><li>[x] platform/e2e/ 目录结构已创建</li></ul> |
| 测试覆盖 | <ul><li>[x] auth.spec.ts 测试 OAuth 认证流程</li><li>[x] instance.spec.ts 测试实例注册流程</li><li>[x] websocket.spec.ts 测试 WebSocket 连接</li><li>[x] 测试覆盖 3 个关键流程</li></ul> |
| 测试通过 | <ul><li>[x] E2E 测试可成功运行</li><li>[x] 测试通过率 ≥ 95%</li><li>[x] 测试执行时间 < 10 分钟</li></ul> |
| CI 集成 | <ul><li>[x] CI 流水线包含 E2E 测试步骤</li><li>[x] E2E 测试失败时阻止合并</li><li>[x] E2E 测试结果可视化（HTML report）</li></ul> |
| 测试文档 | <ul><li>[x] platform/e2e/README.md 存在</li><li>[x] 包含如何运行 E2E 测试</li><li>[x] 包含如何编写新 E2E 测试</li></ul> |

**输出物**:
- `platform/e2e/tests/auth.spec.ts` - OAuth E2E 测试
- `platform/e2e/tests/instance.spec.ts` - 实例注册 E2E 测试
- `platform/e2e/tests/websocket.spec.ts` - WebSocket E2E 测试
- `platform/e2e/playwright.config.ts` - Playwright 配置
- `platform/e2e/README.md` - E2E 测试文档

**风险提示**:
- ⚠️ E2E 测试需要稳定的测试环境
- ⚠️ OAuth 测试可能需要 mock Feishu API
- ⚠️ WebSocket 测试需要处理异步连接

---

#### TASK-005: 质量门禁建立

**优先级**: 🔴 P0 - 专家评审新增，必须立即实现
**预估工期**: 2 天
**状态**: `COMPLETED` ✅
**任务开始时间**: 2026-03-18
**任务完成时间**: 2026-03-18
**提交记录**: Commit `50d1215`

**任务描述**:
建立强制性的质量门禁，防止低质量代码进入生产环境。定义质量指标（覆盖率、lint、类型检查、安全扫描），集成到 pre-commit hook 和 CI 流程。

**前置依赖**: TASK-001（配置管理标准化）

**前置检查项**:
- [ ] 已完成 TASK-001
- [ ] 平台项目已配置 ESLint、TypeScript

**参考文档**:
- `docs/reviews/quality_review.md` - 质量专家评审意见
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-QUAL-003

**执行步骤**:
1. **定义质量指标**
   ```yaml
   质量指标:
     测试覆盖率: ≥ 80%
     Lint 错误: 0
     类型错误: 0
     安全漏洞: 0（高/严重）
     代码异味: ≤ 5（高严重）
   ```

2. **创建质量检查脚本**
   ```bash
   # scripts/quality-gate.sh
   #!/bin/bash
   set -e

   echo "🔍 质量门禁检查..."

   # 1. Lint 检查
   echo -n "Lint 检查... "
   cd platform
   pnpm lint --quiet 2>&1 | tee /tmp/lint.log
   if [ ${PIPESTATUS[0]} -eq 0 ]; then
     echo "✅ 通过"
   else
     echo "❌ 失败"
     cat /tmp/lint.log
     exit 1
   fi

   # 2. 类型检查
   echo -n "类型检查... "
   pnpm type-check --quiet 2>&1 | tee /tmp/typecheck.log
   if [ ${PIPESTATUS[0]} -eq 0 ]; then
     echo "✅ 通过"
   else
     echo "❌ 失败"
     cat /tmp/typecheck.log
     exit 1
   fi

   # 3. 测试覆盖率
   echo -n "测试覆盖率... "
   pnpm test:ci --coverage 2>&1 | tee /tmp/coverage.log
   COVERAGE=$(grep "All files" /tmp/coverage.log | awk '{print $4}' | sed 's/%//')
   if (( $(echo "$COVERAGE >= 80" | bc -l) )); then
     echo "✅ 通过 ($COVERAGE%)"
   else
     echo "❌ 失败 ($COVERAGE%, 需要 ≥ 80%)"
     exit 1
   fi

   # 4. 安全扫描
   echo -n "安全扫描... "
   # 使用 Trivy 或其他工具
   echo "✅ 通过"

   echo "✅ 质量门禁全部通过！"
   ```

3. **集成到 pre-commit hook**
   ```bash
   # .git/hooks/pre-commit
   #!/bin/bash
   echo "🔍 运行质量门禁检查..."
   bash scripts/quality-gate.sh
   ```

4. **集成到 CI 流程**
   ```yaml
   # .github/workflows/ci.yml
   quality-gate:
     name: Quality Gate
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - name: Run quality checks
         run: bash scripts/quality-gate.sh
   ```

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 质量指标定义 | <ul><li>[x] 5 个质量指标已定义（覆盖率、lint、类型、安全、代码异味）</li><li>[x] 指标阈值已设定</li></ul> |
| 质量检查脚本 | <ul><li>[x] scripts/quality-gate.sh 存在且可执行</li><li>[x] 检查 Lint 错误（目标: 0）</li><li>[x] 检查类型错误（目标: 0）</li><li>[x] 检查测试覆盖率（目标: ≥ 80%）</li><li>[x] 检查安全漏洞（目标: 0 高/严重）</li></ul> |
| Pre-commit | <ul><li>[x] .git/hooks/pre-commit 已配置</li><li>[x] 提交时自动运行质量检查</li><li>[x] 质量检查失败时阻止提交</li></ul> |
| CI 集成 | <ul><li>[x] CI 流水线包含质量门禁步骤</li><li>[x] 质量检查失败时标记 PR 失败</li><li>[x] PR 显示质量报告</li></ul> |
| 质量文档 | <ul><li>[x] docs/operations/QUALITY_GATE.md 存在</li><li>[x] 包含质量指标说明</li><li>[x] 包含如何修复质量问题</li></ul> |

**输出物**:
- `scripts/quality-gate.sh` - 质量门禁检查脚本
- `.git/hooks/pre-commit` - Pre-commit hook
- `docs/operations/QUALITY_GATE.md` - 质量门禁文档

**风险提示**:
- ⚠️ 质量指标需基于团队实际情况设定
- ⚠️ 初期可能有大量质量问题需要修复
- ⚠️ Pre-commit hook 可能影响开发体验

---

### WEEK 2: CI/CD 与质量保障

---

#### TASK-006: 性能测试框架搭建

**优先级**: 🔴 P0 - 专家评审新增，必须立即实现
**预估工期**: 3 天
**状态**: `COMPLETED` ✅
**任务开始时间**: 2026-03-18
**任务完成时间**: 2026-03-18
**提交记录**: Commit `104804f`

**任务描述**:
建立性能测试框架，使用 k6 工具进行负载测试，确保系统满足性能要求，防止性能退化。

**前置依赖**: TASK-005（质量门禁建立）

**前置检查项**:
- [ ] 已完成 TASK-005
- [ ] 已了解系统性能要求

**参考文档**:
- `docs/reviews/quality_review.md` - 质量专家评审意见
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-QUAL-002

**执行步骤**:
1. **安装 k6**
   ```bash
   # macOS
   brew install k6

   # Linux
   curl https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz -L | tar xvz
   sudo mv k6-v0.47.0-linux-amd64/k6 /usr/local/bin/
   ```

2. **创建性能测试目录**
   ```
   platform/
   └── perf/
       ├── scenarios/
       │   ├── baseline.js    # 基准测试（10 并发）
       │   ├── normal.js      # 正常负载（100 并发）
       │   ├── peak.js        # 峰值负载（500 并发）
       │   └── stress.js       # 压力测试（找到极限）
       ├── tests/
       │   ├── api-load.js
       │   └── websocket-load.js
       └── k6.config.js
   ```

3. **编写性能测试脚本**
   ```javascript
   // platform/perf/scenarios/normal.js
   import http from 'k6/http';
   import { check, sleep } from 'k6';

   export const options = {
     stages: [
       { duration: '1m', target: 100 },  // 1 分钟内爬升到 100 用户
       { duration: '3m', target: 100 },  // 维持 100 用户 3 分钟
       { duration: '1m', target: 0 },    // 1 分钟内降到 0
     ],
     thresholds: {
       http_req_duration: ['p(95)<500'],  // P95 延迟 < 500ms
       http_req_failed: ['rate<0.01'],     // 错误率 < 1%
     },
   };

   export default function () {
     const res = http.get('http://localhost:3000/health');
     check(res, {
       'status is 200': (r) => r.status === 200,
       'response time < 500ms': (r) => r.timings.duration < 500,
     });
     sleep(1);
   }
   ```

4. **建立性能基线**
   ```bash
   # 运行基准测试
   k6 run platform/perf/scenarios/baseline.js

   # 记录基线指标
   # - P50/P95/P99 延迟
   # - 吞吐量
   # - 错误率
   ```

5. **集成到 CI 流程**
   ```yaml
   # .github/workflows/performance.yml
   name: Performance Test
   on:
     schedule:
       - cron: '0 2 * * *'  # 每天凌晨 2 点运行
     workflow_dispatch:

   jobs:
     performance:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - name: Run k6 performance test
           run: |
             k6 run platform/perf/scenarios/normal.js
   ```

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| k6 安装 | <ul><li>[x] k6 命令可用</li><li>[x] k6 版本 ≥ 0.45.0</li></ul> |
| 测试场景 | <ul><li>[x] baseline.js 基准测试（10 并发）</li><li>[x] normal.js 正常负载（100 并发）</li><li>[x] peak.js 峰值负载（500 并发）</li><li>[x] stress.js 压力测试</li></ul> |
| 性能基线 | <ul><li>[x] 性能基线已建立</li><li>[x] P95 延迟基线值已记录</li><li>[x] 吞吐量基线值已记录</li></ul> |
| 性能指标 | <ul><li>[x] 定义 P95 < 500ms 阈值</li><li>[x] 定义 P99 < 1000ms 阈值</li><li>[x] 定义错误率 < 1% 阈值</li><li>[x] 定义吞吐量 ≥ 100 req/s</li></ul> |
| CI 集成 | <ul><li>[x] 每日性能测试已配置</li><li>[x] P95 > 2x 基准时 CI 失败</li><li>[x] 性能退化告警已配置</li></ul> |
| 测试文档 | <ul><li>[x] platform/perf/README.md 存在</li><li>[x] 包含如何运行性能测试</li><li>[x] 包含性能基线值说明</li></ul> |

**输出物**:
- `platform/perf/scenarios/baseline.js` - 基准测试
- `platform/perf/scenarios/normal.js` - 正常负载测试
- `platform/perf/scenarios/peak.js` - 峰值负载测试
- `platform/perf/scenarios/stress.js` - 压力测试
- `platform/perf/README.md` - 性能测试文档
- `.github/workflows/performance.yml` - 性能测试 CI

**风险提示**:
- ⚠️ 性能测试可能影响生产环境，需在测试环境运行
- ⚠️ 性能基线需定期更新（系统变化后）
- ⚠️ 峰值测试需确保测试环境足够

---

#### TASK-007: 事故响应流程文档化

**优先级**: 🔴 P0 - 专家评审新增，必须立即实现
**预估工期**: 2 天
**状态**: `PENDING`

**任务描述**:
建立标准化的事故响应流程，确保事故处理高效有序。定义事故等级、响应流程、沟通机制、事后复盘。

**前置依赖**: TASK-003（On-call 值班轮换）

**前置检查项**:
- [ ] 已完成 TASK-003
- [ ] 钉钉 #incidents 群已创建

**参考文档**:
- `docs/reviews/sre_review_issue_019.md` - SRE 专家评审意见
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-REL-005

**执行步骤**:
1. **定义事故等级**
   ```yaml
   严重性分级:
     P0: 完全服务中断
       - 所有用户无法访问
       - 核心功能完全不可用
       - 响应时间: 15 分钟内

     P1: 主要功能故障
       - 部分用户受影响
       - 核心功能降级
       - 响应时间: 1 小时内

     P2: 次要功能故障
       - 少数用户受影响
       - 非核心功能不可用
       - 响应时间: 24 小时内
   ```

2. **定义响应流程**
   ```yaml
   标准流程:
     1. 检测（自动监控或用户报告）
     2. 分诊（确认事故等级）
     3. 响应（On-call 工程师处理）
     4. 解决（修复问题）
     5. 复盘（事后分析）
   ```

3. **建立沟通机制**
   - 内部: 钉钉 #incidents 群，每 30 分钟更新
   - 外部: P0 > 15 分钟时状态页面公告

4. **创建事故响应文档**
   - `docs/operations/INCIDENT_RESPONSE.md`
   - 包含事故响应流程图
   - 包含事故等级定义
   - 包含沟通模板

5. **创建复盘报告模板**
   - `docs/operations/POSTMORTEM_TEMPLATE.md`
   - 包含事故摘要
   - 包含时间线
   - 包含根因分析
   - 包含改进行动项

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 事故等级定义 | <ul><li>[x] P0/P1/P2 等级已明确定义</li><li>[x] 每个等级有明确示例</li><li>[x] 响应时间要求已定义</li></ul> |
| 响应流程 | <ul><li>[x] 5 步响应流程已定义</li><li>[x] 流程图已创建</li><li>[x] 每步有明确操作指南</li></ul> |
| 沟通机制 | <ul><li>[x] 钉钉 #incidents 群已创建</li><li>[x] 沟通模板已准备（更新模板）</li><li>[x] 状态页面机制已规划（P0 > 15 分钟）</li></ul> |
| 事故文档 | <ul><li>[x] docs/operations/INCIDENT_RESPONSE.md 存在</li><li>[x] 包含完整的事故响应流程</li><li>[x] 包含事故处理指南</li></ul> |
| 复盘模板 | <ul><li>[x] docs/operations/POSTMORTEM_TEMPLATE.md 存在</li><li>[x] 包含事故报告模板</li><li>[x] 包含根因分析框架（5 Whys）</li></ul> |
| 团队培训 | <ul><li>[x] 团队已接受事故响应培训</li><li>[x] 所有成员知道如何报告事故</li><li>[x] 所有成员知道事故响应流程</li></ul> |

**输出物**:
- `docs/operations/INCIDENT_RESPONSE.md` - 事故响应流程文档
- `docs/operations/POSTMORTEM_TEMPLATE.md` - 复盘报告模板
- 钉钉 #incidents 群

**风险提示**:
- ⚠️ 事故响应流程需定期演练
- ⚠️ 确保所有团队成员了解流程
- ⚠️ 复盘文化需建立（不追责）

---

#### TASK-008: 变更管理流程文档化

**优先级**: 🔴 P0 - 专家评审新增，必须立即实现
**预估工期**: 2 天
**状态**: `PENDING`

**任务描述**:
建立变更管理流程，防止未经授权或冲突的变更导致事故。定义变更分类、审批流程、变更窗口、变更记录。

**前置依赖**: TASK-003（On-call 值班轮换）

**前置检查项**:
- [ ] 已完成 TASK-003
- [ ] 已了解团队部署习惯

**参考文档**:
- `docs/reviews/sre_review_issue_019.md` - SRE 专家评审意见
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-REL-006

**执行步骤**:
1. **定义变更分类**
   ```yaml
   变更类型:
     标准变更:
       - 预批准（无需审批）
       - 示例: 配置修改、热修复、文档更新

     普通变更:
       - 需审批
       - 示例: 功能部署、架构调整
       - 审批: Tech Lead

     紧急变更:
       - 事后审批
       - 示例: 关键 Bug 修复、安全漏洞修复
       - 要求: 任意 2 位工程师 + 24 小时内补文档
   ```

2. **定义审批流程**
   - 标准变更: 自动检查
   - 普通变更: Tech Lead 审批（GitHub PR Review）
   - 紧急变更: 任意 2 位工程师批准，24 小时内补文档

3. **定义变更窗口**
   ```yaml
   变更窗口:
     生产环境:
       - 周一至周五 10:00-16:00（北京时间）
       - 节假日前后禁止变更
     紧急变更:
       - 任何时间（需记录原因）
   ```

4. **创建变更管理文档**
   - `docs/operations/CHANGE_MANAGEMENT.md`
   - 包含变更分类说明
   - 包含审批流程
   - 包含变更窗口
   - 包含变更记录模板

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 变更分类 | <ul><li>[x] 3 类变更已定义（标准、普通、紧急）</li><li>[x] 每类变更包含示例</li></ul> |
| 审批流程 | <ul><li>[x] 标准变更审批流程已定义</li><li>[x] 普通变更审批流程已定义（Tech Lead）</li><li>[x] 紧急变更审批流程已定义（2 位工程师）</li></ul> |
| 变更窗口 | <ul><li>[x] 生产环境变更窗口已定义</li><li>[x] 紧急变更窗口已定义</li><li>[x] 变更冻结规则已定义</li></ul> |
| 变更记录 | <ul><li>[x] docs/operations/CHANGE_MANAGEMENT.md 存在</li><li>[x] 变更记录模板已创建</li><li>[x] 变更日志格式已定义</li></ul> |
| 集成流程 | <ul><li>[x] GitHub PR 模板已更新（包含变更类型选择）</li><li>[x] PR 审批流程已配置</li></ul> |
| 团队培训 | <ul><li>[x] 团队已接受变更管理培训</li><li>[x] 所有成员了解变更流程</li></ul> |

**输出物**:
- `docs/operations/CHANGE_MANAGEMENT.md` - 变更管理文档
- `.github/PULL_REQUEST_TEMPLATE.md` - PR 模板（包含变更类型）

**风险提示**:
- ⚠️ 紧急变更需严格控制（防止滥用）
- ⚠️ 变更冻结需提前通知
- ⚠️ 变更记录需完整（可追溯）

---

#### TASK-009: CI 流水线建立

**优先级**: 🔴 P0 - 必须立即实现
**预估工期**: 3 天
**状态**: `PENDING`

**任务描述**:
建立持续集成流水线，实现代码提交后的自动测试、构建、配置验证。集成 E2E 测试、性能测试、质量门禁。

**前置依赖**:
- TASK-004（E2E 测试框架）
- TASK-005（质量门禁）
- TASK-006（性能测试框架）

**前置检查项**:
- [ ] 已完成 TASK-004
- [ ] 已完成 TASK-005
- [ ] 已完成 TASK-006

**参考文档**:
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-CICD-001
- `docs/fips/FIP_019_devops_pipeline.md` - FIP 技术方案 Week 2 部分

**执行步骤**:
1. **创建 CI Workflow**
   - 创建 `.github/workflows/ci.yml`
   - 定义触发条件（push、pull_request）

2. **配置 CI Jobs**
   ```yaml
   jobs:
     lint:          # 代码检查
     test:          # 单元测试
     build:         # 构建验证
     verify-config: # 配置验证
     e2e:           # E2E 测试（依赖 test）
     quality-gate:  # 质量门禁（依赖 lint, test）
   ```

3. **集成质量检查**
   - ESLint、Prettier、TypeScript 类型检查
   - 单元测试（覆盖率 ≥ 80%）
   - E2E 测试（关键流程）
   - 配置验证（占位符检测、必需变量检测）

4. **配置 CI 性能优化**
   - pnpm 缓存
   - Docker Buildx 缓存
   - 并行执行

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| CI Workflow | <ul><li>[x] .github/workflows/ci.yml 存在</li><li>[x] 包含 6 个 CI Jobs</li><li>[x] 触发条件已配置（push、PR）</li></ul> |
| 代码检查 | <ul><li>[x] ESLint 检查已配置</li><li>[x] TypeScript 类型检查已配置</li><li>[x] 代码格式检查已配置</li></ul> |
| 测试 | <ul><li>[x] 单元测试已配置</li><li>[x] 测试覆盖率报告已配置</li><li>[x] E2E 测试已集成</li></ul> |
| 构建验证 | <ul><li>[x] Backend 构建验证已配置</li><li>[x] Frontend 构建验证已配置</li><li>[x] 构建产物已保存（7 天）</li></ul> |
| 配置验证 | <ul><li>[x] 配置文件数量检查已配置</li><li>[x] 占位符检测已配置</li><li>[x] 必需变量检测已配置</li></ul> |
| 质量门禁 | <ul><li>[x] 质量门禁 Job 已配置</li><li>[x] 不满足指标时 PR 失败</li><li>[x] 质量报告已生成</li></ul> |
| CI 性能 | <ul><li>[x] CI 流水线时间 < 10 分钟</li><li>[x] 并行执行已配置</li><li>[x] 缓存已配置</li></ul> |
| CI 成功率 | <ul><li>[x] CI 流水线成功率 ≥ 95%</li><li>[x] 失败重试机制已配置</li></ul> |

**输出物**:
- `.github/workflows/ci.yml` - CI Workflow 配置
- CI 流水线测试报告（首次运行后）

**风险提示**:
- ⚠️ CI 流水线时间可能超过 10 分钟（需优化）
- ⚠️ 并行执行需注意依赖关系
- ⚠️ GitHub Actions 有免费额度限制（2000 分钟/月）

---

### WEEK 3: 部署流程与可靠性

---

#### TASK-010: 部署脚本整合

**优先级**: 🔴 P0 - 必须立即实现
**预估工期**: 2 天
**状态**: `PENDING`

**任务描述**:
整合现有的 20+ 个分散脚本，建立统一的部署工作流。整合到 5 个核心脚本，添加文档，确保幂等性。

**前置依赖**: TASK-001（配置文件清理与标准化）

**前置检查项**:
- [ ] 已完成 TASK-001
- [ ] 已阅读 `claudedocs/DEVOPS_AUDIT_LOCAL.md` 了解脚本现状

**参考文档**:
- `claudedocs/DEVOPS_AUDIT_LOCAL.md` - 部署脚本清单
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-DEPLOY-001

**执行步骤**:
1. **重构 scripts/ 目录结构**
   ```
   scripts/
   ├── ci/
   │   ├── test.sh
   │   └── build.sh
   ├── deploy/
   │   ├── deploy.sh        # 主部署脚本
   │   ├── rollback.sh      # 回滚脚本
   │   └── verify.sh        # 部署验证
   ├── backup/
   │   ├── backup.sh
   │   └── restore.sh
   └── README.md
   ```

2. **整合部署脚本**
   - `scripts/deploy/deploy.sh`: 一键部署脚本
   - 整合 `scripts/cloud/deploy-backend.sh`
   - 整合 `scripts/cloud/deploy-frontend.sh`
   - 整合 `scripts/cloud/deploy-database.sh`
   - 添加幂等性检查

3. **添加文档**
   - 每个脚本添加 `--help` 参数
   - 创建 `scripts/README.md`
   - 添加使用示例

4. **测试幂等性**
   - 重复运行脚本 3 次
   - 验证无副作用

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 脚本整合 | <ul><li>[x] scripts/ 目录结构已重构</li><li>[x] 核心脚本数量 ≤ 5 个</li><li>[x] 所有旧脚本已整合或删除</li></ul> |
| 脚本功能 | <ul><li>[x] deploy.sh 支持一键部署</li><li>[x] rollback.sh 支持一键回滚</li><li>[x] verify.sh 支持部署后验证</li></ul> |
| 幂等性 | <ul><li>[x] 脚本可重复执行（测试 3 次）</li><li>[x] 跳过已完成的步骤</li><li>[x] 无副作用</li></ul> |
| 脚本文档 | <ul><li>[x] 每个脚本有 --help 参数</li><li>[x] scripts/README.md 存在</li><li>[x] 包含使用示例</li></ul> |
| 一键部署 | <ul><li>[x] ./scripts/deploy/deploy.sh 成功</li><li>[x] 部署成功率 100%</li></ul> |

**输出物**:
- `scripts/deploy/deploy.sh` - 主部署脚本
- `scripts/deploy/rollback.sh` - 回滚脚本
- `scripts/deploy/verify.sh` - 验证脚本
- `scripts/README.md` - 脚本文档

**风险提示**:
- ⚠️ 整合前务必备份原有脚本
- ⚠️ 测试环境充分测试后再用于生产
- ⚠️ 幂等性验证很重要

---

#### TASK-011: 自动化回滚验证

**优先级**: 🔴 P0 - 专家评审新增，必须立即实现
**预估工期**: 3 天
**状态**: `PENDING`

**任务描述**:
确保回滚机制可靠有效，可在部署失败时快速恢复。建立自动化回滚测试脚本，定期验证回滚能力。

**前置依赖**: TASK-009（CI 流水线建立）

**前置检查项**:
- [ ] 已完成 TASK-009
- [ ] 已了解部署流程

**参考文档**:
- `docs/reviews/quality_review.md` - 质量专家评审意见
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-REL-007

**执行步骤**:
1. **创建回滚测试脚本**
   ```bash
   # scripts/test-rollback.sh
   #!/bin/bash
   set -e

   echo "🔄 回滚验证测试..."

   # 1. 部署测试版本
   echo "步骤 1: 部署测试版本"
   ./scripts/deploy/deploy.sh --version=test

   # 2. 验证服务健康
   echo "步骤 2: 验证服务健康"
   curl -f http://localhost:3000/health || exit 1

   # 3. 触发回滚
   echo "步骤 3: 触发回滚"
   START_TIME=$(date +%s)
   ./scripts/deploy/rollback.sh
   END_TIME=$(date +%s)
   ROLLBACK_TIME=$((END_TIME - START_TIME))

   # 4. 验证回滚成功
   echo "步骤 4: 验证回滚成功"
   curl -f http://localhost:3000/health || exit 1

   # 5. 验证数据完整性
   echo "步骤 5: 验证数据完整性"

   # 6. 检查回滚时间
   echo "步骤 6: 检查回滚时间"
   if [ $ROLLBACK_TIME -gt 180 ]; then
     echo "❌ 回滚时间 > 3 分钟 (${ROLLBACK_TIME}s)"
     exit 1
   fi

   echo "✅ 回滚验证通过！"
   ```

2. **集成到 CI 流程**
   ```yaml
   # .github/workflows/test-rollback.yml
   name: Test Rollback
   on:
     schedule:
       - cron: '0 3 * * 0'  # 每周日凌晨 3 点
     workflow_dispatch:

   jobs:
     test-rollback:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - name: Test rollback
           run: bash scripts/test-rollback.sh
   ```

3. **定义回滚时间目标**
   ```yaml
   回滚时间目标:
     检测: < 1 分钟
     决策: < 2 分钟
     执行: < 3 分钟
     验证: < 5 分钟
     总计: < 10 分钟
   ```

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 回滚脚本 | <ul><li>[x] scripts/test-rollback.sh 存在且可执行</li><li>[x] 包含 6 个测试步骤</li><li>[x] 测试 Staging 环境回滚</li></ul> |
| 回滚测试 | <ul><li>[x] 部署测试版本成功</li><li>[x] 回滚命令成功执行</li><li>[x] 回滚后服务健康</li><li>[x] 数据完整性验证通过</li></ul> |
| 回滚时间 | <ul><li>[x] 回滚时间 < 3 分钟</li><li>[x] 总回滚时间 < 10 分钟</li></ul> |
| CI 集成 | <ul><li>[x] 每周回滚测试已配置</li><li>[x] 每次部署 Staging 时执行回滚测试</li></ul> |
| 回滚文档 | <ul><li>[x] docs/operations/ROLLBACK.md 存在</li><li>[x] 包含回滚流程说明</li><li>[x] 包含回滚时间要求</li></ul> |

**输出物**:
- `scripts/test-rollback.sh` - 回滚验证脚本
- `.github/workflows/test-rollback.yml` - 回滚测试 CI
- `docs/operations/ROLLBACK.md` - 回滚文档

**风险提示**:
- ⚠️ 回滚测试会影响 Staging 环境服务
- ⚠️ 回滚测试需在低峰时段运行
- ⚠️ 需确保回滚后数据一致

---

#### TASK-012: CD 流水线建立

**优先级**: 🔴 P0 - 必须立即实现
**预估工期**: 2 天
**状态**: `PENDING`

**任务描述**:
建立持续部署流水线，实现自动化部署到 Staging 环境。配置健康检查、自动回滚机制。

**前置依赖**:
- TASK-009（CI 流水线建立）
- TASK-010（部署脚本整合）
- TASK-011（自动化回滚验证）

**前置检查项**:
- [ ] 已完成 TASK-009
- [ ] 已完成 TASK-010
- [ ] 已完成 TASK-011

**参考文档**:
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-CICD-002
- `docs/fips/FIP_019_devops_pipeline.md` - FIP 技术方案 Week 2 部分

**执行步骤**:
1. **创建 CD Workflow**
   - 创建 `.github/workflows/deploy-staging.yml`
   - 定义触发条件（push to develop）

2. **配置部署流程**
   ```yaml
   jobs:
     deploy:
       steps:
         - name: Checkout code
         - name: Deploy to Staging
           run: |
             ssh root@staging-server
             cd /opt/opclaw/platform
             git pull origin develop
             ./scripts/deploy/deploy.sh
         - name: Health check
           run: |
             curl -f http://staging-server/health
         - name: Rollback on failure
           if: failure()
           run: |
             ssh root@staging-server
             cd /opt/opclaw/platform
             ./scripts/deploy/rollback.sh
   ```

3. **配置健康检查**
   - 定义健康检查端点
   - 配置检查超时
   - 配置重试次数

4. **配置自动回滚**
   - 健康检查失败时触发回滚
   - 回滚超时 3 分钟
   - 回滚后告警

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| CD Workflow | <ul><li>[x] .github/workflows/deploy-staging.yml 存在</li><li>[x] 触发条件已配置（push to develop）</li></ul> |
| 自动部署 | <ul><li>[x] Push to develop 触发自动部署</li><li>[x] 部署脚本执行成功</li><li>[x] 部署时间 < 5 分钟</li></ul> |
| 健康检查 | <ul><li>[x] 健康检查端点已配置</li><li>[x] 检查超时已配置（60 秒）</li><li>[x] 重试次数已配置（3 次）</li></ul> |
| 自动回滚 | <ul><li>[x] 健康检查失败时自动回滚</li><li>[x] 回滚时间 < 3 分钟</li><li>[x] 回滚后服务恢复健康</li></ul> |
| 部署成功率 | <ul><li>[x] 部署成功率 ≥ 95%</li><li>[x] 回滚成功率 100%</li></ul> |

**输出物**:
- `.github/workflows/deploy-staging.yml` - CD Workflow 配置

**风险提示**:
- ⚠️ 自动部署需确保 develop 分支稳定
- ⚠️ 健康检查需覆盖所有关键服务
- ⚠️ 回滚机制需定期测试

---

### WEEK 4: 监控和备份体系

---

#### TASK-013: Prometheus + Grafana 部署

**优先级**: 🔴 P0 - 必须立即实现
**预估工期**: 2 天
**状态**: `PENDING`

**任务描述**:
部署 Prometheus 和 Grafana，建立基础监控体系。创建关键指标 Dashboard，包括 SLO 监控。

**前置依赖**: TASK-002（SLIs/SLOs 定义）

**前置检查项**:
- [ ] 已完成 TASK-002
- [ ] 确认服务器资源充足（~1.5GB 内存）

**参考文档**:
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-MONITOR-001
- `docs/fips/FIP_019_devops_pipeline.md` - FIP 技术方案工具链选型

**执行步骤**:
1. **部署 Prometheus**
   ```yaml
   # platform/docker-compose.prometheus.yml
   services:
     prometheus:
       image: prom/prometheus:latest
       container_name: opclaw-prometheus
       ports:
         - "9090:9090"
       volumes:
         - ./monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
         - prometheus_data:/prometheus
       command:
         - '--config.file=/etc/prometheus/prometheus.yml'
         - '--storage.tsdb.path=/prometheus'
         - '--web.console.libraries=/etc/prometheus/console_libraries'
         - '--web.console.templates=/etc/prometheus/consoles'
         - '--storage.tsdb.retention.time=30d'
       restart: unless-stopped
   ```

2. **配置 Prometheus**
   - 定义采集目标（Backend, Frontend, PostgreSQL, Redis）
   - 配置采集间隔（15 秒）
   - 配置数据保留（30 天）

3. **部署 Grafana**
   ```yaml
   services:
     grafana:
       image: grafana/grafana:latest
       container_name: opclaw-grafana
       ports:
         - "3001:3000"
       environment:
         - GF_SECURITY_ADMIN_PASSWORD=${ADMIN_PASSWORD}
       volumes:
         - grafana_data:/var/lib/grafana
         - ./monitoring/grafana/provisioning:/etc/grafana/provisioning
       restart: unless-stopped
   ```

4. **创建 SLO Dashboard**
   - 配置 SLO 监控面板
   - 显示 SLI 当前值
   - 显示 SLO 达成情况
   - 显示错误预算消耗

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| Prometheus | <ul><li>[x] Prometheus 容器运行正常</li><li>[x] http://localhost:9090 可访问</li><li>[x] 采集目标已配置</li><li>[x] 采集间隔 15 秒</li></ul> |
| Grafana | <ul><li>[x] Grafana 容器运行正常</li><li>[x] http://localhost:3001 可访问</li><li>[x] 默认密码已修改</li></ul> |
| Dashboard | <ul><li>[x] 系统概览 Dashboard 已创建</li><li>[x] SLO Dashboard 已创建</li><li>[x] 显示 SLI 当前值</li><li>[x] 显示 SLO 达成情况</li></ul> |
| 监控覆盖 | <ul><li>[x] Backend 监控已配置</li><li>[x] Frontend 监控已配置</li><li>[x] PostgreSQL 监控已配置</li><li>[x] Redis 监控已配置</li></ul> |
| 数据采集 | <ul><li>[x] 数据采集延迟 < 10 秒</li><li>[x] Dashboard 刷新频率 ≤ 30 秒</li></ul> |

**输出物**:
- `platform/docker-compose.prometheus.yml` - Prometheus 配置
- `platform/monitoring/prometheus/prometheus.yml` - Prometheus 配置文件
- `platform/monitoring/grafana/provisioning/` - Grafana 配置
- `platform/monitoring/grafana/dashboards/slo_dashboard.json` - SLO Dashboard

**风险提示**:
- ⚠️ 监控组件可能占用较多资源（~1.5GB 内存）
- ⚠️ 需定期清理历史数据（防止磁盘占满）
- ⚠️ Grafana 默认密码需修改

---

#### TASK-014: 日志聚合与告警

**优先级**: 🔴 P0 - 必须立即实现
**预估工期**: 2 天
**状态**: `PENDING`

**任务描述**:
部署 Loki 日志聚合和 Alertmanager 告警。配置钉钉告警集成，建立告警规则。

**前置依赖**:
- TASK-007（事故响应流程文档化）
- TASK-013（Prometheus + Grafana 部署）

**前置检查项**:
- [ ] 已完成 TASK-007
- [ ] 已完成 TASK-013
- [ ] 钉钉 #incidents 群已创建

**参考文档**:
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-MONITOR-002, REQ-MONITOR-003

**执行步骤**:
1. **部署 Loki**
   ```yaml
   services:
     loki:
       image: grafana/loki:latest
       container_name: opclaw-loki
       ports:
         - "3100:3100"
       volumes:
         - ./monitoring/loki/loki-config.yml:/mnt/config/config.yml
         - loki_data:/loki
       command: -config.file=/mnt/config/config.yml
       restart: unless-stopped

     promtail:
       image: grafana/promtail:latest
       container_name: opclaw-promtail
       volumes:
         - /var/log:/var/log:ro
         - ./monitoring/promtail/promtail-config.yml:/etc/promtail/config.yml
       command: -config.file=/etc/promtail/config.yml
       restart: unless-stopped
   ```

2. **配置 Promtail**
   - 配置日志采集源（Docker 容器日志）
   - 配置日志标签
   - 配置日志解析

3. **部署 Alertmanager**
   ```yaml
   services:
     alertmanager:
       image: prom/alertmanager:latest
       container_name: opclaw-alertmanager
       ports:
         - "9093:9093"
       volumes:
         - ./monitoring/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml
       restart: unless-stopped
   ```

4. **配置告警规则**
   ```yaml
   # platform/monitoring/prometheus/alerts.yml
   groups:
     - name: service_alerts
       rules:
         - alert: ServiceDown
           expr: up == 0
           for: 1m
           labels:
             severity: critical
           annotations:
             summary: "Service {{ $labels.instance }} is down"

         - alert: HighErrorRate
           expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.01
           for: 5m
           labels:
             severity: warning
           annotations:
             summary: "High error rate detected"
   ```

5. **配置钉钉告警**
   - 配置 Alertmanager 钉钉 webhook
   - 配置告警路由
   - 测试告警发送

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| Loki | <ul><li>[x] Loki 容器运行正常</li><li>[x] 日志采集覆盖率 100%</li><li>[x] 日志搜索响应时间 < 3 秒</li></ul> |
| Promtail | <ul><li>[x] Promtail 容器运行正常</li><li>[x] 所有容器日志已采集</li></ul> |
| Alertmanager | <ul><li>[x] Alertmanager 容器运行正常</li><li>[x] 告警规则已配置</li></ul> |
| 钉钉告警 | <ul><li>[x] 钉钉告警已集成</li><li>[x] 测试告警成功发送</li><li>[x] 告警格式清晰</li></ul> |
| 告警规则 | <ul><li>[x] 服务宕机告警（down > 1min）</li><li>[x] 高错误率告警（>10%）</li><li>[x] 高延迟告警（P95 > 3s）</li><li>[x] 资源告警（CPU/内存 > 90%）</li></ul> |
| 告警准确率 | <ul><li>[x] 告警准确率 ≥ 95%</li><li>[x] 误报率 < 5%</li></ul> |

**输出物**:
- `platform/docker-compose.loki.yml` - Loki 配置
- `platform/monitoring/prometheus/alerts.yml` - 告警规则
- `platform/monitoring/alertmanager/alertmanager.yml` - Alertmanager 配置
- 钉钉告警 webhook 配置

**风险提示**:
- ⚠️ 日志聚合可能占用较多磁盘空间
- ⚠️ 告警规则需调优（防止告警风暴）
- ⚠️ 钉钉告警有频率限制

---

#### TASK-015: 自动备份体系建立

**优先级**: 🔴 P0 - 必须立即实现
**预估工期**: 1 天
**状态**: `PENDING`

**任务描述**:
建立自动化备份机制，确保数据安全。配置每日备份、备份验证、恢复测试。

**前置依赖**: 无（可与前序任务并行）

**前置检查项**:
- [ ] 确认备份存储路径
- [ ] 确认备份保留策略

**参考文档**:
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-BACKUP-001, REQ-BACKUP-002

**执行步骤**:
1. **创建备份脚本**
   ```bash
   # scripts/backup/backup.sh
   #!/bin/bash
   set -e

   BACKUP_DIR="/opt/opclaw/backups"
   DATE=$(date +%Y%m%d_%H%M%S)
   BACKUP_FILE="opclaw_backup_${DATE}.sql.gz"

   echo "🔄 开始备份..."

   # PostgreSQL 备份
   docker exec opclaw-postgres pg_dump -U opclaw opclaw | gzip > "${BACKUP_DIR}/${BACKUP_FILE}"

   # 验证备份文件
   if [ -f "${BACKUP_DIR}/${BACKUP_FILE}" ]; then
     SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_FILE}" | cut -f1)
     echo "✅ 备份成功: ${BACKUP_FILE} (${SIZE})"
   else
     echo "❌ 备份失败"
     exit 1
   fi

   # 清理旧备份（保留 7 天）
   find "${BACKUP_DIR}" -name "opclaw_backup_*.sql.gz" -mtime +7 -delete

   echo "✅ 备份完成"
   ```

2. **配置 crontab**
   ```bash
   # 每日凌晨 2 点备份
   0 2 * * * /opt/opclaw/scripts/backup/backup.sh >> /var/log/opclaw-backup.log 2>&1
   ```

3. **创建恢复脚本**
   ```bash
   # scripts/backup/restore.sh
   #!/bin/bash
   set -e

   BACKUP_FILE=$1

   if [ -z "$BACKUP_FILE" ]; then
     echo "Usage: $0 <backup_file>"
     exit 1
   fi

   echo "🔄 开始恢复..."

   # 恢复 PostgreSQL
   gunzip < "${BACKUP_FILE}" | docker exec -i opclaw-postgres psql -U opclaw opclaw

   echo "✅ 恢复完成"
   ```

4. **测试备份恢复**
   - 每周执行一次恢复测试
   - 验证数据完整性

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 备份脚本 | <ul><li>[x] scripts/backup/backup.sh 存在且可执行</li><li>[x] 支持数据库备份</li><li>[x] 支持配置文件备份</li></ul> |
| 备份自动化 | <ul><li>[x] crontab 已配置（每日凌晨 2 点）</li><li>[x] 备份日志已记录</li><li>[x] 备份自动化 100%</li></ul> |
| 备份保留 | <ul><li>[x] 每日备份保留 7 天</li><li>[x] 每周备份保留 4 周</li><li>[x] 每月备份保留 12 个月</li></ul> |
| 备份验证 | <ul><li>[x] 备份完整性验证通过</li><li>[x] 备份成功率 ≥ 99%</li><li>[x] 备份文件大小合理</li></ul> |
| 恢复测试 | <ul><li>[x] scripts/backup/restore.sh 存在</li><li>[x] 每月恢复测试完成</li><li>[x] 恢复成功率 100%（测试环境）</li></ul> |
| RPO/RTO | <ul><li>[x] RPO < 24 小时</li><li>[x] RTO < 1 小时</li></ul> |

**输出物**:
- `scripts/backup/backup.sh` - 备份脚本
- `scripts/backup/restore.sh` - 恢复脚本
- `docs/operations/BACKUP_RESTORE.md` - 备份恢复文档

**风险提示**:
- ⚠️ 备份文件需加密存储（如果包含敏感信息）
- ⚠️ 备份测试需在非生产环境进行
- ⚠️ 备份存储需有足够空间

---

### WEEK 5-6: 高可用性准备

---

#### TASK-016: Kubernetes 迁移计划

**优先级**: 🟡 P1 - 短期改进
**预估工期**: 5 天
**状态**: `PENDING`

**任务描述**:
规划从 Docker Compose 到 Kubernetes 的迁移路径。编写 Helm charts，定义迁移测试策略。

**前置依赖**: TASK-015（自动备份体系建立）

**前置检查项**:
- [ ] 已完成 TASK-015
- [ ] 已了解当前 Docker Compose 架构

**参考文档**:
- `docs/requirements/core_req_019_devops_pipeline.md` - 需求 REQ-SCALE-001
- `docs/reviews/architecture_review.md` - 架构专家评审意见

**执行步骤**:
1. **创建 Kubernetes 架构设计**
   - 定义 Kubernetes 资源（Deployment, Service, ConfigMap, Secret）
   - 定义持久化存储（PVC）
   - 定义 Ingress 规则

2. **编写 Helm Charts**
   ```
   charts/
   └── opclaw-platform/
       ├── Chart.yaml
       ├── values.yaml
       ├── values-dev.yaml
       ├── values-staging.yaml
       └── values-prod.yaml
       ├── templates/
       │   ├── backend/
       │   │   ├── deployment.yaml
       │   │   ├── service.yaml
       │   │   └── hpa.yaml
       │   ├── frontend/
       │   ├── postgres/
       │   └── redis/
   ```

3. **Service Mesh 选型**
   - 对比 Istio vs Linkerd
   - 编写选型报告
   - 定义迁移路径

4. **定义迁移测试策略**
   - 定义测试场景
   - 定义回滚策略
   - 定义验证标准

5. **定义迁移触发条件**
   ```yaml
   迁移触发条件:
     - 实例数量 > 40（原计划 50）
     - 需要自动扩容
     - 需要蓝绿部署
     - 需要多可用区部署
   ```

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| K8s 架构设计 | <ul><li>[x] Kubernetes 架构设计文档存在</li><li>[x] 包含所有服务的 K8s 资源定义</li><li>[x] 包含持久化存储方案</li></ul> |
| Helm Charts | <ul><li>[x] Helm Chart 目录结构已创建</li><li>[x] 包含 Backend/Frontend/Postgres/Redis charts</li><li>[x] values.yaml 包含所有可配置参数</li></ul> |
| Service Mesh | <ul><li>[x] Service Mesh 选型报告存在</li><li>[x] 包含 Istio vs Linkerd 对比</li><li>[x] 包含推荐方案和理由</li></ul> |
| 迁移策略 | <ul><li>[x] 迁移测试策略已定义</li><li>[x] 回滚策略已定义</li><li>[x] 验证标准已定义</li></ul> |
| 迁移触发 | <ul><li>[x] 迁移触发条件已定义</li><li>[x] 触发条件明确（实例数 > 40）</li></ul> |
| 迁移文档 | <ul><li>[x] docs/operations/K8S_MIGRATION.md 存在</li><li>[x] 包含迁移步骤</li><li>[x] 包含回滚步骤</li></ul> |

**输出物**:
- `charts/opclaw-platform/` - Helm Charts
- `docs/operations/K8S_MIGRATION.md` - Kubernetes 迁移计划
- `docs/operations/SERVICE_MESH_SELECTION.md` - Service Mesh 选型报告

**风险提示**:
- ⚠️ Kubernetes 迁移是重大变更，需充分测试
- ⚠️ 迁移可能引入新的复杂度
- ⚠️ 需团队学习 Kubernetes 相关知识

---

#### TASK-017: HA 架构设计

**优先级**: 🟡 P1 - 短期改进
**预估工期**: 5 天
**状态**: `PENDING`

**任务描述**:
设计高可用性架构，解决单点故障问题。规划主备、多AZ、流复制等方案。

**前置依赖**: TASK-016（Kubernetes 迁移计划）

**前置检查项**:
- [ ] 已完成 TASK-016
- [ ] 已了解当前基础设施限制

**参考文档**:
- `docs/reviews/architecture_review.md` - 架构专家评审意见
- `docs/reviews/sre_review_issue_019.md` - SRE 专家评审意见

**执行步骤**:
1. **设计 HA 架构**
   ```yaml
   高可用架构:
     - 添加第二台 Platform 服务器（active-passive）
     - PostgreSQL 流复制（1 Primary + 1 Standby）
     - Redis Sentinel（1 Master + 2 Sentinels）
     - HAProxy/Nginx 负载均衡
     - 多可用区部署（如果云迁移）
   ```

2. **PostgreSQL 流复制方案**
   - 定义流复制配置
   - 定义故障切换流程
   - 定义数据同步验证

3. **Redis Sentinel 方案**
   - 定义 Sentinel 配置
   - 定义故障切换流程
   - 定义主从切换

4. **负载均衡方案**
   - 定义负载均衡配置
   - 定义健康检查
   - 定义故障转移

5. **规划 interim 措施**（Month 2-3 之前）
   - 文档化快速恢复流程（<15 分钟 MTTR）
   - 预准备用服务器
   - 自动化故障切换脚本

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| HA 架构设计 | <ul><li>[x] docs/operations/HA_ARCHITECTURE.md 存在</li><li>[x] HA 架构图已创建</li><li>[x] 包含所有组件的 HA 方案</li></ul> |
| PostgreSQL HA | <ul><li>[x] 流复制方案已定义</li><li>[x] 故障切换流程已定义</li><li>[x] 数据同步验证已定义</li></ul> |
| Redis HA | <ul><li>[x] Sentinel 配置已定义</li><li>[x] 故障切换流程已定义</li><li>[x] 主从切换流程已定义</li></ul> |
| 负载均衡 | <ul><li>[x] 负载均衡方案已定义</li><li>[x] 健康检查已配置</li><li>[x] 故障转移已定义</li></ul> |
| Interim 措施 | <ul><li>[x] 快速恢复流程已文档化（<15 分钟）</li><li>[x] 备用服务器准备流程已定义</li><li>[x] 自动化故障切换脚本已创建</li></ul> |
| 实施时间表 | <ul><li>[x] Month 2-3 实施计划已定义</li><li>[x] 资源需求已评估</li><li>[x] 风险评估已完成</li></ul> |

**输出物**:
- `docs/operations/HA_ARCHITECTURE.md` - HA 架构设计文档

**风险提示**:
- ⚚️ HA 架构需要额外资源（成本增加）
- ⚠️ 流复制和故障切换需充分测试
- ⚠️ Interim 措施需定期演练

---

## 📊 任务执行状态追踪

### 当前任务状态

**下一个待执行任务**: TASK-004（E2E 测试框架搭建）

### 最近更新

| 日期 | 更新内容 | 更新人 |
|------|----------|--------|
| 2026-03-18 | TASK-003 完成 ✅ | DevOps 专家 |
| 2026-03-18 | TASK-002 完成 ✅ | DevOps 专家 |
| 2026-03-18 | TASK-001 完成 ✅ | DevOps 专家 |
| 2026-03-18 | 初始任务列表创建 | DevOps 专家 |

### 风险提示

- 🔴 **P0 任务阻塞**: 无
- 🟡 **P1 任务阻塞**: 无
- 🟢 **进度正常**: ✅

---

## 附录

### A. 提交规范

所有任务完成后，使用以下格式提交：

```
feat(TASK-XXX): <简短描述>

- <改动点1>
- <改动点2>

Task: TASK-XXX
Acceptance Criteria:
- [x] <检查项1>
- [x] <检查项2>
```

### B. 快速参考

| 操作 | 命令 |
|------|------|
| 查看任务列表 | `cat docs/tasks/TASK_LIST_issue_019_devops_pipeline.md` |
| 更新任务状态 | 编辑 `docs/tasks/TASK_LIST_issue_019_devops_pipeline.md` |
| 开始任务 | 1. 清理上下文（/clear）<br>2. 读取本文件<br>3. 定位目标任务<br>4. 执行任务 |
| 完成任务 | 1. 验证 Acceptance Criteria<br>2. Git commit<br>3. 更新任务状态 |

---

**文档版本**: 1.0
**创建日期**: 2026-03-18
**下次更新**: 任务完成后
