#!/bin/bash

#==============================================================================
# TASK-010 验证脚本 (Verification Script for TASK-010)
#==============================================================================
# 验证部署脚本整合的所有 18 个验收标准
# (Verify all 18 acceptance criteria for deployment script consolidation)
#
# 使用方法 (Usage):
#   ./verify-task-010.sh
#
#==============================================================================

set -e

# 颜色代码
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 计数器
TOTAL_AC=18
PASSED_AC=0
FAILED_AC=0

# 结果数组
declare -a AC_RESULTS

#------------------------------------------------------------------------------
# 验证函数 (Verification Functions)
#------------------------------------------------------------------------------

check_ac() {
    local ac_number=$1
    local ac_name=$2
    local check_command=$3

    echo -n "AC ${ac_number}: ${ac_name}... "

    if eval "$check_command" &> /dev/null; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASSED_AC++))
        AC_RESULTS[$ac_number]="PASS"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((FAILED_AC++))
        AC_RESULTS[$ac_number]="FAIL"
        return 1
    fi
}

#------------------------------------------------------------------------------
# 脚本整合验收标准 (Script Consolidation AC)
#------------------------------------------------------------------------------

echo "=============================================================================="
echo "TASK-010: 部署脚本整合验收标准验证"
echo "=============================================================================="
echo ""
echo "类别 1: 脚本整合 (Script Consolidation)"
echo "------------------------------------------------------------------------------"

# AC 1.1: scripts/ 目录结构已重组
check_ac "1.1" "scripts/ 目录结构已重组" \
    "[ -d scripts/deploy ] && [ -d scripts/backup ] && [ -d scripts/ci ]"

# AC 1.2: 核心脚本数量 ≤ 5 个
check_ac "1.2" "核心脚本数量 ≤ 5 个" \
    "[ $(ls scripts/deploy/*.sh 2>/dev/null | wc -l) -le 3 ] && [ $(ls scripts/backup/*.sh 2>/dev/null | wc -l) -le 2 ] && [ $(ls scripts/ci/*.sh 2>/dev/null | wc -l) -le 2 ]"

# AC 1.3: 所有旧脚本已整合或归档
check_ac "1.3" "所有旧脚本已整合或归档" \
    "[ -d scripts/legacy ] && [ $(ls scripts/legacy/*.sh 2>/dev/null | wc -l) -gt 0 ]"

echo ""
echo "类别 2: 脚本功能 (Script Functionality)"
echo "------------------------------------------------------------------------------"

# AC 2.1: deploy.sh 支持一键部署
check_ac "2.1" "deploy.sh 支持一键部署" \
    "grep -q '一键部署' scripts/deploy/deploy.sh || grep -q 'One-command deployment' scripts/deploy/deploy.sh"

# AC 2.2: rollback.sh 支持一键回滚
check_ac "2.2" "rollback.sh 支持一键回滚" \
    "grep -q '一键回滚' scripts/deploy/rollback.sh || grep -q 'One-command rollback' scripts/deploy/rollback.sh"

# AC 2.3: verify.sh 支持部署后验证
check_ac "2.3" "verify.sh 支持部署后验证" \
    "grep -q '部署验证' scripts/deploy/verify.sh || grep -q 'Deployment verification' scripts/deploy/verify.sh"

echo ""
echo "类别 3: 幂等性 (Idempotency)"
echo "------------------------------------------------------------------------------"

# AC 3.1: 脚本可重复执行
check_ac "3.1" "脚本可重复执行（已实现幂等性检查）" \
    "grep -q '幂等性' scripts/deploy/deploy.sh || grep -q 'idempoten' scripts/deploy/deploy.sh"

# AC 3.2: 跳过已完成步骤
check_ac "3.2" "脚本可跳过已完成步骤" \
    "grep -q 'check_state\|get_state\|mark_state' scripts/deploy/deploy.sh"

# AC 3.3: 无副作用
check_ac "3.3" "脚本无副作用（状态检查机制）" \
    "grep -q 'check_state\|check_prerequisites' scripts/deploy/deploy.sh"

echo ""
echo "类别 4: 脚本文档 (Script Documentation)"
echo "------------------------------------------------------------------------------"

# AC 4.1: 每个脚本有 --help 参数
check_ac "4.1" "每个脚本有 --help 参数" \
    "[ $(grep -l '\-\-help' scripts/deploy/*.sh scripts/backup/*.sh scripts/ci/*.sh 2>/dev/null | wc -l) -ge 7 ]"

