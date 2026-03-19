#!/bin/bash

#==============================================================================
# AIOpc CI 测试脚本 (CI Test Script)
#==============================================================================
# 运行后端和前端测试
# (Run backend and frontend tests)
#
# 功能特性 (Features):
# - 单元测试 (Unit tests)
# - 集成测试 (Integration tests)
# - 覆盖率报告 (Coverage reports)
# - 并行测试执行 (Parallel test execution)
#
# 使用方法 (Usage):
#   ./test.sh --component all --coverage
#
#==============================================================================

set -e  # 遇到错误退出
set -u  # 使用未定义变量时退出
set -o pipefail  # 管道失败时退出

#------------------------------------------------------------------------------
# 配置 (Configuration)
#------------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${PROJECT_ROOT}/test.log"

# 颜色代码 (Color codes)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 选项 (Options)
COMPONENT="all"
TEST_TYPE="all"
COVERAGE=false
WATCH=false
VERBOSE=false
PARALLEL=true

# 测试结果
declare -A TEST_RESULTS
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

#------------------------------------------------------------------------------
# 日志函数 (Logging Functions)
#------------------------------------------------------------------------------

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $*"
    log "INFO" "$*"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
    log "SUCCESS" "$*"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
    log "WARNING" "$*"
}

error() {
    echo -e "${RED}[ERROR]${NC} $*"
    log "ERROR" "$*"
}

step() {
    echo -e "${BLUE}==>${NC} $1"
    log "STEP" "$*"
}

#------------------------------------------------------------------------------
# 检查函数 (Check Functions)
#------------------------------------------------------------------------------

check_command() {
    if ! command -v $1 &> /dev/null; then
        error "Required command not found: $1"
        exit 1
    fi
}

check_test_script() {
    local package_json=$1
    if [ ! -f "$package_json" ]; then
        return 1
    fi

    if grep -q '"test"' "$package_json"; then
        return 0
    else
        return 1
    fi
}

#------------------------------------------------------------------------------
# 测试函数 (Test Functions)
#------------------------------------------------------------------------------

test_backend() {
    if [ "$COMPONENT" != "all" ] && [ "$COMPONENT" != "backend" ]; then
        return
    fi

    step "测试后端 (Testing backend)"

    ((TOTAL_TESTS++))

    cd "$PROJECT_ROOT/platform/backend"

    # 检查测试脚本
    if ! check_test_script "package.json"; then
        warning "后端没有配置测试脚本，跳过"
        ((SKIPPED_TESTS++))
        cd "$PROJECT_ROOT"
        return 0
    fi

    # 构建测试命令
    local test_cmd="pnpm test"

    if [ "$COVERAGE" = true ]; then
        test_cmd="$test_cmd -- --coverage"
    fi

    if [ "$WATCH" = true ]; then
        test_cmd="$test_cmd -- --watch"
    fi

    if [ "$VERBOSE" = true ]; then
        test_cmd="$test_cmd -- --verbose"
    fi

    # 运行测试
    info "运行后端测试..."
    if eval "$test_cmd"; then
        success "后端测试通过"
        ((PASSED_TESTS++))
        TEST_RESULTS["backend"]="pass"
    else
        error "后端测试失败"
        ((FAILED_TESTS++))
        TEST_RESULTS["backend"]="fail"
    fi

    cd "$PROJECT_ROOT"
}

test_frontend() {
    if [ "$COMPONENT" != "all" ] && [ "$COMPONENT" != "frontend" ]; then
        return
    fi

    step "测试前端 (Testing frontend)"

    ((TOTAL_TESTS++))

    cd "$PROJECT_ROOT/platform/frontend"

    # 检查测试脚本
    if ! check_test_script "package.json"; then
        warning "前端没有配置测试脚本，跳过"
        ((SKIPPED_TESTS++))
        cd "$PROJECT_ROOT"
        return 0
    fi

    # 构建测试命令
    local test_cmd="pnpm test"

    if [ "$COVERAGE" = true ]; then
        test_cmd="$test_cmd -- --coverage"
    fi

    if [ "$WATCH" = true ]; then
        test_cmd="$test_cmd -- --watch"
    fi

    if [ "$VERBOSE" = true ]; then
        test_cmd="$test_cmd -- --verbose"
    fi

    # 运行测试
    info "运行前端测试..."
    if eval "$test_cmd"; then
        success "前端测试通过"
        ((PASSED_TESTS++))
        TEST_RESULTS["frontend"]="pass"
    else
        error "前端测试失败"
        ((FAILED_TESTS++))
        TEST_RESULTS["frontend"]="fail"
    fi

    cd "$PROJECT_ROOT"
}

