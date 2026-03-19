#!/bin/bash

# 变更管理流程验证脚本
# TASK-008: 变更管理流程文档化 - 验证所有验收标准

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 计数器
total_checks=0
passed_checks=0
failed_checks=0

# 输出函数
print_header() {
    echo ""
    echo "=========================================="
    echo "$1"
    echo "=========================================="
}

print_section() {
    echo ""
    echo -e "${YELLOW}$1${NC}"
    echo "------------------------------------------"
}

print_check() {
    total_checks=$((total_checks + 1))
    local check_name="$1"
    local result="$2"

    if [ "$result" == "PASS" ]; then
        echo -e "${GREEN}✓${NC} $check_name"
        passed_checks=$((passed_checks + 1))
    else
        echo -e "${RED}✗${NC} $check_name"
        failed_checks=$((failed_checks + 1))
    fi
}

# 检查函数
check_file_exists() {
    local file="$1"
    local description="$2"

    if [ -f "$file" ]; then
        print_check "$description" "PASS"
        return 0
    else
        print_check "$description" "FAIL"
        echo "  缺少文件: $file"
        return 1
    fi
}

check_content_exists() {
    local file="$1"
    local pattern="$2"
    local description="$3"

    if [ ! -f "$file" ]; then
        print_check "$description" "FAIL"
        echo "  文件不存在: $file"
        return 1
    fi

    if grep -q "$pattern" "$file"; then
        print_check "$description" "PASS"
        return 0
    else
        print_check "$description" "FAIL"
        echo "  文件中未找到: $pattern"
        return 1
    fi
}

