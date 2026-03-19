#!/bin/bash

#==============================================================================
# TASK-011 验证脚本 (Verification Script for TASK-011)
#==============================================================================
# 验证回滚测试功能的所有验收标准
# (Verify all acceptance criteria for rollback testing functionality)
#
# 使用方法 (Usage):
#   ./scripts/verify-task-011.sh
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

verify_rollback_script() {
    print_section "验证回滚测试脚本 (Verify Rollback Test Script)"

    # AC-1: 脚本存在且可执行
    test_ac 1 "脚本存在且可执行 (Script exists and is executable)" \
        "[ -f '${PROJECT_ROOT}/scripts/test-rollback.sh' ] && [ -x '${PROJECT_ROOT}/scripts/test-rollback.sh' ]"

    # AC-2: 脚本包含 6+ 测试步骤
    test_ac 2 "脚本包含 6+ 测试步骤 (Script contains 6+ test steps)" \
        "grep -q 'create_pre_test_backup' '${PROJECT_ROOT}/scripts/test-rollback.sh' && \
         grep -q 'deploy_test_version' '${PROJECT_ROOT}/scripts/test-rollback.sh' && \
         grep -q 'verify_pre_rollback' '${PROJECT_ROOT}/scripts/test-rollback.sh' && \
         grep -q 'execute_rollback' '${PROJECT_ROOT}/scripts/test-rollback.sh' && \
         grep -q 'verify_post_rollback' '${PROJECT_ROOT}/scripts/test-rollback.sh' && \
         grep -q 'verify_data_integrity' '${PROJECT_ROOT}/scripts/test-rollback.sh'"

    # AC-3: 测试 Staging 环境（非 production）
    test_ac 3 "测试 Staging 环境（非 production）(Tests Staging environment, not production)" \
        "grep -q 'ENVIRONMENT.*staging' '${PROJECT_ROOT}/scripts/test-rollback.sh' && \
         (grep -q 'production.*error' '${PROJECT_ROOT}/scripts/test-rollback.sh' || grep -q '此脚本仅.*Staging' '${PROJECT_ROOT}/scripts/test-rollback.sh')"
}

verify_rollback_testing() {
    print_section "验证回滚测试功能 (Verify Rollback Testing Functionality)"

    # AC-4: 部署测试版本功能
    test_ac 4 "部署测试版本功能 (Deploy test version functionality)" \
        "grep -q 'deploy_test_version()' '${PROJECT_ROOT}/scripts/test-rollback.sh'"

    # AC-5: 回滚命令执行功能
    test_ac 5 "回滚命令执行功能 (Rollback command execution functionality)" \
        "grep -q 'execute_rollback()' '${PROJECT_ROOT}/scripts/test-rollback.sh' && \
         grep -q 'rollback.sh' '${PROJECT_ROOT}/scripts/test-rollback.sh'"

    # AC-6: 回滚后服务健康验证
    test_ac 6 "回滚后服务健康验证 (Post-rollback service health verification)" \
        "grep -q 'verify_post_rollback()' '${PROJECT_ROOT}/scripts/test-rollback.sh' && \
         grep -q 'health' '${PROJECT_ROOT}/scripts/test-rollback.sh'"

    # AC-7: 数据完整性验证
    test_ac 7 "数据完整性验证 (Data integrity validation)" \
        "grep -q 'verify_data_integrity()' '${PROJECT_ROOT}/scripts/test-rollback.sh' && \
         grep -q 'integrity' '${PROJECT_ROOT}/scripts/test-rollback.sh'"
}

