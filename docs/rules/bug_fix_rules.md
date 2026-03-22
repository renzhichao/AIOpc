# Bug修复流程规范 (Bug Fix Process Rules)

本文档定义了AIOpc项目中Bug修复的标准化流程和规范要求，确保所有Bug修复遵循一致的高质量标准。

## 1. Agent使用规范 (Agent Usage Rules)

### 1.1 独立Sub Agent要求
**规则**: 每个Bug修复必须使用独立的Sub Agent进行处理。

**实施方式**:
```bash
# 为每个Bug创建独立的agent会话
/sc:task "Fix Bug #[issue_number]: [brief_description]"
```

**原因**:
- 确保Bug修复上下文隔离，避免不同Bug的解决方案相互干扰
- 便于跟踪每个Bug的修复进度和状态
- 支持并行处理多个Bug

**例外**: 只有在确认多个Bug高度相关且需要联合修复时，才可以在一个agent中处理。

## 2. DevOps规范 (DevOps Rules)

### 2.1 部署方式要求
**规则**: 所有代码更改必须通过GitHub Actions CI/CD流水线部署，严禁手工部署。

**部署流程**:
```bash
# 1. 提交代码到git
git add <changed_files>
git commit -m "fix(bug #[issue_number]): <description>"

# 2. 推送到远程分支
git push origin <branch>

# 3. 触发GitHub Actions部署
gh workflow run deploy-tenant.yml -f tenant=<TENANT> -f component=<component>
```

**禁止操作**:
- ❌ SSH到服务器手工修改代码或配置
- ❌ 直接在服务器上拉取代码并重启服务
- ❌ 使用docker compose命令手工部署容器
- ❌ 修改运行中的容器配置

**CI/CD流水线**:
- `.github/workflows/deploy-tenant.yml`: 租户部署流水线
- 部署前会进行配置验证和安全检查
- 部署过程有完整的日志记录和回滚机制

### 2.2 部署验证要求
每次部署后必须验证：
```bash
# 1. 检查部署状态
gh run view <run_id>

# 2. 验证服务健康状态
curl http://<tenant_url>/health

# 3. 检查容器状态
ssh -i <ssh_key> <user>@<host> "docker ps | grep opclaw"

# 4. 检查应用日志
ssh -i <ssh_key> <user>@<host> "docker logs opclaw-backend --tail 50"
```

## 3. 架构保护规范 (Architecture Protection Rules)

### 3.1 网络架构保护
**规则**: 修改配置信息时，不能破坏现有网络架构。

**关键约束**:
1. **CIIBER租户网络架构**:
   - 公网只暴露端口: 20180 (nginx反向代理)
   - 内网端口映射: 20180 → nginx:80 → backend:3000
   - 后端端口3000不直接暴露到公网

2. **OmniTech租户网络架构**:
   - 直接暴露端口: 3000 (后端API)
   - 前端通过API网关访问后端

**配置修改前检查清单**:
```bash
# 1. 查看当前nginx配置
ssh -i <ssh_key> <user>@<host> "cat /opt/opclaw/platform/nginx.conf"

# 2. 查看当前docker-compose端口映射
ssh -i <ssh_key> <user>@<host> "cd /opt/opclaw/platform && cat docker-compose.yml | grep -A 5 'ports:'"

# 3. 查看租户配置文件
cat config/tenants/<TENANT>.yml
```

**不确定时**: 必须与用户确认网络架构详情后再进行修改。

### 3.2 应用架构保护
**规则**: 修改不能破坏应用架构和现有功能。

**应用架构参考来源**:
- 代码库: `platform/backend/src/`, `platform/frontend/src/`
- 配置文件: `config/tenants/*.yml`
- 文档: `docs/`, `claudedocs/`
- 部署脚本: `scripts/deploy/`

**修改前分析**:
1. 阅读相关代码文件，理解现有实现
2. 检查依赖关系，评估修改影响范围
3. 确认修改不会引入新的安全风险
4. 验证修改向后兼容

## 4. 测试与验证规范 (Testing and Verification Rules)

### 4.1 TDD (测试驱动开发) 要求
**规则**: 修改内容必须有测试用例覆盖，遵循Ralph Loop (Think → Implement → Verify)。

**Ralph Loop流程**:

#### Phase 1: Think (思考阶段)
```bash
# 1. 分析Bug根本原因
# 2. 理解现有代码逻辑
# 3. 设计修复方案
# 4. 评估影响范围

# 输出: 修复计划文档
```

