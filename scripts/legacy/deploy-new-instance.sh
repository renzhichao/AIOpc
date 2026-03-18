#!/bin/bash

# OpenClaw Remote Instance Deployment Script
# 快速部署脚本 - 用于将新服务器接入OpenClaw实例池
#
# Usage:
#   ./deploy-new-instance.sh <new_server_ip> <ssh_key_path> [platform_api_key]
#
# Example:
#   ./deploy-new-instance.sh 101.34.xxx.xxx ~/.ssh/new_server_key

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
PLATFORM_HOST="118.25.0.190"
PLATFORM_WS_PORT="3002"
PLATFORM_API_PORT="3000"
SOURCE_AGENT_HOST="101.34.254.52"  # 现有实例作为模板
SOURCE_AGENT_KEY="~/.ssh/aiopclaw_remote_agent"

# 函数：打印带颜色的消息
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# 函数：执行远程命令
run_remote() {
    local server_ip=$1
    local ssh_key=$2
    local command=$3

    ssh -i "$ssh_key" -o StrictHostKeyChecking=no root@"$server_ip" "$command"
}

# 函数：复制文件到远程服务器
copy_to_remote() {
    local server_ip=$1
    local ssh_key=$2
    local source=$3
    local dest=$4

    scp -i "$ssh_key" -o StrictHostKeyChecking=no "$source" root@"$server_ip":"$dest"
}

