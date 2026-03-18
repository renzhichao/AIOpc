# CI 流水线文档

## 概述

AIOpc 平台使用 GitHub Actions 实现持续集成（CI）流水线，确保代码质量和构建稳定性。CI 流水线在代码推送到 `main` 或 `develop` 分支，或创建 Pull Request 时自动触发。

## 流水线架构

### 主 CI 流水线 (`ci.yml`)

完整的 CI 流水线包含 6 个核心任务（Jobs）：

```
┌─────────────────────────────────────────────────────────────┐
│                     CI Pipeline (ci.yml)                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Lint   │  │  Test   │  │  Build   │  │ Verify Config│  │
│  └────┬────┘  └────┬────┘  └────┬─────┘  └──────┬───────┘  │
│       │            │            │                 │           │
│       └────────────┴────────────┴─────────────────┘           │
│                            │                                 │
│                ┌───────────┴───────────┐                     │
│                │                       │                     │
│         ┌──────▼──────┐         ┌──────▼──────┐             │
│         │  E2E Tests  │         │Quality Gate  │             │
│         └─────────────┘         └─────────────┘             │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         Performance Test (parallel)                  │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐          │    │
│  │  │ Baseline │  │  Normal  │  │   Peak   │          │    │
│  │  └──────────┘  └──────────┘  └──────────┘          │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### PR 检查流水线 (`pr-check.yml`)

快速 PR 检查流水线包含 3 个核心任务，用于快速反馈：

```
┌─────────────────────────────────────────┐
│      PR Check (pr-check.yml)             │
├─────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │  Lint   │  │  Test   │  │  Build  │ │
│  └────┬────┘  └────┬────┘  └────┬────┘ │
│       └────────────┴────────────┘       │
│                  │                      │
│          ┌───────▼────────┐             │
│          │  PR Summary    │             │
│          └────────────────┘             │
└─────────────────────────────────────────┘
```

## CI 任务详解

### 1. Lint 任务

**目的**: 检查代码质量和格式规范

**执行内容**:
- ESLint 检查（后端和前端）
- Prettier 格式检查（如果配置）
- 并行执行：backend 和 frontend

**质量标准**:
- ESLint 错误数: 0
- 代码格式: 符合 Prettier 规范

**缓存策略**:
- pnpm store cache
- 基于 `pnpm-lock.yaml` 哈希值

**失败处理**:
- 任何 ESLint 错误都会导致任务失败
- PR 无法合并

### 2. Test 任务

**目的**: 运行单元测试并验证覆盖率

**执行内容**:
- 运行所有单元测试
- 生成测试覆盖率报告
- 验证覆盖率阈值（≥80%）

**质量标准**:
- 单元测试必须全部通过
- 测试覆盖率 ≥ 80%
- 失败的测试会导致 CI 失败

**覆盖率检查**:
```javascript
// Jest 格式 (backend)
coverage/coverage-summary.json
├── total.lines.pct >= 80