# 主验证流程
main() {
    print_header "变更管理流程验证 (TASK-008)"

    # 1. 变更分类检查 (3 items)
    print_section "1. 变更分类 (Change Classification)"

    check_file_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "变更管理主文档存在"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "标准变更" \
        "包含标准变更定义"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "普通变更" \
        "包含普通变更定义"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "紧急变更" \
        "包含紧急变更定义"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "配置修改" \
        "包含标准变更示例"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "功能部署" \
        "包含普通变更示例"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "关键 Bug 修复" \
        "包含紧急变更示例"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "判断标准" \
        "包含变更类型判断指南"

    # 2. 审批流程检查 (3 items)
    print_section "2. 审批流程 (Approval Process)"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "标准变更.*自动检查" \
        "包含标准变更自动检查流程"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "Tech Lead.*审批" \
        "包含普通变更 Tech Lead 审批流程"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "紧急变更.*事后审批" \
        "包含紧急变更事后审批流程"

    # 3. 变更窗口检查 (2 items)
    print_section "3. 变更窗口 (Change Windows)"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "10:00-16:00" \
        "包含生产环境变更窗口定义"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "节假日" \
        "包含节假日变更限制说明"

    # 4. 变更文档检查 (3 items)
    print_section "4. 变更文档 (Change Documentation)"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "变更分类" \
        "主文档包含变更分类说明"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "审批流程" \
        "主文档包含审批流程说明"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "变更窗口" \
        "主文档包含变更窗口说明"

    # 5. 变更模板检查 (3 items)
    print_section "5. 变更模板 (Change Templates)"

    check_file_exists \
        "docs/changes/CHANGE_REQUEST_TEMPLATE.md" \
        "变更请求模板存在"

    check_content_exists \
        "docs/changes/CHANGE_REQUEST_TEMPLATE.md" \
        "变更描述" \
        "变更请求模板包含变更描述字段"

    check_content_exists \
        "docs/changes/CHANGE_REQUEST_TEMPLATE.md" \
        "风险评估" \
        "变更请求模板包含风险评估字段"

    check_content_exists \
        "docs/changes/CHANGE_REQUEST_TEMPLATE.md" \
        "回滚计划" \
        "变更请求模板包含回滚计划字段"

    check_file_exists \
        "docs/changes/CHANGE_RECORD_TEMPLATE.md" \
        "变更记录模板存在"

    check_content_exists \
        "docs/changes/CHANGE_RECORD_TEMPLATE.md" \
        "执行记录" \
        "变更记录模板包含执行记录字段"

    check_content_exists \
        "docs/changes/CHANGE_RECORD_TEMPLATE.md" \
        "验证结果" \
        "变更记录模板包含验证结果字段"

    # 6. 回滚程序检查 (3 items)
    print_section "6. 回滚程序 (Rollback Procedures)"

    check_file_exists \
        "docs/operations/CHANGE_MANAGEMENT_ROLLBACK.md" \
        "回滚程序文档存在"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT_ROLLBACK.md" \
        "回滚触发条件" \
        "包含回滚触发条件定义"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT_ROLLBACK.md" \
        "回滚执行步骤" \
        "包含回滚执行步骤文档化"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT_ROLLBACK.md" \
        "回滚验证" \
        "包含回滚验证流程说明"

    # 7. 额外质量检查
    print_section "7. 额外质量检查 (Additional Quality Checks)"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "变更类型.*快速判断" \
        "包含变更类型快速判断指南"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "常见问题" \
        "包含常见问题解答"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "最佳实践" \
        "包含最佳实践指南"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "相关文档" \
        "包含相关文档引用"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT_ROLLBACK.md" \
        "常见回滚场景" \
        "包含常见回滚场景处理"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT_ROLLBACK.md" \
        "回滚最佳实践" \
        "包含回滚最佳实践"

    check_content_exists \
        "docs/changes/CHANGE_REQUEST_TEMPLATE.md" \
        "测试计划" \
        "变更请求模板包含测试计划字段"

    check_content_exists \
        "docs/changes/CHANGE_REQUEST_TEMPLATE.md" \
        "影响分析" \
        "变更请求模板包含影响分析字段"

    # 8. 格式和结构检查
    print_section "8. 格式和结构检查 (Format and Structure)"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "## 目录" \
        "主文档包含目录结构"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "文档版本" \
        "主文档包含版本信息"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "最后更新" \
        "主文档包含更新时间"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT_ROLLBACK.md" \
        "## 目录" \
        "回滚文档包含目录结构"

    check_content_exists \
        "docs/changes/CHANGE_REQUEST_TEMPLATE.md" \
        "变更 ID" \
        "变更请求模板包含 ID 字段"

    check_content_exists \
        "docs/changes/CHANGE_RECORD_TEMPLATE.md" \
        "变更状态" \
        "变更记录模板包含状态字段"

    # 9. 实用性检查
    print_section "9. 实用性检查 (Practicality Check)"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "示例" \
        "主文档包含实际示例"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "检查清单" \
        "主文档包含检查清单"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT_ROLLBACK.md" \
        "回滚脚本" \
        "回滚文档包含脚本示例"

    check_content_exists \
        "docs/changes/CHANGE_REQUEST_TEMPLATE.md" \
        "\[ \]" \
        "变更请求模板包含复选框"

    check_content_exists \
        "docs/changes/CHANGE_RECORD_TEMPLATE.md" \
        "执行日志" \
        "变更记录模板包含日志记录"

    # 10. 集成检查
    print_section "10. 集成检查 (Integration Check)"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "ONCALL.md" \
        "主文档引用 On-Call 文档"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "INCIDENT_RESPONSE.md" \
        "主文档引用事故响应文档"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT.md" \
        "QUALITY_GATE.md" \
        "主文档引用质量门禁文档"

    check_content_exists \
        "docs/operations/CHANGE_MANAGEMENT_ROLLBACK.md" \
        "CHANGE_MANAGEMENT.md" \
        "回滚文档引用主文档"

    # 输出总结
    print_header "验证总结"

    echo -e "总检查项: ${YELLOW}$total_checks${NC}"
    echo -e "通过项: ${GREEN}$passed_checks${NC}"
    echo -e "失败项: ${RED}$failed_checks${NC}"

    local pass_rate=0
    if [ $total_checks -gt 0 ]; then
        pass_rate=$((passed_checks * 100 / total_checks))
    fi

    echo -e "通过率: ${YELLOW}${pass_rate}%${NC}"

    if [ $failed_checks -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✓ 所有验收标准已满足！${NC}"
        echo ""
        echo "TASK-008 变更管理流程文档化已完成，包括："
        echo "  ✓ 变更分类定义（标准/普通/紧急）"
        echo "  ✓ 审批流程（自动/Tech Lead/事后）"
        echo "  ✓ 变更窗口（10:00-16:00，节假日限制）"
        echo "  ✓ 变更模板（请求+记录）"
        echo "  ✓ 回滚程序（完整流程）"
        echo "  ✓ 实际示例和检查清单"
        echo "  ✓ 与现有文档集成"
        return 0
    else
        echo ""
        echo -e "${RED}✗ 有 $failed_checks 项验收标准未满足${NC}"
        echo ""
        echo "请检查上述失败项并完善相应文档。"
        return 1
    fi
}

# 运行主函数
main