#### Phase 2: Implement (实施阶段)
```bash
# 1. 编写测试用例 (先写测试!)
# 2. 实施代码修复
# 3. 本地验证测试通过

# 测试类型:
- 单元测试: platform/backend/tests/unit/
- 集成测试: platform/backend/tests/integration/
- E2E测试: platform/backend/tests/e2e/
```

#### Phase 3: Verify (验证阶段)
```bash
# 1. 通过CI/CD流水线部署
# 2. 在测试环境验证修复
# 3. 确认没有引入新的问题
# 4. 用户验收测试
```

### 4.2 测试用例要求
**必须包含的测试**:
1. **Bug复现测试**: 验证Bug确实存在
2. **修复验证测试**: 验证修复后Bug不再出现
3. **回归测试**: 确保没有破坏现有功能
4. **边界测试**: 测试边界条件和异常情况

**测试用例示例**:
```typescript
// Bug复现测试
describe('Bug #[issue_number] - Description', () => {
  it('should reproduce the bug', async () => {
    const response = await callAPI();
    expect(response.error).toBe('expected_error');
  });

  it('should fix the bug', async () => {
    const response = await callAPI();
    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();
  });

  it('should not break existing functionality', async () => {
    const response = await callLegacyAPI();
    expect(response).toMatchObject(expectedLegacyBehavior);
  });
});
```

## 5. 修复报告要求 (Bug Fix Report Requirements)

### 5.1 GitHub Issue跟踪
**规则**: 每个Bug修复必须创建对应的GitHub Issue进行跟踪。

**Issue创建流程**:
```bash
# 在Bug修复Agent中创建GitHub Issue
gh issue create \
  --title "Bug: [brief_description]" \
  --body "Bug描述、复现步骤、期望行为、环境信息" \
  --label "bug,needs-verification"
```

**Issue模板**:
```markdown
## Bug描述
[清晰的Bug描述]

## 复现步骤
1. 步骤一
2. 步骤二
3. 步骤三

## 期望行为
[期望的正确行为]

## 实际行为
[实际观察到的错误行为]

## 环境信息
- 租户: [CIIBER/OmniTech/etc]
- 部署日期: [YYYY-MM-DD]
- 相关日志: [错误日志]

## 优先级
- [ ] P0 - Critical (生产环境阻塞)
- [ ] P1 - High (影响核心功能)
- [ ] P2 - Medium (影响次要功能)
- [ ] P3 - Low (UI/小问题)
```

### 5.2 修复报告要求
**规则**: Bug修复完成后，必须在`docs/bugfix/`目录提交修复报告。

**报告命名规则**:
```
BugFixReport_#issueid.md

示例:
BugFixReport_#23.md
BugFixReport_#156.md
```

**报告模板**:
```markdown
# Bug修复报告 - Issue #<issue_id>

## Bug信息
- **Issue ID**: #<issue_id>
- **Bug标题**: [brief description]
- **优先级**: P0/P1/P2/P3
- **影响租户**: [CIIBER/OmniTech/etc]
- **修复日期**: YYYY-MM-DD

## 问题描述

### Bug现象
[描述用户观察到的错误现象]

### 复现步骤
1. [步骤一]
2. [步骤二]
3. [步骤三]

### 错误日志/截图
\```
[相关错误日志]
\```

## 根本原因分析

### 问题定位
[详细分析问题的根本原因]

### 相关代码
- 文件: `path/to/file.ts`
- 函数: `functionName()`
- 行号: 123-456

### 为什么会出现这个问题
[解释根本原因]

## 修复方案

### 修复思路
[描述修复方案的思路]

### 代码修改

#### 修改文件1: `path/to/file1.ts`
\`\`\`typescript
// 修改前
old_code

// 修改后
new_code
\`\`\`

#### 修改文件2: `path/to/file2.ts`
[类似格式]

### 测试用例

#### 单元测试
\`\`\`typescript
describe('Bug #<issue_id>', () => {
  it('should fix the bug', async () => {
    // 测试代码
  });
});
\`\`\`

#### 集成测试
[测试场景描述]

## 验证结果

### 本地验证
- [ ] 测试用例通过
- [ ] 代码审查通过
- [ ] 无新的警告或错误

### CI/CD部署验证
- **部署流水线**: [GitHub Actions run link]
- **部署状态**: ✅ 成功 / ❌ 失败
- **部署时间**: YYYY-MM-DD HH:MM:SS

### 生产环境验证
- **租户**: [CIIBER/OmniTech/etc]
- **验证URL**: [http://tenant-url]
- **验证结果**:
  - [ ] Bug已修复
  - [ ] 功能正常
  - [ ] 无副作用

### 回归测试
[确认没有破坏现有功能]

## Git提交

### 提交记录
- **Commit 1**: `fix(component): description` (hash: abc123)
- **Commit 2**: `test(component): add test cases` (hash: def456)

### Pull Request
- **PR Link**: [GitHub PR link]
- **Merge Date**: YYYY-MM-DD
- **Merge Commit**: hash: xyz789

## 经验总结

### 问题本质
[总结这个问题的本质]

### 解决方案亮点
[描述解决方案的创新点或亮点]

### 经验教训
[可以从中学到的经验]
1. [教训一]
2. [教训二]

### 预防措施
[如何防止类似问题再次发生]

## 相关文档

- **架构文档**: [相关架构文档链接]
- **API文档**: [相关API文档链接]
- **相关Bug**: [相关Issue链接]

## 签名
- **修复人员**: [Agent名称]
- **审查人员**: [Reviewer名称]
- **验证人员**: [Tester名称]
- **完成日期**: YYYY-MM-DD
```

