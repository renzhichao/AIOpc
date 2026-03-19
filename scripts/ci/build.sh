#!/bin/bash

#==============================================================================
# AIOpc CI 构建脚本 (CI Build Script)
#==============================================================================
# 构建后端和前端项目
# (Build backend and frontend projects)
#
# 功能特性 (Features):
# - 并行构建 (Parallel builds)
# - 依赖检查 (Dependency checks)
# - 构建验证 (Build verification)
# - 产物缓存 (Artifact caching)
#
# 使用方法 (Usage):
#   ./build.sh --component all
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
LOG_FILE="${PROJECT_ROOT}/build.log"

# 颜色代码 (Color codes)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 选项 (Options)
COMPONENT="all"
PARALLEL=true
CACHE=true
VERBOSE=false
CLEAN=false

# 构建结果
declare -A BUILD_RESULTS
TOTAL_BUILDS=0
PASSED_BUILDS=0
FAILED_BUILDS=0

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

check_node_version() {
    local min_version="18.0.0"
    local current_version=$(node -v | sed 's/v//' | cut -d'.' -f1-2)

    if [ "$(printf '%s\n' "$min_version" "$current_version" | sort -V | head -n1)" != "$min_version" ]; then
        error "Node.js version must be >= $min_version (current: $(node -v))"
        exit 1
    fi
}

#------------------------------------------------------------------------------
# 构建函数 (Build Functions)
#------------------------------------------------------------------------------

build_backend() {
    if [ "$COMPONENT" != "all" ] && [ "$COMPONENT" != "backend" ]; then
        return
    fi

    step "构建后端 (Building backend)"

    ((TOTAL_BUILDS++))

    cd "$PROJECT_ROOT/platform/backend"

    # 清理旧构建
    if [ "$CLEAN" = true ]; then
        info "清理旧构建..."
        rm -rf dist node_modules/.cache
    fi

    # 检查依赖
    if [ ! -f "package.json" ]; then
        error "package.json not found"
        ((FAILED_BUILDS++))
        return 1
    fi

    # 安装依赖
    info "安装后端依赖..."
    if [ -f "pnpm-lock.yaml" ]; then
        pnpm install --frozen-lockfile
    else
        npm ci
    fi

    # 运行构建
    info "编译TypeScript..."
    pnpm run build

    # 验证构建产物
    if [ ! -f "dist/app.js" ] && [ ! -f "dist/app.ts" ]; then
        error "构建失败: dist/app.js not found"
        ((FAILED_BUILDS++))
        return 1
    fi

    # 检查构建产物大小
    local build_size=$(du -sh dist | cut -f1)
    info "构建产物大小: ${build_size}"

    cd "$PROJECT_ROOT"
    success "后端构建完成"
    ((PASSED_BUILDS++))
    BUILD_RESULTS["backend"]="pass"
}

build_frontend() {
    if [ "$COMPONENT" != "all" ] && [ "$COMPONENT" != "frontend" ]; then
        return
    fi

    step "构建前端 (Building frontend)"

    ((TOTAL_BUILDS++))

    cd "$PROJECT_ROOT/platform/frontend"

    # 清理旧构建
    if [ "$CLEAN" = true ]; then
        info "清理旧构建..."
        rm -rf dist node_modules/.cache
    fi

    # 检查依赖
    if [ ! -f "package.json" ]; then
        error "package.json not found"
        ((FAILED_BUILDS++))
        return 1
    fi

    # 安装依赖
    info "安装前端依赖..."
    if [ -f "pnpm-lock.yaml" ]; then
        pnpm install --frozen-lockfile
    else
        npm ci
    fi

    # 运行构建
    info "构建React应用..."
    pnpm run build

    # 验证构建产物
    if [ ! -d "dist" ]; then
        error "构建失败: dist directory not found"
        ((FAILED_BUILDS++))
        return 1
    fi

    if [ ! -f "dist/index.html" ]; then
        error "构建失败: dist/index.html not found"
        ((FAILED_BUILDS++))
        return 1
    fi

    # 检查构建产物大小
    local build_size=$(du -sh dist | cut -f1)
    info "构建产物大小: ${build_size}"

    # 统计文件数量
    local file_count=$(find dist -type f | wc -l | tr -d ' ')
    info "构建文件数量: ${file_count}"

    cd "$PROJECT_ROOT"
    success "前端构建完成"
    ((PASSED_BUILDS++))
    BUILD_RESULTS["frontend"]="pass"
}

#------------------------------------------------------------------------------
# 并行构建 (Parallel Build)
#------------------------------------------------------------------------------

