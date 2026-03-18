# 服务级别指标（SLIs）和服务级别目标（SLOs）

本文档定义 AIOpc 平台的服务级别指标（Service Level Indicators, SLIs）和服务级别目标（Service Level Objectives, SLOs），以及错误预算跟踪机制。

## 文档目的

- 量化系统可靠性要求
- 为监控和告警提供依据
- 建立错误预算跟踪机制
- 指导容量规划和性能优化

## 服务级别指标（SLIs）

### 1. 可用性（Availability）

**定义**: 系统正常服务的时间比例

**计算公式**:
```
可用性 = (成功请求数 / 总请求数) × 100%
```

**采集方式**:
```yaml
指标名称: http_requests_success_rate
Prometheus 查询:
  sum(rate(http_requests_total{status!~"5.."}[5m]))
  /
  sum(rate(http_requests_total[5m])) * 100

数据来源:
  - 后端 API: /health, /api/* endpoints
  - WebSocket 连接成功率
  - 数据库连接成功率
```

**单位**: 百分比 (%)

**采集频率**: 每 30 秒

### 2. 延迟（Latency）

**定义**: 请求从发送到响应的时间

**计算公式**:
```
P50 延迟 = histogram_quantile(0.50, http_request_duration_seconds)
P95 延迟 = histogram_quantile(0.95, http_request_duration_seconds)
P99 延迟 = histogram_quantile(0.99, http_request_duration_seconds)
```

**采集方式**:
```yaml
指标名称: http_request_duration_seconds
Prometheus 查询:
  P50: histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
  P95: histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))
  P99: histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

数据来源:
  - HTTP 请求持续时间
  - 数据库查询时间
  - 外部 API 调用时间（DeepSeek, Feishu）
```

**单位**: 毫秒 (ms)

**采集频率**: 每 30 秒

### 3. 错误率（Error Rate）

**定义**: 返回 5xx 状态码的请求比例

**计算公式**:
```
错误率 = (5xx 错误请求数 / 总请求数) × 100%
```

**采集方式**:
```yaml
指标名称: http_request_error_rate
Prometheus 查询:
  sum(rate(http_requests_total{status=~"5.."}[5m]))
  /
  sum(rate(http_requests_total[5m])) * 100

数据来源:
  - HTTP 5xx 状态码
  - 应用未捕获异常
  - 超时错误
```

**单位**: 百分比 (%)

**采集频率**: 每 30 秒

### 4. 吞吐量（Throughput）

**定义**: 系统每秒处理的请求数

**计算公式**:
```
吞吐量 = 每秒请求数 (RPS)
```

**采集方式**:
```yaml
指标名称: http_requests_per_second
Prometheus 查询:
  sum(rate(http_requests_total[1m]))

数据来源:
  - HTTP 请求总数
  - WebSocket 消息数
  - 后台任务处理数
```

**单位**: 请求/秒 (req/s)

**采集频率**: 每 30 秒

## 服务级别目标（SLOs）

### 核心服务目标

| SLI | SLO 目标 | 测量窗口 | 容忍停机时间 |
|-----|----------|----------|--------------|
| **可用性** | ≥ 99.9% | 滚动 30 天 | 43.8 分钟/月 |
| **P95 延迟** | < 500ms | 滚动 24 小时 | - |
| **P99 延迟** | < 1000ms | 滚动 24 小时 | - |
| **错误率** | < 0.1% | 滚动 30 天 | - |
| **数据持久性** | 99.999% | 年度 | - |

### 服务分级

不同服务级别的 SLO 要求：

| 服务级别 | 可用性目标 | P95 延迟目标 | 错误率目标 | 优先级 |
|---------|-----------|--------------|-----------|--------|
| **核心 API** | 99.9% | < 300ms | < 0.05% | P0 |
| **OAuth 服务** | 99.95% | < 200ms | < 0.01% | P0 |
| **WebSocket 网关** | 99.5% | < 100ms | < 0.5% | P1 |
| **实例管理** | 99% | < 1000ms | < 1% | P2 |
| **监控告警** | 99.99% | < 5000ms | < 0.1% | P0 |

### SLO 计算示例

**可用性计算**:
```
目标可用性: 99.9%
每月分钟数: 43,200 分钟
最大停机时间: 43,200 × (1 - 0.999) = 43.2 分钟/月
```

**延迟计算**:
```
P95 目标: 500ms
- 95% 的请求应在 500ms 内完成
- 允许 5% 的请求超过 500ms
```

**错误率计算**:
```
目标错误率: 0.1%
- 每 1000 个请求中最多允许 1 个错误
```

## 错误预算（Error Budget）

### 错误预算定义

**每月错误预算**: 43.8 分钟

**计算公式**:
```
错误预算 = 总时间 × (1 - 可用性目标)
每月预算 = 30 天 × 24 小时 × 60 分钟 × (1 - 0.999) = 43.2 分钟
```

### 错误预算跟踪

```yaml
预算监控:
  指标名称: error_budget_remaining
  计算公式:
    (43.8 × 60 - 实际停机秒数) / (43.8 × 60) × 100

  采集方式:
    sum(increase(downtime_seconds[30d]))

  更新频率: 每 30 秒
```

### 错误预算告警阈值

| 预算剩余 | 告警级别 | 行动 |
|---------|---------|------|
| > 50% | 🟢 正常 | 正常开发和部署 |
| 20% - 50% | 🟡 警告 | 减少非关键功能开发，优先稳定性 |
| 10% - 20% | 🟠 严重 | 暂停非紧急部署，专注修复 |
| < 10% | 🔴 紧急 | 只允许紧急修复，暂停所有功能开发 |