// Vitest 格式 (frontend)
coverage/coverage-final.json
├── 计算所有文件的行覆盖率 >= 80%
```

**产物上传**:
- 覆盖率报告保留 7 天
- 可在 GitHub Actions Artifacts 中下载

### 3. Build 任务

**目的**: 验证后端和前端构建成功

**执行内容**:
- 后端 TypeScript 编译
- 前端 Vite 构建打包
- 验证构建输出目录

**质量标准**:
- 构建必须成功完成
- `dist/` 目录必须存在
- 无构建错误或警告

**产物上传**:
- 构建产物保留 7 天
- 用于部署和测试

### 4. Verify Config 任务

**目的**: 验证配置文件完整性

**执行内容**:
- 检查配置文件数量（必须为 1 个）
- 检测占位符值
- 验证必需的环境变量

**质量标准**:
- 配置文件数量: 1 个 (`platform/.env.production`)
- 无无效占位符: `cli_xxxxxxxxxxxxx`, `CHANGE_THIS`, `your_`, `placeholder`
- 必需变量: 全部存在

**必需变量列表**:
```bash
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD
REDIS_HOST
REDIS_PORT
JWT_SECRET
FEISHU_APP_ID
FEISHU_APP_SECRET
```

**失败处理**:
- 配置错误会导致 CI 失败
- 防止错误配置部署到生产环境

### 5. E2E 任务

**目的**: 运行端到端测试，验证用户流程

**依赖关系**:
- 依赖 `test` 任务完成

**执行内容**:
- Playwright E2E 测试
- 多浏览器测试: Chromium, Firefox, WebKit
- 分片执行（4 个分片）提高并行度

**测试场景**:
- 认证流程 (`auth.spec.ts`)
- 实例管理 (`instance.spec.ts`)
- WebSocket 连接 (`websocket.spec.ts`)

**矩阵策略**:
```yaml
browser: [chromium, firefox, webkit]
shard: [1/4, 2/4, 3/4, 4/4]
# 总共 12 个并行任务
```

**缓存策略**:
- Playwright 浏览器缓存
- 基于 `package.json` 和 `playwright.config.ts` 哈希值

**产物上传**:
- Playwright 报告（保留 7 天）
- 失败时的截图（保留 7 天）

### 6. Quality Gate 任务

**目的**: 强制执行质量标准

**依赖关系**:
- 依赖 `lint` 和 `test` 任务完成

**执行内容**:
- 运行 `scripts/quality-gate.sh`
- 验证所有质量指标
- 生成质量报告

**质量指标**:
```bash
ESLint Errors:           0 (必需)
TypeScript Errors:       0 (必需)
Test Coverage:          ≥80% (必需)
Security Vulnerabilities: 0 high/critical (必需)
Code Smells:            ≤5 high severity (警告)
```

**失败处理**:
- 任何质量指标不达标都会失败
- PR 无法合并
- 生成详细的质量报告

### 7. Performance Test 任务

**目的**: 运行性能测试，验证性能基准

**依赖关系**:
- 依赖 `test` 任务完成

**执行内容**:
- k6 性能测试
- 基准测试（baseline）和正常负载测试（normal）
- 生成性能指标报告

**测试场景**:
- `baseline`: 10 VUs, 1 分钟
- `normal`: 100 VUs, 5 分钟

**缓存策略**:
- k6 二进制缓存
- 基于 `k6.config.js` 哈希值

**产物上传**:
- 性能测试结果 JSON（保留 7 天）
- 可用于性能趋势分析

## 任务依赖关系

### 主 CI 流水线依赖

```
lint ──────────────┐
                   ├──> quality-gate
test ──────────────┤       │
                   │       │
test ──────────────┼──> e2e        (并行)
                   │
lint, test, build ─┴──> verify-config (并行)
```

### PR 检查流水线依赖

```
lint ────┐
         ├──> pr-summary
test ────┤
         │
build ───┘
```

## 性能优化策略

### 1. 并行执行

**并行任务**:
- `lint`, `test`, `build`, `verify-config` 并行执行
- `e2e` 任务使用矩阵策略（12 个并行任务）
- `performance-test` 任务并行执行

**时间节省**:
```
串行执行: 5 + 8 + 6 + 2 + 15 + 10 = 46 分钟
并行执行: max(5, 8, 6, 2) + 15 + max(5, 10) = 8 + 15 + 10 = 33 分钟
节省: 13 分钟 (28%)
```

### 2. 缓存策略

**pnpm 缓存**:
```yaml
path: ~/.pnpm-store
key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
restore-keys:
  - ${{ runner.os }}-pnpm-store-
```

**Playwright 缓存**:
```yaml
path: ~/.cache/ms-playwright
key: ${{ runner.os }}-playwright-${{ hashFiles('**/playwright.config.ts') }}
```

**k6 缓存**:
```yaml
path: ~/.config/k6
key: ${{ runner.os }}-k6-${{ hashFiles('**/k6.config.js') }}
```

**缓存效果**:
- 依赖安装时间: 3-5 分钟 → 30-60 秒
- 浏览器安装时间: 2-3 分钟 → 10-20 秒

### 3. 任务取消策略

**并发取消**:
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**效果**:
- 新的推送取消旧的运行
- 节省 CI 资源和时间

### 4. 矩阵策略优化

**E2E 测试分片**:
```yaml
strategy:
  matrix:
    browser: [chromium, firefox, webkit]
    shard: [1/4, 2/4, 3/4, 4/4]
