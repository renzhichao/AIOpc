#!/bin/bash

# Verification Script for TASK-007: Incident Response Documentation
# This script checks all acceptance criteria for the incident response documentation

set -e

echo "================================"
echo "TASK-007 Verification Script"
echo "Incident Response Documentation"
echo "================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counter for results
PASSED=0
FAILED=0
WARNINGS=0

# Function to print section header
print_section() {
    echo ""
    echo "================================"
    echo "$1"
    echo "================================"
}

# Function to check item
check_item() {
    local description=$1
    local check_command=$2
    local critical=${3:-true}

    echo -n "Checking: $description ... "

    if eval "$check_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
        return 0
    else
        if [ "$critical" = "true" ]; then
            echo -e "${RED}✗ FAILED${NC}"
            ((FAILED++))
        else
            echo -e "${YELLOW}⚠ WARNING${NC}"
            ((WARNINGS++))
        fi
        return 1
    fi
}

# Function to check content in file
check_content() {
    local file=$1
    local pattern=$2
    local description=$3

    echo -n "Checking: $description ... "

    if grep -q "$pattern" "$file" 2>/dev/null; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((FAILED++))
        return 1
    fi
}

print_section "1. Incident Severity Definition (3 items)"

echo "1.1 Checking P0/P1/P2 level definitions..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "P0 - 严重" "P0 level defined"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "P1 - 高" "P1 level defined"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "P2 - 中" "P2 level defined"

echo ""
echo "1.2 Checking examples for each level..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "所有用户无法访问服务" "P0 examples exist"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "性能严重下降" "P1 examples exist"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "非核心功能不可用" "P2 examples exist"

echo ""
echo "1.3 Checking response time requirements..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "15 分钟内响应" "P0 response time defined"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "1 小时内响应" "P1 response time defined"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "24 小时内处理" "P2 response time defined"

print_section "2. Response Process (3 items)"

echo "2.1 Checking 5-step response process..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "步骤 1: 检测" "Step 1: Detection defined"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "步骤 2: 分诊" "Step 2: Triage defined"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "步骤 3: 响应" "Step 3: Response defined"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "步骤 4: 解决" "Step 4: Resolution defined"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "步骤 5: 复盘" "Step 5: Post-Incident defined"

echo ""
echo "2.2 Checking flow diagram..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "mermaid" "Flow diagram created"

echo ""
echo "2.3 Checking operation guides for each step..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "检测确认清单" "Step 1 checklist exists"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "分诊确认清单" "Step 2 checklist exists"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "响应确认清单" "Step 3 checklist exists"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "解决确认清单" "Step 4 checklist exists"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "复盘确认清单" "Step 5 checklist exists"

print_section "3. Communication Mechanism (3 items)"

echo "3.1 Checking DingTalk #incidents group..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "#incidents 钉钉群" "DingTalk group mentioned"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/ONCALL.md" "#incidents 群" "DingTalk group defined in ONCALL.md"

echo ""
echo "3.2 Checking communication templates..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "初始事故通知" "Initial announcement template"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "进展更新" "Progress update template"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "解决通知" "Resolution announcement template"

echo ""
echo "3.3 Checking status page mechanism..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "状态页面" "Status page mechanism"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "P0 持续 > 15 分钟" "P0 > 15min criteria"

print_section "4. Incident Documentation (3 items)"

echo "4.1 Checking INCIDENT_RESPONSE.md exists..."
check_item "INCIDENT_RESPONSE.md exists" "test -f /Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md"

echo ""
echo "4.2 Checking complete incident response process..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "事故响应概述" "Overview section exists"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "事故等级定义" "Severity levels section exists"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "5步响应流程" "5-step process section exists"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "沟通机制" "Communication section exists"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "事故处理指南" "Handling guide section exists"

echo ""
echo "4.3 Checking incident handling guide..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "常见事故场景处理" "Common scenarios section exists"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "场景 1: 服务完全不可用" "Scenario 1: Service down"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "场景 2: 数据库连接失败" "Scenario 2: Database issues"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "场景 3: 性能严重下降" "Scenario 3: Performance"

print_section "5. Postmortem Template (3 items)"

echo "5.1 Checking POSTMORTEM_TEMPLATE.md exists..."
check_item "POSTMORTEM_TEMPLATE.md exists" "test -f /Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md"

echo ""
echo "5.2 Checking incident report template..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md" "执行摘要" "Executive summary section"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md" "影响分析" "Impact analysis section"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md" "时间线" "Timeline section"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md" "根本原因分析" "Root cause analysis section"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md" "解决方案" "Resolution section"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md" "改进行动项" "Action items section"

echo ""
echo "5.3 Checking root cause analysis framework (5 Whys)..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md" "5 Whys 分析" "5 Whys framework"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md" "Why 1" "Why 1 placeholder"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md" "Why 2" "Why 2 placeholder"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md" "Why 3" "Why 3 placeholder"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md" "Why 4" "Why 4 placeholder"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md" "Why 5" "Why 5 placeholder"

print_section "6. Team Training (3 items)"

echo "6.1 Checking team training materials..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "团队培训" "Team training section exists"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "培训目标" "Training objectives defined"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "培训内容" "Training content defined"

echo ""
echo "6.2 Checking how to report incidents..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "如何报告事故" "How to report incidents"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "#incidents 群发送初始通知" "Where to report"

echo ""
echo "6.3 Checking incident response process training..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "培训认证" "Training certification process"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "认证流程" "Certification process"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "事故响应培训检查清单" "Training checklist"

print_section "7. Additional Quality Checks"

echo "7.1 Checking alignment with TASK-003 (On-call)..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/ONCALL.md" "事故响应流程" "ONCALL.md references incident response"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "ONCALL.md" "INCIDENT_RESPONSE.md references ONCALL.md"

echo ""
echo "7.2 Checking documentation quality..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "目录" "Table of contents exists"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "## " "Section headers used"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md" "目录" "Template has TOC"

echo ""
echo "7.3 Checking terminology consistency..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "MTTR" "MTTR terminology used"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "MTTD" "MTTD terminology used"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/ONCALL.md" "MTTR" "Consistent with ONCALL.md"

echo ""
echo "7.4 checking actionable content..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "```bash" "Code blocks for commands"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "- \[ \]" "Checklist items"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md" "- \[ \]" "Template has checklists"

echo ""
echo "7.5 Checking professional documentation quality..."
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "文档版本" "Document version"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "维护者" "Document maintainer"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md" "最后更新" "Last updated date"
check_content "/Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md" "模板版本" "Template version"

print_section "Summary"

TOTAL=$((PASSED + FAILED + WARNINGS))

echo "Total Checks: $TOTAL"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All critical acceptance criteria met!${NC}"
    echo ""
    echo "TASK-007 Status: READY FOR REVIEW"
    echo ""
    echo "Next Steps:"
    echo "1. Review the documentation in:"
    echo "   - /Users/arthurren/projects/AIOpc/docs/operations/INCIDENT_RESPONSE.md"
    echo "   - /Users/arthurren/projects/AIOpc/docs/operations/POSTMORTEM_TEMPLATE.md"
    echo "2. Create DingTalk #incidents group (if not exists)"
    echo "3. Schedule team training session"
    echo "4. Update training checklist after training completion"
    exit 0
else
    echo -e "${RED}✗ Some acceptance criteria not met${NC}"
    echo ""
    echo "Please review and fix the failed items above."
    exit 1
fi