### 错误预算消耗场景

以下情况会消耗错误预算：

| 场例 | 影响范围 | 预算消耗 |
|------|---------|---------|
| 计划内维护 | 全局 | 不计入（维护窗口除外） |
| 部署失败 | 全局 | 实际停机时间 |
| Bug 导致崩溃 | 全局 | 实际停机时间 |
| 性能下降 | 部分用户 | 按影响比例计算 |
| 第三方服务故障 | 依赖功能 | 按影响比例计算 |

## 监控和告警

### Prometheus Recording Rules

```yaml
# 可用性 SLI
http_requests_success_rate =
  sum(rate(http_requests_total{status!~"5.."}[5m]))
  /
  sum(rate(http_requests_total[5m])) * 100

# P95 延迟 SLI
http_request_duration_p95 =
  histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# 错误率 SLI
http_request_error_rate =
  sum(rate(http_requests_total{status=~"5.."}[5m]))
  /
  sum(rate(http_requests_total[5m])) * 100

# 错误预算剩余
error_budget_remaining =
  (43.8 * 60 - sum(increase(downtime_seconds[30d])))
  /
  (43.8 * 60) * 100
```

### 告警规则

```yaml
- alert: HighErrorRate
  expr: http_request_error_rate > 0.1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "错误率超过 SLO 阈值 (0.1%)"

- alert: HighP95Latency
  expr: http_request_duration_p95 > 0.5
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "P95 延迟超过 SLO 阈值 (500ms)"

- alert: ErrorBudgetLow
  expr: error_budget_remaining < 50
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "错误预算剩余低于 50% - 减少非关键功能开发"

- alert: ErrorBudgetCritical
  expr: error_budget_remaining < 20
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "错误预算剩余低于 20% - 暂停非紧急部署"

- alert: ErrorBudgetExhausted
  expr: error_budget_remaining < 10
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "错误预算剩余低于 10% - 只允许紧急修复"
```

## Grafana Dashboard

### 关键面板

1. **可用性趋势**
   - 当前可用性
   - 30 天滚动平均
   - SLO 目标线（99.9%）

2. **延迟分布**
   - P50/P95/P99 延迟
   - SLO 目标线（P95: 500ms, P99: 1000ms）
   - 按端点分组

3. **错误率趋势**
   - 当前错误率
   - 30 天滚动平均
   - SLO 阈值线（0.1%）

4. **错误预算消耗**
   - 剩余预算百分比
   - 预计耗尽时间
   - 停机事件时间线

5. **吞吐量监控**
   - 每秒请求数
   - 峰值和谷值
   - 容量规划参考

## SLO 违反处理流程

### 检测和响应

1. **自动检测**
   - Prometheus 告警触发
   - PagerDuty/企业微信通知

2. **初步评估**（15 分钟内）
   - 确认 SLO 违反程度
   - 识别影响范围
   - 确定根本原因

3. **紧急响应**（如适用）
   - 执行回滚
   - 启用降级模式
   - 修复关键问题

4. **事后分析**
   - 5 Why 分析
   - 改进措施制定
   - 预防机制建立

### SLO 调整流程

SLO 调整需要经过以下流程：

1. **提出调整理由**
   - 业务需求变化
   - 技术架构演进
   - 成本效益分析

2. **影响评估**
   - 用户体验影响
   - 错误预算变化
   - 监控告警调整

3. **审批流程**
   - 技术负责人审批
   - 产品经理确认
   - SRE 团队评估

4. **实施和监控**
   - 更新 SLO 文档
   - 调整告警规则
   - 观察 30 天

## 数据来源和集成

### 指标采集点

```yaml
后端 API (platform/backend):
  - HTTP 请求指标
  - 数据库查询指标
  - WebSocket 连接指标
  - 外部 API 调用指标

基础设施:
  - Docker 容器健康
  - PostgreSQL 性能
  - Redis 性能
  - Nginx 状态

远程代理 (Remote Agent):
  - WebSocket 心跳成功率
  - 消息传递延迟
  - 代理注册状态
```

### 数据采集配置

```yaml
Prometheus targets:
  - job_name: 'backend'
    scrape_interval: 15s
    static_configs:
      - targets: ['backend:3000']

  - job_name: 'postgres'
    scrape_interval: 30s
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    scrape_interval: 30s
    static_configs:
      - targets: ['redis-exporter:9121']
```

## 报告和回顾

### 月度 SLO 报告

每月生成 SLO 表现报告，包含：

1. **整体表现**
   - 可用性达成率
   - 延迟达成率
   - 错误率达成率

2. **停机事件**
   - 时间线
   - 根本原因
   - 影响范围

3. **错误预算使用**
   - 消耗明细
   - 未使用预算
   - 趋势分析

4. **改进建议**
   - 技术改进
   - 流程优化
   - 资源调整

### 季度 SLO 回顾

每季度进行 SLO 回顾会议：

1. **评估 SLO 有效性**
   - 是否反映用户体验
   - 是否可测量
   - 是否可操作

2. **调整 SLO 目标**
   - 根据历史数据
   - 业务需求变化
   - 技术能力提升

3. **优化监控体系**
   - 告警阈值调整
   - 仪表板优化
   - 数据采集改进

## 参考文档

- [Google SRE Book - Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- `docs/requirements/core_req_019_devops_pipeline.md` - DevOps 管道需求
- `docs/reviews/sre_review_issue_019.md` - SRE 专家评审意见

## 版本历史

| 版本 | 日期 | 变更 | 作者 |
|-----|------|------|------|
| 1.0 | 2026-03-18 | 初始版本 | Claude Code |