```

**效果**:
- 12 个并行任务
- E2E 测试时间: 20 分钟 → 5 分钟

## 执行时间目标

### 主 CI 流水线

| 任务 | 预期时间 | 并行度 |
|------|----------|--------|
| Lint | 3-5 分钟 | 2 (backend, frontend) |
| Test | 5-8 分钟 | 2 (backend, frontend) |
| Build | 4-6 分钟 | 2 (backend, frontend) |
| Verify Config | 1-2 分钟 | 1 |
| E2E | 5-8 分钟 | 12 (3 browsers × 4 shards) |
| Quality Gate | 2-3 分钟 | 1 |
| Performance Test | 3-5 分钟 | 2 (baseline, normal) |

**总目标**: < 15 分钟

### PR 检查流水线

| 任务 | 预期时间 | 并行度 |
|------|----------|--------|
| Lint | 3-5 分钟 | 2 |
| Test | 5-8 分钟 | 2 |
| Build | 4-6 分钟 | 2 |
| PR Summary | < 1 分钟 | 1 |

**总目标**: < 10 分钟

## 集成点

### 与 TASK-004 (E2E 测试) 集成

**集成方式**:
```yaml
- 使用 platform/e2e/ 目录中的测试文件
- 使用 Playwright 配置
- 支持多浏览器测试
- 分片执行提高效率
```

**测试文件**:
- `platform/e2e/tests/auth.spec.ts`
- `platform/e2e/tests/instance.spec.ts`
- `platform/e2e/tests/websocket.spec.ts`

### 与 TASK-005 (质量门禁) 集成

**集成方式**:
```yaml
- 运行 scripts/quality-gate.sh
- 使用相同的质量指标
- 生成质量报告
```

**质量指标**:
- ESLint 错误: 0
- TypeScript 错误: 0
- 测试覆盖率: ≥ 80%
- 安全漏洞: 0 high/critical

### 与 TASK-006 (性能测试) 集成

**集成方式**:
```yaml
- 运行 scripts/run-performance-test.sh
- 使用 platform/perf/ 目录中的测试文件
- 使用 k6 性能测试框架
```

**测试场景**:
- `platform/perf/scenarios/baseline.js`
- `platform/perf/scenarios/normal.js`

## 故障排查

### 常见问题

#### 1. Lint 失败

**症状**:
```
ESLint found X error(s)
```

**解决方案**:
```bash
# 本地运行 lint 检查
cd platform/backend && pnpm run lint
cd platform/frontend && pnpm run lint

# 自动修复
pnpm run lint:fix
```

#### 2. 测试失败

**症状**:
```
Test failed: X
```

**解决方案**:
```bash
# 本地运行测试
cd platform/backend && pnpm run test
cd platform/frontend && pnpm run test

# 查看覆盖率
pnpm run test:coverage

# 调试测试
pnpm run test --debug
```

#### 3. 构建失败

**症状**:
```
Build failed: X
```

**解决方案**:
```bash
# 本地构建
cd platform/backend && pnpm run build
cd platform/frontend && pnpm run build

# 检查 TypeScript 错误
pnpm exec tsc --noEmit
```

#### 4. 配置验证失败

**症状**:
```
Missing required variables: DB_HOST, DB_PORT
```

**解决方案**:
```bash
# 检查配置文件
cat platform/.env.production

# 运行配置验证脚本
./scripts/verify-config.sh
```

#### 5. E2E 测试失败

**症状**:
```
Playwright test failed: X
```

**解决方案**:
```bash
# 本地运行 E2E 测试
cd platform/e2e
pnpm install
pnpm exec playwright test