test_integration() {
    if [ "$TEST_TYPE" != "all" ] && [ "$TEST_TYPE" != "integration" ]; then
        return
    fi

    step "集成测试 (Integration tests)"

    # 检查是否存在集成测试
    if [ ! -d "$PROJECT_ROOT/tests/integration" ]; then
        warning "没有找到集成测试目录，跳过"
        return
    fi

    ((TOTAL_TESTS++))

    # 运行集成测试
    info "运行集成测试..."
    if [ -f "$PROJECT_ROOT/tests/integration/run.sh" ]; then
        if bash "$PROJECT_ROOT/tests/integration/run.sh"; then
            success "集成测试通过"
            ((PASSED_TESTS++))
            TEST_RESULTS["integration"]="pass"
        else
            error "集成测试失败"
            ((FAILED_TESTS++))
            TEST_RESULTS["integration"]="fail"
        fi
    else
        warning "没有找到集成测试运行脚本，跳过"
        ((SKIPPED_TESTS++))
    fi
}

test_e2e() {
    if [ "$TEST_TYPE" != "all" ] && [ "$TEST_TYPE" != "e2e" ]; then
        return
    fi

    step "端到端测试 (E2E tests)"

    # 检查是否存在E2E测试
    if [ ! -d "$PROJECT_ROOT/tests/e2e" ]; then
        warning "没有找到E2E测试目录，跳过"
        return
    fi

    ((TOTAL_TESTS++))

    # 运行E2E测试
    info "运行E2E测试..."
    if [ -f "$PROJECT_ROOT/tests/e2e/run.sh" ]; then
        if bash "$PROJECT_ROOT/tests/e2e/run.sh"; then
            success "E2E测试通过"
            ((PASSED_TESTS++))
            TEST_RESULTS["e2e"]="pass"
        else
            error "E2E测试失败"
            ((FAILED_TESTS++))
            TEST_RESULTS["e2e"]="fail"
        fi
    else
        warning "没有找到E2E测试运行脚本，跳过"
        ((SKIPPED_TESTS++))
    fi
}

#------------------------------------------------------------------------------
# 并行测试 (Parallel Test Execution)
#------------------------------------------------------------------------------

test_parallel() {
    step "并行测试 (Parallel test execution)"

    if [ "$COMPONENT" = "all" ]; then
        # 后端和前端并行测试
        test_backend &
        local backend_pid=$!

        test_frontend &
        local frontend_pid=$!

        # 等待两个测试完成
        wait $backend_pid
        local backend_status=$?

        wait $frontend_pid
        local frontend_status=$?

        if [ $backend_status -ne 0 ]; then
            error "后端测试失败"
        fi

        if [ $frontend_status -ne 0 ]; then
            error "前端测试失败"
        fi

        if [ $backend_status -eq 0 ] && [ $frontend_status -eq 0 ]; then
            success "并行测试完成"
        fi
    elif [ "$COMPONENT" = "backend" ]; then
        test_backend
    elif [ "$COMPONENT" = "frontend" ]; then
        test_frontend
    fi
}

#------------------------------------------------------------------------------
# 覆盖率报告 (Coverage Report)
#------------------------------------------------------------------------------

generate_coverage_report() {
    if [ "$COVERAGE" = false ]; then
        return
    fi

    step "生成覆盖率报告 (Generating coverage report)"

    # 合并覆盖率报告
    if [ -d "$PROJECT_ROOT/platform/backend/coverage" ] && [ -d "$PROJECT_ROOT/platform/frontend/coverage" ]; then
        info "合并覆盖率报告..."

        # 检查是否安装了覆盖率合并工具
        if command -v nyc &> /dev/null; then
            nyc merge "$PROJECT_ROOT/platform/backend/coverage" "$PROJECT_ROOT/coverage/backend.json"
            nyc merge "$PROJECT_ROOT/platform/frontend/coverage" "$PROJECT_ROOT/coverage/frontend.json"
        fi
    fi

    # 显示覆盖率摘要
    if [ -f "$PROJECT_ROOT/platform/backend/coverage/coverage-summary.json" ]; then
        info "后端覆盖率摘要:"
        cat "$PROJECT_ROOT/platform/backend/coverage/coverage-summary.json" | grep -E '"total"' | head -1
    fi

    if [ -f "$PROJECT_ROOT/platform/frontend/coverage/coverage-summary.json" ]; then
        info "前端覆盖率摘要:"
        cat "$PROJECT_ROOT/platform/frontend/coverage/coverage-summary.json" | grep -E '"total"' | head -1
    fi
}