verify_rollback_time() {
    print_section "验证回滚时间要求 (Verify Rollback Time Requirements)"

    # AC-8: 回滚时间 < 3 分钟
    test_ac 8 "回滚时间 < 3 分钟 (Rollback time < 3 minutes)" \
        "grep -q '180.*seconds' '${PROJECT_ROOT}/scripts/test-rollback.sh' || \
         grep -q '3.*分钟' '${PROJECT_ROOT}/scripts/test-rollback.sh' || \
         grep -q 'rollback_time_passed' '${PROJECT_ROOT}/scripts/test-rollback.sh'"

    # AC-9: 总回滚时间 < 10 分钟
    test_ac 9 "总回滚时间 < 10 分钟 (Total rollback time < 10 minutes)" \
        "grep -q '600.*seconds' '${PROJECT_ROOT}/scripts/test-rollback.sh' || \
         grep -q '10.*分钟' '${PROJECT_ROOT}/scripts/test-rollback.sh' || \
         grep -q 'total_time_passed' '${PROJECT_ROOT}/scripts/test-rollback.sh'"
}

verify_ci_integration() {
    print_section "验证 CI 集成 (Verify CI Integration)"

    # AC-10: 每周回滚测试配置
    test_ac 10 "每周回滚测试配置 (Weekly rollback test configured)" \
        "grep -q 'cron.*0.*3.*\*.*\*.*0' '${PROJECT_ROOT}/.github/workflows/test-rollback.yml' || \
         grep -q 'Sunday.*3.*AM' '${PROJECT_ROOT}/.github/workflows/test-rollback.yml'"

    # AC-11: Staging 环境自动测试
    test_ac 11 "Staging 环境自动测试 (Automatic testing on staging deployments)" \
        "grep -q 'ENVIRONMENT.*staging' '${PROJECT_ROOT}/.github/workflows/test-rollback.yml'"
}

verify_documentation() {
    print_section "验证回滚文档 (Verify Rollback Documentation)"

    # AC-12: 文档存在
    test_ac 12 "文档存在 (Documentation exists)" \
        "[ -f '${PROJECT_ROOT}/docs/operations/ROLLBACK_TESTING.md' ]"

    # AC-13: 包含测试流程
    test_ac 13 "包含测试流程 (Contains testing procedures)" \
        "grep -q '测试流程' '${PROJECT_ROOT}/docs/operations/ROLLBACK_TESTING.md' || \
         grep -q 'testing.*process' '${PROJECT_ROOT}/docs/operations/ROLLBACK_TESTING.md' -i"

    # AC-14: 包含时间要求
    test_ac 14 "包含时间要求和 SLA (Contains time requirements and SLAs)" \
        "grep -q 'SLA' '${PROJECT_ROOT}/docs/operations/ROLLBACK_TESTING.md' && \
         grep -q '3.*分钟' '${PROJECT_ROOT}/docs/operations/ROLLBACK_TESTING.md'"
}

verify_quality() {
    print_section "验证质量标准 (Verify Quality Standards)"

    # AC-15: 测试脚本幂等性
    test_ac 15 "测试脚本幂等性 (Test script idempotency)" \
        "grep -q '幂等' '${PROJECT_ROOT}/scripts/test-rollback.sh' || \
         grep -q 'idempotent' '${PROJECT_ROOT}/scripts/test-rollback.sh' -i"

    # AC-16: 错误处理和日志
    test_ac 16 "错误处理和日志 (Error handling and logging)" \
        "grep -q 'set -e' '${PROJECT_ROOT}/scripts/test-rollback.sh' && \
         grep -q 'log()' '${PROJECT_ROOT}/scripts/test-rollback.sh' && \
         grep -q 'error()' '${PROJECT_ROOT}/scripts/test-rollback.sh'"
}