# 调试模式
pnpm exec playwright test --debug

# 查看 Playwright 报告
pnpm exec playwright show-report
```

#### 6. 性能测试失败

**症状**:
```
k6 test failed: X
```

**解决方案**:
```bash
# 本地运行性能测试
./scripts/run-performance-test.sh baseline

# 查看性能报告
cat platform/perf/results/baseline_summary.txt
```

### 调试技巧

#### 1. 启用详细日志

在 GitHub Actions 中添加调试步骤：
```yaml
- name: Debug info
  run: |
    echo "Node version: $(node --version)"
    echo "pnpm version: $(pnpm --version)"
    echo "Working directory: $(pwd)"
    ls -la
```

#### 2. 保留失败的任务

在 GitHub Actions 中设置：
```yaml
- name: Run tests
  run: pnpm run test
  continue-on-error: false
```

#### 3. 上传失败产物

```yaml
- name: Upload test results
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: test-results
    path: |
      platform/backend/coverage/
      platform/frontend/coverage/
```

#### 4. 使用 tmate 进行交互式调试

```yaml
- name: Setup tmate session
  if: failure()
  uses: mxschmitt/action-tmate@v3
  timeout-minutes: 30
```

## 监控和报告

### GitHub Actions Summary

每次 CI 运行都会生成摘要报告，包含：
- 任务状态（成功/失败）
- 质量指标
- 测试覆盖率
- 性能指标

### Artifacts

**可下载的产物**:
- 覆盖率报告（7 天保留）
- 构建产物（7 天保留）
- Playwright 报告（7 天保留）
- 性能测试结果（7 天保留）

### 通知

**自动通知**:
- Pull Request 状态检查
- Commit 状态检查
- 失败时的邮件通知

## 最佳实践

### 1. 提交前检查

在推送代码前运行：
```bash
# 运行所有检查
./scripts/quality-gate.sh

# 或单独运行
pnpm run lint
pnpm run test:coverage
pnpm run build
```

### 2. 分支策略

- `main`: 生产环境，需要所有 CI 通过
- `develop`: 开发环境，需要所有 CI 通过
- `feature/*`: 功能分支，需要 PR 检查通过

### 3. PR 工作流

1. 创建功能分支
2. 提交代码
3. 创建 PR 到 `develop`
4. 等待 PR 检查通过
5. 代码审查
6. 合并到 `develop`
7. 等待主 CI 流水线通过

### 4. 失败处理

如果 CI 失败：
1. 查看失败的任务日志
2. 本地复现问题
3. 修复问题
4. 推送修复
5. 验证 CI 通过

### 5. 性能优化

- 保持依赖更新
- 使用缓存减少安装时间
- 并行执行独立任务
- 优化测试执行时间

## 配置文件

### CI 配置文件

- `.github/workflows/ci.yml` - 主 CI 流水线
- `.github/workflows/pr-check.yml` - PR 检查流水线

### 支持脚本

- `scripts/quality-gate.sh` - 质量门禁脚本
- `scripts/verify-config.sh` - 配置验证脚本
- `scripts/run-performance-test.sh` - 性能测试脚本

### 测试配置

- `platform/e2e/playwright.config.ts` - E2E 测试配置
- `platform/perf/k6.config.js` - 性能测试配置

## 版本历史

### v1.0.0 (2026-03-18)

**初始版本**:
- 6 个核心 CI 任务
- PR 检查流水线
- 完整的文档和故障排查指南

**特性**:
- 并行执行优化
- 多级缓存策略
- 完整的质量门禁
- E2E 和性能测试集成

## 相关文档

- [TASK-004 E2E 测试框架](../tasks/TASK-004-e2e-testing.md)
- [TASK-005 质量门禁](../tasks/TASK-005-quality-gate.md)
- [TASK-006 性能测试](../tasks/TASK-006-performance-testing.md)
- [TASK-009 CI 流水线](../tasks/TASK-009-ci-pipeline.md)

## 联系方式

如有问题或建议，请联系 DevOps 团队或创建 Issue。