#------------------------------------------------------------------------------
# 打印摘要 (Print Summary)
#------------------------------------------------------------------------------

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "测试摘要 (Test Summary)"
    echo "=============================================================================="
    echo ""
    echo "总测试数 (Total tests): $TOTAL_TESTS"
    echo "通过 (Passed): $PASSED_TESTS"
    echo "失败 (Failed): $FAILED_TESTS"
    echo "跳过 (Skipped): $SKIPPED_TESTS"
    echo ""

    if [ $FAILED_TESTS -eq 0 ]; then
        success "所有测试通过! (All tests passed!)"
    else
        error "部分测试失败 (Some tests failed)"
    fi

    if [ "$COVERAGE" = true ]; then
        echo ""
        echo "覆盖率报告 (Coverage Reports):"
        if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "backend" ]; then
            echo "  后端 (Backend): platform/backend/coverage/"
        fi
        if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "frontend" ]; then
            echo "  前端 (Frontend): platform/frontend/coverage/"
        fi
    fi
    echo ""
    echo "=============================================================================="
}

#------------------------------------------------------------------------------
# 帮助信息 (Help)
#------------------------------------------------------------------------------

show_help() {
    cat << EOF
用法 (Usage): $0 [选项]

选项 (Options):
  --component <组件>      测试组件 (backend, frontend, all) [默认: all]
  --type <类型>           测试类型 (unit, integration, e2e, all) [默认: all]
  --coverage              生成覆盖率报告
  --watch                 监视模式
  --parallel              并行测试 [默认: true]
  --no-parallel           串行测试
  --verbose               详细输出
  --help                  显示此帮助信息

测试类型 (Test Types):
  unit          - 单元测试 (默认)
  integration   - 集成测试
  e2e           - 端到端测试
  all           - 所有测试

示例 (Examples):
  # 运行所有测试
  $0 --component all

  # 运行测试并生成覆盖率报告
  $0 --coverage

  # 仅运行后端测试
  $0 --component backend

  # 运行集成测试
  $0 --type integration

  # 监视模式
  $0 --watch

退出码 (Exit codes):
  0 - 所有测试通过
  1 - 部分测试失败

EOF
}

#------------------------------------------------------------------------------
# 主函数 (Main Function)
#------------------------------------------------------------------------------

main() {
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --component)
                COMPONENT="$2"
                shift 2
                ;;
            --type)
                TEST_TYPE="$2"
                shift 2
                ;;
            --coverage)
                COVERAGE=true
                shift
                ;;
            --watch)
                WATCH=true
                shift
                ;;
            --parallel)
                PARALLEL=true
                shift
                ;;
            --no-parallel)
                PARALLEL=false
                shift
                ;;
            --verbose)
                VERBOSE=true
                set -x
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                error "未知选项: $1"
                echo "使用 --help 查看帮助信息"
                exit 1
                ;;
        esac
    done

    # 打印配置
    echo "=============================================================================="
    echo "AIOpc CI 测试脚本 (CI Test Script)"
    echo "=============================================================================="
    echo "时间戳 (Timestamp): ${TIMESTAMP}"
    echo "组件 (Component): ${COMPONENT}"
    echo "测试类型 (Test Type): ${TEST_TYPE}"
    echo "覆盖率 (Coverage): ${COVERAGE}"
    echo "监视模式 (Watch): ${WATCH}"
    echo "并行测试 (Parallel): ${PARALLEL}"
    echo "=============================================================================="
    echo ""

    # 前置检查
    step "前置检查 (Pre-flight checks)"
    check_command node
    check_command pnpm || check_command npm
    success "前置检查通过"
    echo ""

    # 执行测试
    if [ "$PARALLEL" = true ] && [ "$TEST_TYPE" = "all" ] || [ "$TEST_TYPE" = "unit" ]; then
        test_parallel
    else
        if [ "$TEST_TYPE" = "all" ] || [ "$TEST_TYPE" = "unit" ]; then
            if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "backend" ]; then
                test_backend
            fi

            if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "frontend" ]; then
                test_frontend
            fi
        fi
    fi

    test_integration
    test_e2e

    # 生成覆盖率报告
    generate_coverage_report

    # 打印摘要
    print_summary

    # 返回适当的退出码
    if [ $FAILED_TESTS -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

#------------------------------------------------------------------------------
# 脚本入口点 (Script Entry Point)
#------------------------------------------------------------------------------

main "$@"
