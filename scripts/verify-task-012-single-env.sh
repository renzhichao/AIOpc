#!/bin/bash

#==============================================================================
# TASK-012 单生产环境部署验证脚本
# (Single Production Environment Deployment Verification Script)
#==============================================================================
# 验证单生产环境可靠部署的所有验收标准
# (Verify all acceptance criteria for single production deployment)
#
# 使用方法 (Usage):
#   ./scripts/verify-task-012-single-env.sh
#
#==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色代码
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 计数器
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 测试结果数组
declare -a AC_RESULTS

#------------------------------------------------------------------------------
# 测试函数 (Test Functions)
#------------------------------------------------------------------------------

test_ac() {
    local ac_number=$1
    local ac_name=$2
    local test_command=$3

    ((TOTAL_TESTS++))
    echo -n "[$(printf '%02d' $ac_number)] $ac_name ... "

    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASSED_TESTS++))
        AC_RESULTS[$ac_number]="PASS"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((FAILED_TESTS++))
        AC_RESULTS[$ac_number]="FAIL"
        return 1
    fi
}

print_section() {
    echo ""
    echo -e "${BLUE}==>${NC} $1"
    echo ""
}

#------------------------------------------------------------------------------
# 验证函数 (Verification Functions)
#------------------------------------------------------------------------------

verify_deployment_workflow() {
    print_section "验证部署工作流 (Verify Deployment Workflow)"

    # AC-1: 生产部署工作流存在
    test_ac 1 "生产部署工作流存在 (Production deployment workflow exists)" \
        "[ -f '${PROJECT_ROOT}/.github/workflows/deploy-production.yml' ]"

    # AC-2: 手动触发配置
    test_ac 2 "手动触发配置 (Manual trigger configured)" \
        "grep -q 'workflow_dispatch' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"

    # AC-3: 部署确认机制
    test_ac 3 "部署确认机制 (Deployment confirmation mechanism)" \
        "grep -q 'confirm_deployment' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"

    # AC-4: 无自动触发
    test_ac 4 "无自动触发 (No automatic triggers)" \
        "! grep -q 'push:\|pull_request:\|schedule:' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml' || \
         grep -q 'on:.*workflow_dispatch' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml' && \
         ! grep -q 'on:' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml' | grep -v 'workflow_dispatch'"
}

verify_unit_tests() {
    print_section "验证单元测试 (Verify Unit Tests)"

    # AC-5: 单元测试作业存在
    test_ac 5 "单元测试作业存在 (Unit test job exists)" \
        "grep -q 'unit-test:' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"

    # AC-6: 强制单元测试
    test_ac 6 "强制单元测试 (Mandatory unit tests)" \
        "grep -q 'if: github.event.inputs.skip_tests != .true.' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml' || \
         grep -q 'Run Unit Tests' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"

    # AC-7: 测试失败阻止部署
    test_ac 7 "测试失败阻止部署 (Test failure blocks deployment)" \
        "grep -q 'needs:.*unit-test' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"
}

verify_config_management() {
    print_section "验证配置管理 (Verify Configuration Management)"

    # AC-8: 配置验证作业
    test_ac 8 "配置验证作业存在 (Config validation job exists)" \
        "grep -q 'config-validation:' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"

    # AC-9: 占位符检测
    test_ac 9 "占位符检测 (Placeholder detection)" \
        "grep -q 'cli_xxxxxxxxxxxxx\|CHANGE_THIS\|placeholder' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"

    # AC-10: 必需配置检查
    test_ac 10 "必需配置检查 (Required config check)" \
        "grep -q 'REQUIRED_VARS\|DB_PASSWORD\|FEISHU_APP_ID' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"

    # AC-11: 单一配置源
    test_ac 11 "单一配置源 (.env.production)" \
        "grep -q '.env.production' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml' && \
         grep -q 'DEPLOY_PATH.*opclaw' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"
}

verify_database_protection() {
    print_section "验证数据库保护 (Verify Database Protection)"

    # AC-12: 数据库保护作业
    test_ac 12 "数据库保护作业存在 (Database protection job exists)" \
        "grep -q 'database-protection:' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"

    # AC-13: 部署前数据库备份
    test_ac 13 "部署前数据库备份 (Pre-deployment database backup)" \
        "grep -q 'pg_dump' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml' && \
         grep -q 'gzip' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"

    # AC-14: 数据库健康检查
    test_ac 14 "数据库健康检查 (Database health check)" \
        "grep -q 'pg_isready' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"

    # AC-15: 无删除 volume 命令
    test_ac 15 "无删除 volume 命令 (No volume deletion)" \
        "! grep -q 'down.*-v\|volume rm' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"
}

verify_deployment_process() {
    print_section "验证部署流程 (Verify Deployment Process)"

    # AC-16: 部署前备份
    test_ac 16 "部署前备份 (Pre-deployment backup)" \
        "grep -q 'Create Backup\|创建备份' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"

    # AC-17: 代码同步使用 rsync
    test_ac 17 "代码同步使用 rsync (Code sync with rsync)" \
        "grep -q 'rsync' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"

    # AC-18: 健康检查带重试
    test_ac 18 "健康检查带重试 (Health check with retry)" \
        "grep -q 'MAX_RETRIES\|retries.*3' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"

    # AC-19: 自动回滚机制
    test_ac 19 "自动回滚机制 (Automatic rollback)" \
        "grep -q 'Rollback on Failure\|部署失败回滚' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"
}