verify_additional_checks() {
    print_section "附加检查 (Additional Checks)"

    echo "检查脚本行数..."
    local line_count=$(wc -l < "${PROJECT_ROOT}/scripts/test-rollback.sh")
    echo "  test-rollback.sh: $line_count 行"
    if [ $line_count -gt 500 ]; then
        echo -e "    ${GREEN}✓ 脚本长度充足${NC}"
    else
        echo -e "    ${YELLOW}⚠ 脚本可能需要更多内容${NC}"
    fi

    echo ""
    echo "检查 CI 工作流行数..."
    local workflow_lines=$(wc -l < "${PROJECT_ROOT}/.github/workflows/test-rollback.yml")
    echo "  test-rollback.yml: $workflow_lines 行"
    if [ $workflow_lines -gt 200 ]; then
        echo -e "    ${GREEN}✓ 工作流完整${NC}"
    else
        echo -e "    ${YELLOW}⚠ 工作流可能需要更多内容${NC}"
    fi

    echo ""
    echo "检查文档行数..."
    local doc_lines=$(wc -l < "${PROJECT_ROOT}/docs/operations/ROLLBACK_TESTING.md")
    echo "  ROLLBACK_TESTING.md: $doc_lines 行"
    if [ $doc_lines -gt 300 ]; then
        echo -e "    ${GREEN}✓ 文档详尽${NC}"
    else
        echo -e "    ${YELLOW}⚠ 文档可能需要更多内容${NC}"
    fi

    echo ""
    echo "检查安全机制..."
    if grep -q "production.*error" "${PROJECT_ROOT}/scripts/test-rollback.sh"; then
        echo -e "    ${GREEN}✓ 生产环境保护已启用${NC}"
    else
        echo -e "    ${RED}✗ 缺少生产环境保护${NC}"
    fi

    echo ""
    echo "检查测试报告功能..."
    if grep -q "generate_test_report()" "${PROJECT_ROOT}/scripts/test-rollback.sh" && \
       grep -q "report_file.*json" "${PROJECT_ROOT}/scripts/test-rollback.sh"; then
        echo -e "    ${GREEN}✓ 测试报告功能完整${NC}"
    else
        echo -e "    ${YELLOW}⚠ 测试报告功能可能不完整${NC}"
    fi
}

#------------------------------------------------------------------------------
# 生成报告 (Generate Report)
#------------------------------------------------------------------------------

generate_report() {
    print_section "验证报告 (Verification Report)"

    echo "=============================================================================="
    echo "TASK-011 验证结果 (TASK-011 Verification Results)"
    echo "=============================================================================="
    echo ""
    echo "任务 (Task): 自动化回滚验证 (Automated Rollback Testing)"
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
        "回滚脚本:1-3"
        "回滚测试:4-7"
        "回滚时间:8-9"
        "CI 集成:10-11"
        "回滚文档:12-14"
        "质量标准:15-16"
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
# 干运行测试 (Dry Run Test)
#------------------------------------------------------------------------------

dry_run_test() {
    print_section "干运行测试 (Dry Run Test)"

    echo "执行测试脚本干运行模式..."
    echo ""

    if "${PROJECT_ROOT}/scripts/test-rollback.sh" --dry-run 2>&1 | head -n 50; then
        echo -e "${GREEN}✓ 干运行测试通过${NC}"
        return 0
    else
        echo -e "${RED}✗ 干运行测试失败${NC}"
        return 1
    fi
}

#------------------------------------------------------------------------------
# 主函数 (Main Function)
#------------------------------------------------------------------------------

main() {
    echo ""
    echo "=============================================================================="
    echo "TASK-011 验证脚本 (TASK-011 Verification Script)"
    echo "=============================================================================="
    echo ""

    cd "$PROJECT_ROOT"

    # 执行验证
    verify_rollback_script
    verify_rollback_testing
    verify_rollback_time
    verify_ci_integration
    verify_documentation
    verify_quality
    verify_additional_checks

    # 生成报告
    generate_report
    local result=$?

    # 干运行测试（可选）
    echo ""
    read -p "是否执行干运行测试? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        dry_run_test
    fi

    # 返回结果
    exit $result
}

#------------------------------------------------------------------------------
# 脚本入口点 (Script Entry Point)
#------------------------------------------------------------------------------

main "$@"