## 6. 优先级处理规范 (Priority Handling Rules)

### 6.1 优先级定义
| 优先级 | 描述 | 响应时间 | 修复时间 |
|--------|------|----------|----------|
| P0 - Critical | 生产环境完全阻塞 | 立即 | 4小时内 |
| P1 - High | 核心功能受影响 | 2小时内 | 24小时内 |
| P2 - Medium | 次要功能受影响 | 1天内 | 3天内 |
| P3 - Low | UI/小问题 | 3天内 | 1周内 |

### 6.2 升级机制
- P0/P1 Bug需要立即通知项目owner
- 超时未修复需要升级到更高优先级
- 修复失败需要回滚并重新分析

## 7. 代码审查规范 (Code Review Rules)

### 7.1 审查要求
- 所有Bug修复必须经过代码审查
- 至少一名审查人员批准才能合并
- 审查重点：
  1. 修复方案的正确性
  2. 代码质量
  3. 测试覆盖度
  4. 文档完整性

### 7.2 审查清单
```markdown
## 代码审查清单

### 修复方案
- [ ] 修复方案正确解决了问题
- [ ] 没有引入新的问题
- [ ] 考虑了边界情况

### 代码质量
- [ ] 代码符合项目规范
- [ ] 变量命名清晰
- [ ] 逻辑简洁易懂
- [ ] 有适当的注释

### 测试覆盖
- [ ] 有充分的测试用例
- [ ] 测试覆盖了正常和异常情况
- [ ] 测试用例可以复现Bug

### 文档完整性
- [ ] 有Bug修复报告
- [ ] 报告内容完整
- [ ] 有经验总结

### DevOps规范
- [ ] 遵循DevOps规范
- [ ] 通过CI/CD部署
- [ ] 不破坏网络架构
- [ ] 不破坏应用架构
```

## 8. 附录

### 8.1 常用命令速查
```bash
# Git操作
git status
git add <files>
git commit -m "fix(bug #[issue]): description"
git push origin <branch>

# GitHub操作
gh issue create --title "Bug: ..." --body "..."
gh pr create --title "Fix bug #[issue]" --body "..."
gh workflow run deploy-tenant.yml -f tenant=<TENANT>

# SSH验证
ssh -i <ssh_key> <user>@<host> "docker ps"
ssh -i <ssh_key> <user>@<host> "docker logs <container>"

# 测试验证
npm test
npm run test:e2e
npm run test:coverage
```

### 8.2 相关文档
- 项目架构文档: `docs/`
- DevOps规范: `.github/workflows/`
- 部署脚本: `scripts/deploy/`
- CIIBER网络架构: `docs/CIIBER_NETWORK_ARCHITECTURE.md`

### 8.3 模板文件
- Bug修复报告模板: 见第5.2节
- GitHub Issue模板: 见第5.1节
- 代码审查清单: 见第7.2节

---

## 版本历史
- v1.0 (2026-03-22): 初始版本，基于CIIBER OAuth Bug修复经验总结

## 维护人员
- Claude Code AI Agent
- Project Owner: [待填写]

---

**重要提醒**:
1. 这些规则是强制性的，不是建议性的
2. 违反规则可能导致修复被拒绝或回滚
3. 规则会根据项目发展持续更新
4. 有疑问时，优先保守处理，与项目owner确认