verify_documentation() {
    print_section "验证文档 (Verify Documentation)"

    # AC-20: 单生产环境文档
    test_ac 20 "单生产环境文档存在 (Single production env documentation)" \
        "[ -f '${PROJECT_ROOT}/docs/operations/PRODUCTION_DEPLOYMENT.md' ]"

    # AC-21: 文档包含配置管理
    test_ac 21 "文档包含配置管理 (Config management in docs)" \
        "grep -q '配置管理\|Configuration Management' '${PROJECT_ROOT}/docs/operations/PRODUCTION_DEPLOYMENT.md'"

    # AC-22: 文档包含数据库保护
    test_ac 22 "文档包含数据库保护 (Database protection in docs)" \
        "grep -q '数据库保护\|Database Protection' '${PROJECT_ROOT}/docs/operations/PRODUCTION_DEPLOYMENT.md'"

    # AC-23: 文档包含回滚流程
    test_ac 23 "文档包含回滚流程 (Rollback process in docs)" \
        "grep -q '回滚机制\|Rollback Mechanism' '${PROJECT_ROOT}/docs/operations/PRODUCTION_DEPLOYMENT.md'"
}

verify_safety_checks() {
    print_section "安全检查 (Safety Checks)"

    # AC-24: 安全警告
    test_ac 24 "部署前安全警告 (Pre-deployment safety warning)" \
        "grep -q 'Safety Warning\|安全警告' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"

    # AC-25: 环境验证
    test_ac 25 "生产环境验证 (Production environment verification)" \
        "grep -q 'ENVIRONMENT.*production\|生产环境' '${PROJECT_ROOT}/.github/workflows/deploy-production.yml'"

    # AC-26: 无 staging 环境
    test_ac 26 "无 staging 环境 (No staging environment)" \
        "[ ! -f '${PROJECT_ROOT}/.github/workflows/deploy-staging.yml' ]"
}

#------------------------------------------------------------------------------
# 生成报告 (Generate Report)
#------------------------------------------------------------------------------

generate_report() {
    print_section "验证报告 (Verification Report)"

    echo "=============================================================================="
    echo "TASK-012 单生产环境部署验证结果"
    echo "TASK-012 Single Production Environment Deployment Verification"
    echo "=============================================================================="
    echo ""
    echo "任务 (Task): 单生产环境可靠部署 (Single Production Reliable Deployment)"
    echo "分支 (Branch): $(git branch --show-current)"
    echo "时间 (Timestamp): $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    echo "验收标准 (Acceptance Criteria):"
    echo "  总数 (Total):     ${TOTAL_TESTS}"
    echo "  通过 (Passed):    ${PASSED_TESTS} ${GREEN}✓${NC}"
    echo "  失败 (Failed):    ${FAILED_TESTS} ${RED}✗${NC}"
    echo "  通过率 (Pass Rate): $(awk "BEGIN {printf \"%.2f\", (${PASSED_TESTS}/${TOTAL_TESTS})*100}")%"
    echo ""
    echo "=============================================================================="
    echo ""

    # 详细结果
    echo "详细结果 (Detailed Results):"
    echo ""

    local categories=(
        "部署工作流:1-4"
        "单元测试:5-7"
        "配置管理:8-11"
        "数据库保护:12-15"
        "部署流程:16-19"
        "文档:20-23"
        "安全检查:24-26"
    )

    for category in "${categories[@]}"; do
        local name=$(echo $category | cut -d: -f1)
        local range=$(echo $category | cut -d: -f2)
        local start=$(echo $range | cut -d- -f1)
        local end=$(echo $range | cut -d- -f2)

        echo "【${name}】"
        for ((i=$start; i<=$end; i++)); do
            local result=${AC_RESULTS[$i]:-"UNKNOWN"}
            local status=""
            if [ "$result" = "PASS" ]; then
                status="${GREEN}✓${NC}"
            elif [ "$result" = "FAIL" ]; then
                status="${RED}✗${NC}"
            else
                status="${YELLOW}?${NC}"
            fi
            echo -e "  [$(printf '%02d' $i)] ${status}"
        done
        echo ""
    done

    # 通过率检查
    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}=============================================================================${NC}"
        echo -e "${GREEN}✓ 所有验收标准通过! (All acceptance criteria passed!)${NC}"
        echo -e "${GREEN}=============================================================================${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}=============================================================================${NC}"
        echo -e "${RED}✗ 有 ${FAILED_TESTS} 个验收标准未通过 (Some acceptance criteria failed)${NC}"
        echo -e "${RED}=============================================================================${NC}"
        echo ""
        return 1
    fi
}

#------------------------------------------------------------------------------
# 主函数 (Main Function)
#------------------------------------------------------------------------------

main() {
    echo ""
    echo "=============================================================================="
    echo "TASK-012 单生产环境部署验证脚本"
    echo "TASK-012 Single Production Environment Deployment Verification"
    echo "=============================================================================="
    echo ""

    cd "$PROJECT_ROOT"

    # 执行验证
    verify_deployment_workflow
    verify_unit_tests
    verify_config_management
    verify_database_protection
    verify_deployment_process
    verify_documentation
    verify_safety_checks

    # 生成报告
    generate_report
    local result=$?

    # 返回结果
    exit $result
}

#------------------------------------------------------------------------------
# 脚本入口点 (Script Entry Point)
#------------------------------------------------------------------------------

main "$@"