build_parallel() {
    step "并行构建 (Parallel build)"

    if [ "$COMPONENT" = "all" ]; then
        # 后端和 frontend 并行构建
        build_backend &
        local backend_pid=$!

        build_frontend &
        local frontend_pid=$!

        # 等待两个构建完成
        wait $backend_pid
        local backend_status=$?

        wait $frontend_pid
        local frontend_status=$?

        if [ $backend_status -ne 0 ]; then
            error "后端构建失败"
        fi

        if [ $frontend_status -ne 0 ]; then
            error "前端构建失败"
        fi

        if [ $backend_status -eq 0 ] && [ $frontend_status -eq 0 ]; then
            success "并行构建完成"
        fi
    elif [ "$COMPONENT" = "backend" ]; then
        build_backend
    elif [ "$COMPONENT" = "frontend" ]; then
        build_frontend
    fi
}

#------------------------------------------------------------------------------
# 构建验证 (Build Verification)
#------------------------------------------------------------------------------

verify_builds() {
    step "验证构建 (Verifying builds)"

    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "backend" ]; then
        if [ -d "$PROJECT_ROOT/platform/backend/dist" ]; then
            info "验证后端构建..."
            local file_count=$(find "$PROJECT_ROOT/platform/backend/dist" -type f | wc -l | tr -d ' ')
            if [ "$file_count" -gt 0 ]; then
                success "后端构建有效 (${file_count} files)"
            else
                error "后端构建为空"
            fi
        fi
    fi

    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "frontend" ]; then
        if [ -d "$PROJECT_ROOT/platform/frontend/dist" ]; then
            info "验证前端构建..."
            local file_count=$(find "$PROJECT_ROOT/platform/frontend/dist" -type f | wc -l | tr -d ' ')
            if [ "$file_count" -gt 0 ]; then
                success "前端构建有效 (${file_count} files)"
            else
                error "前端构建为空"
            fi
        fi
    fi
}

#------------------------------------------------------------------------------
# 打印摘要 (Print Summary)
#------------------------------------------------------------------------------

print_summary() {
    echo ""
    echo "=============================================================================="
    echo "构建摘要 (Build Summary)"
    echo "=============================================================================="
    echo ""
    echo "总构建数 (Total builds): $TOTAL_BUILDS"
    echo "成功 (Passed): $PASSED_BUILDS"
    echo "失败 (Failed): $FAILED_BUILDS"
    echo ""

    if [ "$FAILED_BUILDS" -eq 0 ]; then
        success "所有构建成功! (All builds succeeded!)"
    else
        error "部分构建失败 (Some builds failed)"
    fi

    echo ""
    echo "构建产物 (Build Artifacts):"
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "backend" ]; then
        echo "  后端 (Backend): $PROJECT_ROOT/platform/backend/dist"
    fi
    if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "frontend" ]; then
        echo "  前端 (Frontend): $PROJECT_ROOT/platform/frontend/dist"
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
  --component <组件>    构建组件 (backend, frontend, all) [默认: all]
  --parallel            并行构建 [默认: true]
  --no-parallel         串行构建
  --clean               清理旧构建
  --verbose             详细输出
  --help                显示此帮助信息

环境要求 (Requirements):
  - Node.js >= 18.0.0
  - pnpm 或 npm
  - TypeScript

构建输出 (Build Output):
  后端: platform/backend/dist/
  前端: platform/frontend/dist/

示例 (Examples):
  # 构建所有组件
  $0 --component all

  # 仅构建后端
  $0 --component backend

  # 清理并重新构建
  $0 --clean

  # 串行构建
  $0 --no-parallel

退出码 (Exit codes):
  0 - 构建成功
  1 - 构建失败

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
            --parallel)
                PARALLEL=true
                shift
                ;;
            --no-parallel)
                PARALLEL=false
                shift
                ;;
            --clean)
                CLEAN=true
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
    echo "AIOpc CI 构建脚本 (CI Build Script)"
    echo "=============================================================================="
    echo "时间戳 (Timestamp): ${TIMESTAMP}"
    echo "组件 (Component): ${COMPONENT}"
    echo "并行构建 (Parallel): ${PARALLEL}"
    echo "清理构建 (Clean): ${CLEAN}"
    echo "=============================================================================="
    echo ""

    # 前置检查
    step "前置检查 (Pre-flight checks)"
    check_command node
    check_command pnpm || check_command npm
    check_node_version
    success "前置检查通过"
    echo ""

    # 执行构建
    if [ "$PARALLEL" = true ]; then
        build_parallel
    else
        if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "backend" ]; then
            build_backend
        fi

        if [ "$COMPONENT" = "all" ] || [ "$COMPONENT" = "frontend" ]; then
            build_frontend
        fi
    fi

    # 验证构建
    verify_builds

    # 打印摘要
    print_summary

    # 返回适当的退出码
    if [ $FAILED_BUILDS -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

#------------------------------------------------------------------------------
# 脚本入口点 (Script Entry Point)
#------------------------------------------------------------------------------

main "$@"
