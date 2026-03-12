# AUTO_TASK_CONFIG: 任务自动执行配置规范

> **创建日期**: 2025-12-27
> **版本**: 1.0
> **适用工具**: Claude Code, Cursor Agent, GitHub Copilot Chat, 及其他 AI 编程助手

---

## 目录

1. [设计理念](#1-设计理念)
2. [任务执行生命周期](#2-任务执行生命周期)
3. [上下文隔离策略](#3-上下文隔离策略)
4. [任务状态机](#4-任务状态机)
5. [任务执行规则](#5-任务执行规则)
6. [TASK LIST 联动机制](#6-task-list-联动机制)
7. [执行器 Prompt 模板](#7-执行器-prompt-模板)
8. [工具适配指南](#8-工具适配指南)
9. [异常处理机制](#9-异常处理机制)

---

## 1. 设计理念

### 1.1 核心原则

```
┌─────────────────────────────────────────────────────────────────────┐
│                        任务自动执行核心原则                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🔒 上下文隔离 (Context Isolation)                                  │
│     ├── 每个任务启动时获得干净的上下文                                │
│     ├── 任务间零状态泄漏                                            │
│     └── 避免上下文累积导致的性能下降和幻觉                            │
│                                                                     │
│  🎯 单一职责 (Single Responsibility)                                │
│     ├── 每个任务只完成一个明确的目标                                  │
│     ├── 任务粒度可控，便于追踪和回滚                                  │
│     └── 任务完成标准明确（Acceptance Criteria）                      │
│                                                                     │
│  📝 状态持久化 (State Persistence)                                   │
│     ├── 任务状态记录在 TASK LIST 文档中                              │
│     ├── 每次状态变更立即持久化                                       │
│     └── 支持任务中断后恢复                                          │
│                                                                     │
│  🔄 可重复执行 (Idempotent Execution)                                │
│     ├── 同一任务可安全重复执行                                       │
│     ├── 前置检查确保执行条件满足                                     │
│     └── 失败任务可从断点恢复                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 适用场景

| 场景 | 说明 |
|------|------|
| 功能开发 | 按 TASK LIST 顺序实现功能模块 |
| Bug 修复 | 按优先级处理 Bug 列表 |
| 重构迁移 | 分步骤执行代码迁移任务 |
| 测试编写 | 批量生成单元测试 |

---

## 2. 任务执行生命周期

### 2.1 生命周期图

```
┌─────────────────────────────────────────────────────────────────────┐
│                         任务执行生命周期                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────┐                                                      │
│   │  PENDING │ ◄─────────────────────────────────────────┐          │
│   └────┬─────┘                                           │          │
│        │ [触发执行]                                      │          │
│        ▼                                                 │          │
│   ┌──────────┐     ┌──────────────────────────────┐      │          │
│   │ CONTEXT  │────►│ 1. 清理上下文                 │      │          │
│   │  INIT    │     │ 2. 加载任务配置               │      │          │
│   └────┬─────┘     │ 3. 读取 TASK LIST            │      │          │
│        │           │ 4. 验证前置依赖               │      │          │
│        │           └──────────────────────────────┘      │          │
│        ▼                                                 │          │
│   ┌──────────┐     ┌──────────────────────────────┐      │          │
│   │PRE_CHECK │────►│ 1. 检查前置任务状态           │      │          │
│   │          │     │ 2. 执行前置检查项             │      │          │
│   └────┬─────┘     │ 3. 验证执行环境               │      │ [失败]   │
│        │ [通过]    └──────────────────────────────┘      │          │
│        ▼                                                 │          │
│   ┌──────────┐     ┌──────────────────────────────┐      │          │
│   │IN_PROGRESS────►│ 1. 更新状态为 IN_PROGRESS    │      │          │
│   │          │     │ 2. 记录开始时间               │      │          │
│   └────┬─────┘     │ 3. 执行任务主体               │      │          │
│        │           └──────────────────────────────┘      │          │
│        ▼                                                 │          │
│   ┌──────────┐     ┌──────────────────────────────┐      │          │
│   │POST_CHECK│────►│ 1. 验证 Acceptance Criteria  │──────┘          │
│   │          │     │ 2. 运行测试用例               │                 │
│   └────┬─────┘     │ 3. 检查输出物                 │                 │
│        │ [通过]    └──────────────────────────────┘                 │
│        ▼                                                            │
│   ┌──────────┐     ┌──────────────────────────────┐                 │
│   │ COMMIT   │────►│ 1. Git add & commit          │                 │
│   │          │     │ 2. 记录 Commit ID            │                 │
│   └────┬─────┘     └──────────────────────────────┘                 │
│        │                                                            │
│        ▼                                                            │
│   ┌──────────┐     ┌──────────────────────────────┐                 │
│   │ UPDATE   │────►│ 1. 更新 TASK LIST 状态       │                 │
│   │ TASK_LIST│     │ 2. 填写完成时间               │                 │
│   └────┬─────┘     │ 3. 记录提交信息               │                 │
│        │           └──────────────────────────────┘                 │
│        ▼                                                            │
│   ┌──────────┐     ┌──────────────────────────────┐                 │
│   │ CONTEXT  │────►│ 1. 输出任务完成报告           │                 │
│   │ DESTROY  │     │ 2. 销毁当前上下文             │                 │
│   └────┬─────┘     │ 3. 触发下一任务（可选）       │                 │
│        │           └──────────────────────────────┘                 │
│        ▼                                                            │
│   ┌──────────┐                                                      │
│   │COMPLETED │                                                      │
│   └──────────┘                                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 阶段说明

| 阶段 | 英文名 | 说明 | 可中断 |
|------|--------|------|--------|
| 待执行 | PENDING | 任务尚未开始 | - |
| 上下文初始化 | CONTEXT_INIT | 清理旧上下文，加载任务配置 | 是 |
| 前置检查 | PRE_CHECK | 验证依赖和执行条件 | 是 |
| 执行中 | IN_PROGRESS | 执行任务主体逻辑 | 是 |
| 后置检查 | POST_CHECK | 验证 Acceptance Criteria | 是 |
| 提交 | COMMIT | Git 提交变更 | 否 |
| 更新文档 | UPDATE_TASK_LIST | 更新 TASK LIST 状态 | 否 |
| 销毁上下文 | CONTEXT_DESTROY | 清理并销毁当前上下文 | 否 |
| 已完成 | COMPLETED | 任务成功完成 | - |

---

## 3. 上下文隔离策略

### 3.1 上下文清理触发点

```yaml
# 上下文清理配置
context_cleanup:
  # 触发清理的时机
  triggers:
    - before_task_start      # 任务启动前（必须）
    - after_task_complete    # 任务完成后（必须）
    - on_task_failure        # 任务失败时（必须）
    - on_manual_abort        # 手动中止时（可选）

  # 清理动作
  actions:
    claude_code:
      - command: "/clear"
        description: "清理 Claude Code 对话上下文"
      - command: "/compact"
        description: "压缩上下文（可选，用于长任务）"

    cursor_agent:
      - action: "new_chat"
        description: "创建新的 Chat 会话"
      - action: "close_composer"
        description: "关闭当前 Composer"

    generic:
      - action: "start_new_session"
        description: "开始新的会话"
```

### 3.2 上下文隔离检查清单

每个任务启动时，执行以下检查：

```markdown
## 上下文隔离检查清单

### 启动前检查
- [ ] 当前会话是否为新会话/已清理
- [ ] 是否存在上一任务的残留状态
- [ ] TASK LIST 文档是否为最新版本
- [ ] 前置任务状态是否为 COMPLETED

### 执行期间隔离
- [ ] 不引用其他任务的中间产物（除非明确依赖）
- [ ] 不修改非本任务范围的文件
- [ ] 所有变更限定在任务描述范围内

### 完成后清理
- [ ] 所有变更已提交到 Git
- [ ] TASK LIST 已更新
- [ ] 无临时文件残留
- [ ] 上下文已销毁
```

### 3.3 跨任务数据传递

任务间不通过上下文传递数据，而是通过以下方式：

| 传递方式 | 说明 | 示例 |
|----------|------|------|
| 文件系统 | 通过文件传递数据 | 前一任务生成的 `config.py` |
| Git 仓库 | 通过 Git 提交传递 | 代码变更、配置文件 |
| TASK LIST | 通过文档传递状态 | 任务状态、Commit ID |
| 环境变量 | 通过环境变量传递 | `LAST_TASK_COMMIT_ID` |

---

## 4. 任务状态机

### 4.1 状态定义

```python
# 任务状态枚举
class TaskStatus:
    PENDING = "PENDING"           # 待执行
    IN_PROGRESS = "IN_PROGRESS"   # 执行中
    BLOCKED = "BLOCKED"           # 阻塞（依赖未满足）
    COMPLETED = "COMPLETED"       # 已完成
    FAILED = "FAILED"             # 执行失败
    CANCELLED = "CANCELLED"       # 已取消
```

### 4.2 状态转换规则

```
┌─────────────────────────────────────────────────────────────────────┐
│                           状态转换图                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│                         ┌───────────┐                               │
│              ┌─────────►│ CANCELLED │                               │
│              │          └───────────┘                               │
│              │ [用户取消]                                            │
│              │                                                      │
│         ┌────┴────┐    [依赖未满足]    ┌─────────┐                   │
│         │ PENDING │◄──────────────────│ BLOCKED │                   │
│         └────┬────┘                   └────▲────┘                   │
│              │                              │                       │
│              │ [开始执行]                   │ [依赖未完成]            │
│              │                              │                       │
│              ▼                              │                       │
│         ┌─────────────┐                     │                       │
│         │ IN_PROGRESS │─────────────────────┘                       │
│         └──────┬──────┘                                             │
│                │                                                    │
│        ┌───────┴───────┐                                            │
│        │               │                                            │
│        ▼               ▼                                            │
│   ┌─────────┐    ┌────────┐                                         │
│   │COMPLETED│    │ FAILED │                                         │
│   └─────────┘    └────┬───┘                                         │
│                       │                                             │
│                       │ [重试]                                      │
│                       ▼                                             │
│                  ┌─────────┐                                        │
│                  │ PENDING │                                        │
│                  └─────────┘                                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 状态转换矩阵

| 当前状态 | 可转换至 | 触发条件 |
|----------|----------|----------|
| PENDING | IN_PROGRESS | 前置依赖满足，开始执行 |
| PENDING | BLOCKED | 前置依赖未完成 |
| PENDING | CANCELLED | 用户取消 |
| IN_PROGRESS | COMPLETED | 任务成功完成，AC 验证通过 |
| IN_PROGRESS | FAILED | 执行失败或 AC 验证不通过 |
| IN_PROGRESS | CANCELLED | 用户中止 |
| BLOCKED | PENDING | 前置依赖完成 |
| BLOCKED | CANCELLED | 用户取消 |
| FAILED | PENDING | 用户请求重试 |
| FAILED | CANCELLED | 用户放弃 |

---

## 5. 任务执行规则

### 5.1 执行顺序规则

```yaml
# 任务执行顺序配置
execution_order:
  # 顺序策略
  strategy: "dependency_first"  # 依赖优先

  # 可选策略
  strategies:
    dependency_first:
      description: "优先执行所有前置依赖任务"
      rule: "任务 A 依赖任务 B，则 B 必须在 A 之前完成"

    phase_sequential:
      description: "按 Phase 顺序执行"
      rule: "同一 Phase 内的任务可并行，跨 Phase 必须顺序"

    priority_based:
      description: "按优先级执行"
      rule: "高优先级任务优先执行"

  # 并行执行配置（如果支持）
  parallel:
    enabled: false  # 默认禁用并行
    max_concurrent: 1  # 最大并发数
```

### 5.2 任务选择算法

```python
def get_next_task(task_list: List[Task]) -> Optional[Task]:
    """
    获取下一个可执行的任务

    选择规则：
    1. 状态为 PENDING
    2. 所有前置依赖状态为 COMPLETED
    3. 所有前置检查项通过
    4. 按任务 ID 顺序选择第一个满足条件的任务
    """
    for task in sorted(task_list, key=lambda t: t.id):
        if task.status != TaskStatus.PENDING:
            continue

        # 检查前置依赖
        dependencies_met = all(
            dep.status == TaskStatus.COMPLETED
            for dep in task.dependencies
        )

        if not dependencies_met:
            continue

        # 检查前置检查项
        prechecks_passed = all(
            check.verify()
            for check in task.prechecks
        )

        if not prechecks_passed:
            continue

        return task

    return None  # 无可执行任务
```

### 5.3 单任务执行流程

```markdown
## 单任务执行流程

### Step 1: 上下文初始化
1. 清理当前 AI 工具上下文
2. 读取 TASK LIST 文档
3. 定位目标任务
4. 加载任务详情

### Step 2: 前置检查
1. 验证前置依赖任务状态
2. 执行前置检查项
3. 验证执行环境（依赖、文件等）
4. 如不满足，标记为 BLOCKED 并退出

### Step 3: 执行任务
1. 更新任务状态为 IN_PROGRESS
2. 记录开始时间
3. 按任务描述执行开发工作
4. 生成代码/文档/配置

### Step 4: 验证结果
1. 逐项检查 Acceptance Criteria
2. 运行测试用例（如有）
3. 验证输出物存在且正确
4. 如不通过，标记为 FAILED 并记录原因

### Step 5: 提交变更
1. 执行 git add 添加变更文件
2. 生成符合规范的 commit message
3. 执行 git commit
4. 记录 Commit ID

### Step 6: 更新 TASK LIST
1. 更新任务状态为 COMPLETED
2. 填写完成时间
3. 记录 Commit ID 和改动摘要
4. 保存 TASK LIST 文档

### Step 7: 销毁上下文
1. 输出任务完成报告
2. 销毁当前上下文
3. 准备触发下一任务（如配置自动继续）
```

---

## 6. TASK LIST 联动机制

### 6.1 TASK LIST 更新规则

```yaml
# TASK LIST 更新配置
task_list_update:
  # 文档路径模式
  path_pattern: "docs/tasks/TASK_LIST_*.md"

  # 更新时机
  update_triggers:
    - on_status_change      # 状态变更时
    - on_task_start         # 任务开始时
    - on_task_complete      # 任务完成时
    - on_task_failure       # 任务失败时

  # 需要更新的字段
  fields_to_update:
    on_task_start:
      - status: "IN_PROGRESS"
      - start_time: "当前时间"

    on_task_complete:
      - status: "COMPLETED"
      - end_time: "当前时间"
      - commit_id: "Git Commit SHA"
      - commit_summary: "改动摘要"
      - acceptance_criteria: "逐项标记完成"

    on_task_failure:
      - status: "FAILED"
      - failure_reason: "失败原因"
```

### 6.2 TASK LIST 更新模板

任务开始时更新：
```markdown
| **任务状态** | `IN_PROGRESS` |
| **任务开始时间** | 2025-12-27 10:30:00 |
```

任务完成时更新：
```markdown
| **任务状态** | `COMPLETED` |
| **任务完成时间** | 2025-12-27 11:45:00 |
| **任务提交记录** | Commit ID: `abc1234` <br> 改动内容: 新增 pyproject.toml，配置 Poetry 依赖管理 |

**Acceptance Criteria**:

| 类型 | 检查项 |
|------|--------|
| 检查项 | <ul><li>[x] pyproject.toml 位于项目根目录</li><li>[x] 包含正确的项目元数据</li><li>[x] 依赖声明完整</li></ul> |
```

### 6.3 自动化更新脚本接口

```python
# 任务状态更新接口（概念设计）
class TaskListUpdater:
    """TASK LIST 文档更新器"""

    def __init__(self, task_list_path: str):
        self.path = task_list_path

    def start_task(self, task_id: str) -> None:
        """标记任务开始"""
        self._update_field(task_id, "status", "IN_PROGRESS")
        self._update_field(task_id, "start_time", self._get_current_time())

    def complete_task(
        self,
        task_id: str,
        commit_id: str,
        commit_summary: str
    ) -> None:
        """标记任务完成"""
        self._update_field(task_id, "status", "COMPLETED")
        self._update_field(task_id, "end_time", self._get_current_time())
        self._update_field(task_id, "commit_id", commit_id)
        self._update_field(task_id, "commit_summary", commit_summary)

    def fail_task(self, task_id: str, reason: str) -> None:
        """标记任务失败"""
        self._update_field(task_id, "status", "FAILED")
        self._update_field(task_id, "failure_reason", reason)

    def get_next_pending_task(self) -> Optional[str]:
        """获取下一个待执行任务 ID"""
        # 实现任务选择逻辑
        pass
```

---

## 7. 执行器 Prompt 模板

### 7.1 任务启动 Prompt

```markdown
# 任务执行指令

## 执行上下文
- **TASK LIST 路径**: docs/tasks/TASK_LIST_003_poetry_jinja2.md
- **目标任务 ID**: TASK-001
- **执行模式**: 单任务独占执行

## 执行步骤

### Step 1: 读取任务详情
请读取 TASK LIST 文档，定位 TASK-001，获取以下信息：
- 任务描述
- 前置依赖
- 前置检查项
- 参考文档
- Acceptance Criteria

### Step 2: 前置检查
验证以下条件：
1. 所有前置依赖任务状态为 COMPLETED
2. 所有前置检查项通过
3. 执行环境满足要求

如不满足，输出原因并停止执行。

### Step 3: 执行任务
1. 更新 TASK LIST 中该任务状态为 `IN_PROGRESS`
2. 记录开始时间
3. 按任务描述完成开发工作
4. 确保所有 Acceptance Criteria 满足

### Step 4: 提交变更
1. 使用 `git add` 添加变更文件
2. 使用以下格式提交：
   ```
   feat(TASK-001): <简短描述>

   - <改动点1>
   - <改动点2>

   Task: TASK-001
   ```
3. 记录 Commit ID

### Step 5: 更新 TASK LIST
1. 更新任务状态为 `COMPLETED`
2. 填写完成时间
3. 记录 Commit ID 和改动摘要
4. 标记 Acceptance Criteria 各项为已完成

### Step 6: 输出完成报告
输出以下格式的完成报告：

```
## 任务完成报告

- **任务 ID**: TASK-001
- **状态**: COMPLETED
- **开始时间**: <时间>
- **完成时间**: <时间>
- **Commit ID**: <SHA>
- **改动文件**:
  - <文件1>
  - <文件2>
- **下一个任务**: TASK-002
```

## 重要约束
1. 只完成指定任务，不要执行其他任务
2. 完成后立即停止，不要自动开始下一任务
3. 如遇问题无法继续，更新状态为 FAILED 并说明原因
```

### 7.2 任务链执行 Prompt（可选）

```markdown
# 任务链执行指令

## 执行上下文
- **TASK LIST 路径**: docs/tasks/TASK_LIST_003_poetry_jinja2.md
- **起始任务 ID**: TASK-001
- **结束任务 ID**: TASK-005（可选，不填则执行到最后）
- **执行模式**: 任务链顺序执行

## 执行规则
1. 从起始任务开始，按依赖顺序执行
2. 每个任务完成后：
   - 更新 TASK LIST
   - 提交 Git 变更
   - 清理上下文（开始新会话）
   - 继续下一任务
3. 遇到以下情况停止：
   - 到达结束任务
   - 任务执行失败
   - 无更多待执行任务

## 上下文管理
- 每个任务启动前：发送 `/clear` 清理上下文
- 每个任务完成后：输出完成报告并销毁上下文
```

### 7.3 任务恢复 Prompt

```markdown
# 任务恢复指令

## 执行上下文
- **TASK LIST 路径**: docs/tasks/TASK_LIST_003_poetry_jinja2.md
- **恢复任务 ID**: TASK-003
- **执行模式**: 从中断点恢复

## 恢复步骤

### Step 1: 读取当前状态
1. 读取 TASK LIST 获取 TASK-003 当前状态
2. 检查是否为 IN_PROGRESS 或 FAILED
3. 分析已完成的工作和待完成的工作

### Step 2: 评估恢复策略
- 如果是 IN_PROGRESS：检查部分完成的工作，继续执行
- 如果是 FAILED：分析失败原因，决定是否重试

### Step 3: 继续执行
1. 从断点继续执行任务
2. 完成剩余 Acceptance Criteria
3. 按正常流程提交和更新文档
```

---

## 8. 工具适配指南

### 8.1 Claude Code 适配

```yaml
claude_code:
  # 上下文清理
  context_cleanup:
    command: "/clear"
    alternative: "/compact"  # 用于保留部分上下文

  # 任务启动
  task_start:
    steps:
      - "执行 /clear 清理上下文"
      - "粘贴任务启动 Prompt"
      - "等待任务完成"

  # 任务结束
  task_end:
    steps:
      - "确认 TASK LIST 已更新"
      - "确认 Git 已提交"
      - "关闭当前会话或执行 /clear"

  # 特殊命令
  commands:
    - "/clear": "清理所有上下文"
    - "/compact": "压缩上下文"
    - "Cmd+K": "清理当前输入"
```

### 8.2 Cursor Agent 适配

```yaml
cursor_agent:
  # 上下文清理
  context_cleanup:
    action: "创建新的 Composer 会话"
    shortcut: "Cmd+I (新建 Composer)"

  # 任务启动
  task_start:
    steps:
      - "关闭当前 Composer（如有）"
      - "Cmd+I 创建新 Composer"
      - "粘贴任务启动 Prompt"
      - "执行 Agent 模式"

  # 任务结束
  task_end:
    steps:
      - "确认变更已保存"
      - "确认 TASK LIST 已更新"
      - "关闭当前 Composer"

  # 模式选择
  modes:
    composer_agent: "用于复杂多文件任务"
    inline_chat: "用于简单修改"
```

### 8.3 通用适配（其他工具）

```yaml
generic:
  # 上下文清理
  context_cleanup:
    action: "开始新的会话/对话"
    description: "关闭当前会话，开启新会话以确保上下文干净"

  # 任务启动
  task_start:
    steps:
      - "确保在新会话中"
      - "提供完整的任务上下文（TASK LIST 路径、任务 ID）"
      - "粘贴任务启动 Prompt"

  # 任务结束
  task_end:
    steps:
      - "验证所有变更"
      - "更新 TASK LIST"
      - "关闭当前会话"
```

---

## 9. 异常处理机制

### 9.1 异常类型和处理策略

| 异常类型 | 描述 | 处理策略 |
|----------|------|----------|
| 前置依赖未满足 | 依赖任务未完成 | 标记为 BLOCKED，等待依赖完成 |
| 前置检查失败 | 环境/配置不满足 | 输出具体原因，等待人工介入 |
| 执行中断 | AI 会话超时/断开 | 保持 IN_PROGRESS，支持恢复 |
| AC 验证失败 | 输出不满足要求 | 标记为 FAILED，记录失败原因 |
| Git 提交失败 | 提交冲突或权限问题 | 暂停，等待人工解决 |
| TASK LIST 更新失败 | 文件锁定或格式错误 | 重试或人工更新 |

### 9.2 失败任务处理流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                        失败任务处理流程                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ┌──────────┐                                                      │
│   │  FAILED  │                                                      │
│   └────┬─────┘                                                      │
│        │                                                            │
│        ▼                                                            │
│   ┌─────────────┐                                                   │
│   │ 分析失败原因 │                                                   │
│   └──────┬──────┘                                                   │
│          │                                                          │
│   ┌──────┴──────┬──────────────┬──────────────┐                     │
│   │             │              │              │                     │
│   ▼             ▼              ▼              ▼                     │
│ ┌─────┐    ┌────────┐    ┌─────────┐    ┌──────────┐               │
│ │可重试│    │需修复  │    │需人工介入│    │应取消    │               │
│ └──┬──┘    └───┬────┘    └────┬────┘    └────┬─────┘               │
│    │           │              │              │                      │
│    ▼           ▼              ▼              ▼                      │
│ ┌─────┐    ┌────────┐    ┌─────────┐    ┌──────────┐               │
│ │重置为│    │修复问题│    │通知用户 │    │标记为    │               │
│ │PENDING   │后重试  │    │等待处理 │    │CANCELLED │               │
│ └─────┘    └────────┘    └─────────┘    └──────────┘               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.3 任务恢复检查清单

```markdown
## 任务恢复检查清单

### 恢复前检查
- [ ] 确认任务当前状态（IN_PROGRESS 或 FAILED）
- [ ] 检查 Git 工作目录状态
- [ ] 检查部分完成的文件/代码
- [ ] 确认 TASK LIST 记录的进度

### 恢复决策
- [ ] 是否需要回滚部分变更
- [ ] 是否可以从断点继续
- [ ] 是否需要重新开始整个任务

### 恢复执行
- [ ] 清理上下文
- [ ] 加载恢复 Prompt
- [ ] 继续/重新执行任务
- [ ] 完成后正常更新状态
```

---

## 附录

### A. 快速参考卡片

```
┌─────────────────────────────────────────────────────────────────────┐
│                    任务自动执行快速参考                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  📋 启动任务                                                         │
│     1. 清理上下文 (Claude: /clear, Cursor: 新建 Composer)           │
│     2. 读取 TASK LIST                                               │
│     3. 定位目标任务                                                  │
│     4. 执行任务启动 Prompt                                           │
│                                                                     │
│  ✅ 完成任务                                                         │
│     1. 验证 Acceptance Criteria                                     │
│     2. Git commit 变更                                              │
│     3. 更新 TASK LIST 状态                                          │
│     4. 销毁上下文                                                    │
│                                                                     │
│  ❌ 任务失败                                                         │
│     1. 更新状态为 FAILED                                            │
│     2. 记录失败原因                                                  │
│     3. 分析是否可重试                                                │
│     4. 销毁上下文                                                    │
│                                                                     │
│  🔄 恢复任务                                                         │
│     1. 检查当前状态                                                  │
│     2. 分析已完成工作                                                │
│     3. 使用恢复 Prompt                                               │
│     4. 从断点继续                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### B. Commit Message 规范

```
<type>(<task-id>): <简短描述>

<详细说明（可选）>

Task: <TASK-ID>
```

**Type 类型**:
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `test`: 测试相关
- `refactor`: 重构
- `chore`: 构建/工具相关

**示例**:
```
feat(TASK-001): 创建 pyproject.toml 配置 Poetry 依赖管理

- 配置项目元数据（name、version、description）
- 声明运行时依赖（PyPDFForm、Jinja2、python-dateutil）
- 声明开发依赖（pytest、black、mypy、ruff）
- 配置 CLI 入口点 howden-fill

Task: TASK-001
```

---

## 变更记录

| 版本 | 日期 | 变更说明 |
|------|------|----------|
| 1.0 | 2025-12-27 | 初始版本 |

---

> 📌 **注意**: 本配置文件定义了任务自动执行的标准流程，具体实现需根据所使用的 AI 编程工具进行适配。