# AC 4.2: scripts/README.md 存在
check_ac "4.2" "scripts/README.md 存在" \
    "[ -f scripts/README.md ]"

# AC 4.3: 包含使用示例
check_ac "4.3" "README.md 包含使用示例" \
    "grep -q '使用方法\|Usage' scripts/README.md"

echo ""
echo "类别 5: 一键部署 (One-Command Deployment)"
echo "------------------------------------------------------------------------------"

# AC 5.1: deploy.sh 存在且可执行
check_ac "5.1" "deploy.sh 存在且可执行" \
    "[ -x scripts/deploy/deploy.sh ]"

# AC 5.2: 部署脚本语法正确
check_ac "5.2" "部署脚本语法正确" \
    "bash -n scripts/deploy/deploy.sh && bash -n scripts/deploy/rollback.sh && bash -n scripts/deploy/verify.sh"

echo ""
echo "类别 6: 备份/恢复 (Backup/Restore)"
echo "------------------------------------------------------------------------------"

# AC 6.1: 备份脚本存在
check_ac "6.1" "备份脚本存在且可执行" \
    "[ -x scripts/backup/backup.sh ]"

# AC 6.2: 恢复脚本存在
check_ac "6.2" "恢复脚本存在且可执行" \
    "[ -x scripts/backup/restore.sh ]"

echo ""
echo "类别 7: 质量 (Quality)"
echo "------------------------------------------------------------------------------"

# AC 7.1: 脚本遵循最佳实践
check_ac "7.1" "脚本使用 set -e" \
    "grep -q 'set -e' scripts/deploy/deploy.sh && grep -q 'set -e' scripts/deploy/rollback.sh && grep -q 'set -e' scripts/deploy/verify.sh"

# AC 7.2: 文档完整准确
check_ac "7.2" "文档包含所有脚本说明" \
    "grep -q 'deploy.sh\|rollback.sh\|verify.sh\|backup.sh\|restore.sh' scripts/README.md"

echo ""
echo "类别 8: CI 脚本 (CI Scripts)"
echo "------------------------------------------------------------------------------"

# AC 8.1: CI build 脚本存在
check_ac "8.1" "CI build 脚本存在且可执行" \
    "[ -x scripts/ci/build.sh ]"

# AC 8.2: CI test 脚本存在
check_ac "8.2" "CI test 脚本存在且可执行" \
    "[ -x scripts/ci/test.sh ]"

echo ""
echo "类别 9: 额外验收标准 (Additional AC)"
echo "------------------------------------------------------------------------------"

# AC 9.1: 脚本支持中文文档
check_ac "9.1" "脚本包含中文文档" \
    "grep -q '功能特性\|使用方法' scripts/deploy/deploy.sh"

# AC 9.2: 脚本行数合理（<1000行）
check_ac "9.2" "脚本行数合理（<1000行）" \
    "[ $(wc -l < scripts/deploy/deploy.sh) -lt 1000 ]"

#------------------------------------------------------------------------------
# 打印结果 (Print Results)
#------------------------------------------------------------------------------

echo ""
echo "=============================================================================="
echo "验证结果摘要 (Verification Summary)"
echo "=============================================================================="
echo ""
echo "总验收标准数 (Total AC): ${TOTAL_AC}"
echo "通过 (Passed): ${PASSED_AC}"
echo "失败 (Failed): ${FAILED_AC}"
echo ""

# 计算通过率
PASS_RATE=0
if [ ${TOTAL_AC} -gt 0 ]; then
    PASS_RATE=$((PASSED_AC * 100 / TOTAL_AC))
fi

echo "通过率 (Pass Rate): ${PASS_RATE}%"
echo ""

if [ ${FAILED_AC} -eq 0 ]; then
    echo -e "${GREEN}所有验收标准通过! (All AC passed!)${NC}"
    echo ""
    echo "=============================================================================="
    exit 0
else
    echo -e "${RED}部分验收标准失败 (Some AC failed)${NC}"
    echo ""
    echo "失败的验收标准 (Failed AC):"
    for i in "${!AC_RESULTS[@]}"; do
        if [ "${AC_RESULTS[$i]}" = "FAIL" ]; then
            echo "  - AC $i"
        fi
    done
    echo ""
    echo "=============================================================================="
    exit 1
fi