# 主部署流程
main() {
    local new_server_ip=$1
    local ssh_key_path=$2
    local platform_api_key=$3

    # 参数验证
    if [ -z "$new_server_ip" ] || [ -z "$ssh_key_path" ]; then
        print_error "Usage: $0 <new_server_ip> <ssh_key_path> [platform_api_key]"
        exit 1
    fi

    # 扩展SSH密钥路径
    if [[ "$ssh_key_path" != /* ]]; then
        ssh_key_path="$HOME/$ssh_key_path"
    fi

    if [ ! -f "$ssh_key_path" ]; then
        print_error "SSH key not found: $ssh_key_path"
        exit 1
    fi

    print_header "OpenClaw Remote Instance Deployment"

    print_info "Target Server: $new_server_ip"
    print_info "SSH Key: $ssh_key_path"
    print_info "Platform: $PLATFORM_HOST"
    echo ""

    # ============ 步骤1: 测试连接 ============
    print_header "Step 1: Testing Connection"

    if run_remote "$new_server_ip" "$ssh_key_path" "echo 'Connection successful'" > /dev/null 2>&1; then
        print_success "SSH connection to $new_server_ip established"
    else
        print_error "Cannot connect to $new_server_ip"
        print_info "Please check:"
        echo "  - Server IP is correct"
        echo "  - SSH key path is correct"
        echo "  - Network connectivity"
        echo "  - Security group allows SSH (port 22)"
        exit 1
    fi

    # ============ 步骤2: 检查环境 ============
    print_header "Step 2: Checking Environment"

    # 检查Node.js
    print_info "Checking Node.js..."
    node_version=$(run_remote "$new_server_ip" "$ssh_key_path" "node -v 2>/dev/null || echo 'not_found'")

    if [ "$node_version" = "not_found" ]; then
        print_warning "Node.js not found. Installing Node.js v22..."
        run_remote "$new_server_ip" "$ssh_key_path" "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -"
        run_remote "$new_server_ip" "$ssh_key_path" "apt-get install -y nodejs"
        print_success "Node.js v22 installed"
    else
        major_version=$(echo "$node_version" | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$major_version" -lt 22 ]; then
            print_warning "Node.js $node_version detected. v22+ required."
            print_info "Installing Node.js v22..."
            run_remote "$new_server_ip" "$ssh_key_path" "curl -fsSL https://deb.nodesource.com/setup_22.x | bash -"
            run_remote "$new_server_ip" "$ssh_key_path" "apt-get install -y nodejs"
            print_success "Node.js v22 installed"
        else
            print_success "Node.js $node_version detected"
        fi
    fi

    # 检查npm
    print_info "Checking npm..."
    npm_version=$(run_remote "$new_server_ip" "$ssh_key_path" "npm -v 2>/dev/null || echo 'not_found'")
    if [ "$npm_version" = "not_found" ]; then
        print_warning "npm not found. Installing..."
        run_remote "$new_server_ip" "$ssh_key_path" "apt-get install -y npm"
    else
        print_success "npm $npm_version detected"
    fi

    # ============ 步骤3: 准备目录 ============
    print_header "Step 3: Creating Directories"

    run_remote "$new_server_ip" "$ssh_key_path" "mkdir -p /opt/openclaw-agent /opt/openclaw-service"
    print_success "Directories created"

    # ============ 步骤4: 从源实例复制代码 ============
    print_header "Step 4: Copying Code from Template Instance"

    print_info "Copying agent code..."
    run_remote "$SOURCE_AGENT_HOST" "$SOURCE_AGENT_KEY" "cat /opt/openclaw-agent/agent-ws-updated.js" > /tmp/agent-ws-updated.js
    copy_to_remote "$new_server_ip" "$ssh_key_path" /tmp/agent-ws-updated.js /opt/openclaw-agent/agent-ws-updated.js
    print_success "Agent code copied"

    print_info "Copying service code..."
    run_remote "$SOURCE_AGENT_HOST" "$SOURCE_AGENT_KEY" "cat /opt/openclaw-service/src/index.js" > /tmp/openclaw-service-index.js
    copy_to_remote "$new_server_ip" "$ssh_key_path" /tmp/openclaw-service-index.js /opt/openclaw-service/src/index.js
    print_success "Service code copied"

    # ============ 步骤5: 配置环境变量 ============
    print_header "Step 5: Configuring Environment"

    # 获取或使用提供的API key
    if [ -z "$platform_api_key" ]; then
        print_warning "No platform_api_key provided"
        print_info "You can generate one from platform or use existing instance's key"

        # 尝试从源实例获取（仅用于测试）
        print_info "Attempting to get API key from template instance..."
        run_remote "$SOURCE_AGENT_HOST" "$SOURCE_AGENT_KEY" "cat /etc/openclaw-agent/credentials.json 2>/dev/null" > /tmp/credentials.json 2>&1 || true

        if [ -s /tmp/credentials.json ]; then
            print_warning "Found credentials in template instance (for testing only)"
            print_warning "In production, generate a unique API key for each instance!"
            platform_api_key=$(cat /tmp/credentials.json | grep -o '"platform_api_key":"[^"]*"' | cut -d'"' -f4 || echo "")
        fi

        if [ -z "$platform_api_key" ]; then
            print_info "Using platform default (will generate during registration)"
            platform_api_key="AUTO_GENERATE"
        fi
    fi

    # 配置Agent环境变量
    print_info "Configuring agent environment..."
    run_remote "$new_server_ip" "$ssh_key_path" "cat > /opt/openclaw-agent/.env <<'EOF'
PLATFORM_URL=http://$PLATFORM_HOST
PLATFORM_WS_URL=ws://$PLATFORM_HOST:$PLATFORM_WS_PORT
PLATFORM_API_KEY=$platform_api_key
EOF"
    print_success "Agent environment configured"

    # 配置Service环境变量（从源实例复制）
    print_info "Configuring service environment..."
    run_remote "$SOURCE_AGENT_HOST" "$SOURCE_AGENT_KEY" "cat /opt/openclaw-service/.env 2>/dev/null || cat /etc/openclaw-service/credentials.json" > /tmp/service_env.txt

    if [ -s /tmp/service_env.txt ]; then
        copy_to_remote "$new_server_ip" "$ssh_key_path" /tmp/service_env.txt /opt/openclaw-service/.env
        print_success "Service environment configured"
    else
        print_warning "Service environment not found in template. Please configure manually."
        run_remote "$new_server_ip" "$ssh_key_path" "cat > /opt/openclaw-service/.env <<'EOF'
PORT=3001
LLM_API_PROVIDER=deepseek
# TODO: Add your API key here
EOF"
    fi

    # ============ 步骤6: 创建Systemd服务 ============
    print_header "Step 6: Creating Systemd Services"

    # Agent服务
    print_info "Creating agent service..."
    run_remote "$new_server_ip" "$ssh_key_path" "cat > /etc/systemd/system/openclaw-agent.service <<'EOF'
[Unit]
Description=OpenClaw Remote Agent (WebSocket-enabled)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/openclaw-agent
EnvironmentFile=/opt/openclaw-agent/.env
ExecStart=/usr/bin/node /opt/openclaw-agent/agent-ws-updated.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=openclaw-agent

[Install]
WantedBy=multi-user.target
EOF"
    print_success "Agent service created"

    # OpenClaw Service服务
    print_info "Creating OpenClaw service..."
    run_remote "$new_server_ip" "$ssh_key_path" "cat > /etc/systemd/system/openclaw-service.service <<'EOF'
[Unit]
Description=OpenClaw AI Agent Service
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/openclaw-service
EnvironmentFile=/opt/openclaw-service/.env
ExecStart=/usr/bin/node /opt/openclaw-service/src/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=openclaw-service

[Install]
WantedBy=multi-user.target
EOF"
    print_success "OpenClaw service created"

    # ============ 步骤7: 启动服务 ============
    print_header "Step 7: Starting Services"

    print_info "Reloading systemd daemon..."
    run_remote "$new_server_ip" "$ssh_key_path" "systemctl daemon-reload"

    print_info "Enabling services..."
    run_remote "$new_server_ip" "$ssh_key_path" "systemctl enable openclaw-agent openclaw-service"

    print_info "Starting services..."
    run_remote "$new_server_ip" "$ssh_key_path" "systemctl start openclaw-agent"
    run_remote "$new_server_ip" "$ssh_key_path" "systemctl start openclaw-service"

    # 等待服务启动
    print_info "Waiting for services to start..."
    sleep 5

    # 检查服务状态
    print_info "Checking service status..."
    agent_status=$(run_remote "$new_server_ip" "$ssh_key_path" "systemctl is-active openclaw-agent" || echo "unknown")
    service_status=$(run_remote "$new_server_ip" "$ssh_key_path" "systemctl is-active openclaw-service" || echo "unknown")

    if [ "$agent_status" = "active" ]; then
        print_success "Agent service is running"
    else
        print_error "Agent service failed to start. Status: $agent_status"
        print_info "Check logs: ssh -i $ssh_key_path root@$new_server_ip 'journalctl -u openclaw-agent -n 50'"
    fi

    if [ "$service_status" = "active" ]; then
        print_success "OpenClaw service is running"
    else
        print_warning "OpenClaw service status: $service_status"
    fi

    # ============ 步骤8: 验证注册 ============
    print_header "Step 8: Verifying Registration"

    print_info "Checking agent logs for registration..."
    sleep 3
    logs=$(run_remote "$new_server_ip" "$ssh_key_path" "journalctl -u openclaw-agent -n 30 --no-pager" || echo "")

    if echo "$logs" | grep -q "Registered to platform"; then
        print_success "Instance registered successfully!"

        # 提取instance_id
        instance_id=$(echo "$logs" | grep -oP 'instance_id[" :]\s*\K[^,]+' || echo "unknown")
        print_info "Instance ID: $instance_id"
    elif echo "$logs" | grep -q "Connected to platform"; then
        print_success "Connected to platform WebSocket"
        print_info "Registration should complete shortly"
    else
        print_warning "Registration status unclear"
        print_info "Recent logs:"
        echo "$logs" | tail -10
    fi

    # ============ 完成 ============
    print_header "Deployment Summary"

    echo ""
    print_success "Deployment completed!"
    echo ""
    echo "📝 Instance Information:"
    echo "  - IP Address: $new_server_ip"
    echo "  - Platform: $PLATFORM_HOST"
    echo "  - SSH Key: $ssh_key_path"
    echo ""
    echo "🔧 Management Commands:"
    echo "  - SSH login: ssh -i $ssh_key_path root@$new_server_ip"
    echo "  - Agent logs: ssh -i $ssh_key_path root@$new_server_ip 'journalctl -u openclaw-agent -f'"
    echo "  - Service logs: ssh -i $ssh_key_path root@$new_server_ip 'journalctl -u openclaw-service -f'"
    echo "  - Restart agent: ssh -i $ssh_key_path root@$new_server_ip 'systemctl restart openclaw-agent'"
    echo "  - Restart service: ssh -i $ssh_key_path root@$new_server_ip 'systemctl restart openclaw-service'"
    echo ""
    echo "✅ Next Steps:"
    echo "  1. Verify instance appears in platform console"
    echo "  2. Test with a sample message"
    echo "  3. Monitor logs for any issues"
    echo ""
}

# 执行主流程
main "$@"
