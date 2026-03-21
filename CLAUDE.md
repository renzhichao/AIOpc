# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AIOpc is an AI infrastructure platform transitioning from **local deployment** to **cloud SaaS**. The project deploys OpenClaw AI Agent framework (based on DeepSeek-V3/Qwen LLMs) to provide intelligent agent services. Currently in **planning phase** with documentation only - no production code exists yet.

### Dual Deployment Strategy

The project supports **two deployment models**:

1. **Local Deployment** (Original): 4-server on-premise deployment for enterprises (50-200 users)
2. **Cloud SaaS** (New Focus): "Scan-to-Enable" Docker instances with Feishu OAuth for individual users and small teams

### Key Information

- **Current State**: Documentation and planning only - no implementation code
- **Primary Language**: Chinese (documentation and configuration)
- **LLM Provider**: DeepSeek API (external service)
- **Target Users**:
  - Local: Medium enterprises (50-200 users)
  - Cloud: Individual users and small teams (1-50 users)

## Architecture Overview

### Local Deployment Architecture

```
Users (Internal Network/VPN)
         ↓
    Nginx (Reverse Proxy)
         ↓
┌────────┼────────┬──────────┐
│        │        │          │
Server 1 Server 2 Server 3 Server 4
(Main)   (Agent)  (Agent)  (Data+Monitor)
         │        │          │
         └────────┴──────────┴──→ PostgreSQL, Redis, Prometheus, Grafana
```

### Cloud SaaS Architecture (Planned)

```
┌─────────────────────────────────────────────┐
│              Users (Feishu/Web)             │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│         Platform (Node.js + Express)        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Web UI   │  │ OAuth    │  │ Instance │  │
│  │          │  │ (Feishu) │  │ Manager  │  │
│  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│         Docker Host(s)                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Instance │  │ Instance │  │ Instance │  │
│  │   #1     │  │   #2     │  │   #3     │  │
│  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────┘
```

### Core Components

1. **OpenClaw Framework** (External, Node.js v22)
   - AI Agent runtime with 25 Tools and 53 Skills
   - Session and memory management
   - Multi-agent orchestration
   - Deployed separately - this repo contains planning/config only

2. **Four Specialized Agents** (Local Deployment):
   - **Finance Agent** (财务Agent): Financial reports, expense auditing, invoice OCR
   - **Operations Agent** (运营Agent): Order analysis, customer service, product selection
   - **Knowledge Agent** (知识Agent): Knowledge base Q&A, document search, training
   - **Data Agent** (数据Agent): Data analysis, trend prediction, automated reports

3. **Cloud Platform Components** (Planned):
   - OAuth 2.0 integration with Feishu (扫码认领)
   - Docker instance lifecycle management
   - API Key pool management (platform-provided DeepSeek keys)
   - QR code generation and validation
   - Multi-tenant container orchestration

4. **Infrastructure Stack**:
   - PostgreSQL: Agent memory, knowledge base, and platform data
   - Redis: Session state, caching, and message queues
   - Nginx: Reverse proxy and SSL termination
   - Prometheus + Grafana: Monitoring and visualization

## Development Commands

### Local Deployment (Current)

```bash
# Automated deployment (recommended)
sudo ./scripts/deploy-local.sh

# Manual deployment using Docker Compose
cd deployment
docker compose up -d

# View container status
docker ps | grep opclaw

# View logs
docker logs -f opclaw-agent
docker logs -f opclaw-postgres
docker logs -f opclaw-redis

# Restart services
docker restart opclaw-agent

# Stop all services
docker compose -f deployment/docker-compose.yml down
```

### Platform Development (Planned - Not Yet Implemented)

The cloud platform is in planning phase. Refer to:
- `docs/fips/FIP_001_scan_to_enable.md` - Technical implementation plan
- `docs/requirements/core_req_001.md` - Core requirements document

When implementation begins, the platform will use:
- **Frontend**: React + TypeScript (Vite)
- **Backend**: Node.js + Express + TypeScript
- **Container**: Docker with Dockerode for programmatic control

The deployment script (`scripts/deploy-local.sh`) handles:
- OS detection (Ubuntu/Debian/CentOS/RHEL)
- Docker and Docker Compose installation
- Node.js v22 and pnpm setup
- PostgreSQL, Redis, and Nginx deployment
- SSL certificate generation (self-signed for internal use)
- Firewall configuration (UFW or firewalld)
- Directory structure creation at `/opt/opclaw`, `/etc/opclaw`, `/var/lib/opclaw`

### Environment Configuration

Primary configuration file: `/etc/opclaw/.env` (created by deployment script)

**Required variables**:
- `DEEPSEEK_API_KEY`: DeepSeek API key for LLM inference
- `POSTGRES_PASSWORD`: PostgreSQL database password
- `REDIS_PASSWORD`: Redis cache password

**Optional variables**:
- `FEISHU_APP_ID` and `FEISHU_APP_SECRET`: Feishu integration
- `INTERNAL_IP`: Internal network IP address
- `AGENT_PORT`: Agent service port (default: 3000)

### Database Operations

```bash
# Access PostgreSQL
docker exec -it opclaw-postgres psql -U opclaw -d opclaw

# Backup database
docker exec opclaw-postgres pg_dump -U opclaw opclaw | gzip > backup.sql.gz

# Restore database
gunzip < backup.sql.gz | docker exec -i opclaw-postgres psql -U opclaw opclaw
```

### Health Check

```bash
# API health check
curl http://localhost:3000/health

# Verify all containers running
docker ps | grep opclaw

# Access monitoring dashboards
# Prometheus: http://<internal-ip>:9090
# Grafana: http://<internal-ip>:3001
```

## Project Structure

```
AIOpc/
├── docs/                          # Technical documentation
│   ├── 01-technical-architecture-local.md   # Local deployment architecture
│   ├── 05-agent-roles.md                    # Agent roles and maintenance
│   ├── 06-cost-model-local.md               # Cost analysis
│   ├── 07-local-deployment-guide.md         # Deployment guide
│   ├── requirements/                        # Requirements documents
│   │   ├── core_req_001.md                  # Cloud SaaS requirements
│   │   └── core_req_details_001.md          # Detailed requirements
│   ├── fips/                                # Feature Implementation Proposals
│   │   └── FIP_001_scan_to_enable.md        # Scan-to-enable feature plan
│   └── AUTO_TASK_CONFIG.md                  # Task automation configuration
├── scripts/                       # Deployment and automation scripts
│   ├── deploy-local.sh            # Local deployment automation
│   └── deploy.sh                  # Cloud deployment (reference)
├── deployment/                    # Docker Compose configurations
│   ├── docker-compose.yml         # Service orchestration
│   ├── nginx.conf                 # Nginx configuration (generated)
│   └── ssl/                       # SSL certificates (generated)
├── config/                        # Configuration files (placeholder)
│   ├── agents/                    # Agent configurations (YAML)
│   ├── skills/                    # Skill definitions (YAML)
│   └── knowledge/                 # Knowledge base configs
├── platform/                      # Management platform (placeholder, to be developed)
├── knowledge/                     # Knowledge base storage (placeholder, to be populated)
├── claudedocs/                    # Claude Code generated documentation
└── CLAUDE.md                      # This file
```

## Agent Configuration System

Agent configurations (when implemented) will use YAML files in `config/agents/` defining:

- **Tools**: File operations, web access, command execution (with approval)
- **Skills**: Domain-specific capabilities (e.g., `excel_analysis`, `customer_service`)
- **Knowledge Base**: Domain-specific document repositories
- **Permissions**: User and group access controls
- **System Prompts**: Role-specific instructions

### Agent Types

| Agent | Purpose | Key Skills |
|-------|---------|------------|
| Finance (财务) | Financial reports, auditing | `excel_analysis`, `report_generation`, `invoice_ocr` |
| Operations (运营) | Order analysis, customer service | `customer_service`, `market_analysis`, `content_generation` |
| Knowledge (知识) | Internal knowledge Q&A | `knowledge_base`, `document_search`, `training_assistant` |
| Data (数据) | Analytics and forecasting | `python_scripting`, `statistical_analysis`, `trend_prediction` |

## Key Architecture Decisions

### Local Deployment Rationale

1. **Cost Efficiency**: 81% reduction in infrastructure costs vs cloud-only
2. **Data Sovereignty**: Core data remains on-premise
3. **Performance**: Lower latency for internal network access
4. **Compliance**: Easier to meet data protection requirements

### Cloud SaaS Transition Rationale

Based on `docs/requirements/core_req_001.md`:
- **Deployment barrier too high**: 4 servers + 2-4 weeks deployment time
- **User demand for simplicity**: "Scan-to-enable" with Feishu OAuth
- **Market expansion**: Individual users and small teams (1-50 users)
- **Cost flexibility**: Pay-per-use vs upfront infrastructure investment

### Security Architecture (Three-Layer Defense)

1. **Layer 1 - Core Capabilities** (all agents): `read`, `write`, `web_search`, `memory`
2. **Layer 2 - Advanced Capabilities** (approval-gated): `exec`, `web_fetch`, `cron`
3. **Layer 3 - Skills Whitelist** (minimum required per agent role)

### Network Configuration

- **Local Internal Network**: 192.168.1.0/24
- **VPN Access**: WireGuard recommended for remote access
- **Feishu Integration**: Requires polling or tunnel for internal network access

## Important Notes

- **This is a documentation and planning repository** - actual OpenClaw code is deployed separately
- **No production code exists yet** for the cloud platform - planning phase only
- Most directories (`config/`, `platform/`, `knowledge/`) are placeholders for future development
- The deployment script (`deploy-local.sh`) is the primary operational tool for local deployment
- All documentation is in Chinese - maintain language consistency when updating technical docs
- Cost model assumes 4+ existing servers for local deployment; adjust projections if hardware differs
- DeepSeek API is the only external dependency after local deployment

## Troubleshooting

**Common Issues**:

1. **Container won't start**: Check logs with `docker logs <container-name>`
2. **Database connection failed**: Verify PostgreSQL container is running and password in `/etc/opclaw/.env` is correct
3. **Agent response slow**: Check resource usage with `htop` and consider enabling Redis caching
4. **VPN connection issues**: Verify WireGuard configuration and firewall rules

**Log Locations**:
- Agent logs: `/var/log/opclaw/` or `docker logs opclaw-agent`
- System logs: `/var/log/syslog`

## Cost Reference

**Local Deployment Annual Costs**:
- Infrastructure: ¥7,100-12,100 (electricity, maintenance)
- LLM API: ¥500-1,500 (DeepSeek)
- Personnel: ¥132,000-264,000 (0.5-1 FTE)
- **Total**: ¥148,600-292,600/year (39-44% savings vs cloud)

**Cloud SaaS Costs** (Planned):
- Infrastructure: ¥1,610/month (ECS + RDS + Redis + OSS)
- LLM API: ¥500-1,500/month (platform-provided pool)
- Per-instance cost: ¥21-31/month
- Target pricing: ¥49-299/month per instance

## Production Deployment & Configuration Safety Rules

**🔴 CRITICAL**: These rules MUST be followed for ANY production environment configuration changes to prevent regression and configuration loss.

### Configuration Change Validation (CRITICAL)

**MANDATORY PRE-CHANGE CHECKLIST**:
1. **Backup Running Configuration First**:
   ```bash
   # MUST: Backup current container environment BEFORE any changes
   docker inspect <container-name> --format='{{json .Config.Env}}' > /tmp/env_backup_$(date +%s).json
   # OR
   docker exec <container-name> printenv > /tmp/env_backup_$(date +%s).txt
   ```

2. **Validate Configuration Source**:
   - NEVER assume the first `.env` file found is the correct one
   - Check for multiple config files: `find /opt -name '.env*' -type f`
   - Compare with running container's actual values
   - Verify config file timestamps match deployment time

3. **Placeholder Detection** (MANDATORY):
   ```bash
   # MUST: Check for placeholder values before applying config
   grep -E 'cli_xxxxxxxxxxxxx|CHANGE_THIS|your_|placeholder' <config_file>
   # If found: DO NOT APPLY - find the real config source
   ```

4. **Incremental Changes Only**:
   - Only modify the specific environment variables that need to change
   - Preserve ALL existing environment variables from running container
   - Never use a clean slate approach with production containers

### Server Configuration File Priority (Platform Server)

**Known Configuration Locations** (118.25.0.190 platform server):
- ✅ **PRIMARY**: `/opt/opclaw/platform/.env.production` (REAL production config)
- ⚠️ **OBSOLETE**: `/opt/opclaw/.env.production` (Contains placeholders only)
- 📄 **REFERENCE**: `/opt/opclaw/backend/.env.production.example` (Template only)

**Key Production Secrets** (118.25.0.190):
- `FEISHU_APP_ID=cli_a93ce5614ce11bd6`
- `FEISHU_APP_SECRET=L0cHQDBbEiIys6AHW53miecONb1xA4qy`
- `JWT_SECRET=suNsfjHj2nwpvIUT/gB4UZSETSaAnOVCnoylIp4Oo6HiVz/b0Yh/hRA1fQGa/a0U`

### Server Access Information

**🔴 CRITICAL**: All server SSH access is documented below. NEVER attempt to access servers without verifying correct SSH key.

#### Platform Server (118.25.0.190)
```bash
# SSH Access
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190

# Local SSH Key Location
~/.ssh/rap001_opclaw (3.3K, created Mar 16 14:12)

# Key Verification (Fingerprint)
ssh-keygen -l -f ~/.ssh/rap001_opclaw
# Expected: 4096 SHA256:M471M+QScAc+MZcNf5McOBlrDwLeWC1Gq97/OLwlz4A root@VM-4-12-ubuntu (RSA)
```

**Platform Server Configuration Files**:
- ✅ **PRIMARY**: `/opt/opclaw/platform/.env.production` (REAL production config)
- ⚠️ **OBSOLETE**: `/opt/opclaw/.env.production` (Contains placeholders only)
- 📄 **REFERENCE**: `/opt/opclaw/backend/.env.production.example` (Template only)

**Key Production Secrets** (118.25.0.190):
- `FEISHU_APP_ID=cli_a93ce5614ce11bd6`
- `FEISHU_APP_SECRET=L0cHQDBbEiIys6AHW53miecONb1xA4qy`
- `JWT_SECRET=suNsfjHj2nwpvIUT/gB4UZSETSaAnOVCnoylIp4Oo6HiVz/b0Yh/hRA1fQGa/a0U`

#### Remote Agent Server (101.34.254.52)
```bash
# SSH Access
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52

# Local SSH Key Location
~/.ssh/aiopclaw_remote_agent (432B, created Mar 16 22:11)
~/.ssh/aiopclaw_remote_agent.pub (117B, public key)

# Key Verification (Fingerprint)
ssh-keygen -l -f ~/.ssh/aiopclaw_remote_agent
# Expected: 256 SHA256:uyWNpQAw7YIukmqXxiKz+NoemyM5RYIsQiBGP7Nis3k aiopclaw-remote-agent@101.34.254.52 (ED25519)

# Quick Commands
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "systemctl status openclaw-agent"
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "tail -f /var/log/openclaw-agent.log"
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "cat /etc/openclaw-agent/credentials.json"
```

**Remote Agent Configuration Files**:
- Agent program: `/opt/openclaw-agent/agent.js`
- Credentials: `/etc/openclaw-agent/credentials.json`
- Systemd service: `/etc/systemd/system/openclaw-agent.service`
- Log file: `/var/log/openclaw-agent.log`

#### CIIBER Tenant Server (113.105.103.165)
```bash
# SSH Access
ssh -i ~/.ssh/ciiber_key -p 20122 openclaw@113.105.103.165

# Local SSH Key Location
~/.ssh/ciiber_key

# Sudo Password (for privilege escalation)
openclaw

# Quick Commands
ssh -i ~/.ssh/ciiber_key -p 20122 openclaw@113.105.103.165 "docker ps"
ssh -i ~/.ssh/ciiber_key -p 20122 openclaw@113.105.103.165 "sudo systemctl restart docker"
```

**CIIBER Server Configuration Files**:
- Docker config: `/etc/docker/daemon.json` (owned by openclaw user)
- Tenant config: `config/tenants/CIIBER.yml`
- Deploy path: `/opt/opclaw/platform`

### Quick Reference Commands

**Platform Operations** (118.25.0.190):
```bash
# Check backend container logs
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker logs opclaw-backend --tail 50"

# Check all platform containers
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker ps | grep opclaw"

# Restart backend service
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker restart opclaw-backend"
```

**Agent Operations** (101.34.254.52):
```bash
# View agent logs
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "journalctl -u openclaw-agent -f"

# Restart agent service
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "systemctl restart openclaw-agent"

# Force re-register (delete credentials)
ssh -i ~/.ssh/aiopclaw_remote_agent root@101.34.254.52 "rm /etc/openclaw-agent/credentials.json && systemctl restart openclaw-agent"
```

### Environment Variable Change Pattern

**CORRECT APPROACH**:
```bash
# 1. Backup running config
docker exec opclaw-backend printenv > /tmp/backend_env_backup.txt

# 2. Extract needed values from backup or source of truth
# 3. Re-create container with ALL existing + new variables
docker stop opclaw-backend && docker rm opclaw-backend
docker run -d --name opclaw-backend \
  --network opclaw_opclaw-network --restart unless-stopped \
  [ALL EXISTING VARIABLES FROM BACKUP] \
  [ONLY THE SPECIFIC VARIABLES BEING CHANGED] \
  opclaw-backend:latest

# 4. Verify applied config matches expectation
docker exec opclaw-backend printenv | grep -E 'FEISHU|JWT|DB_'
```

**WRONG APPROACH** (NEVER DO THIS):
```bash
# ❌ Reading from unverified config file
source /opt/opclaw/.env.production  # May contain placeholders!

# ❌ Not backing up running config first
# ❌ Using placeholder values
# ❌ Not comparing with actual running values
```

### Regression Prevention

**Before Applying Any Config Change**:
1. ✅ Backup running container environment
2. ✅ Verify config values are not placeholders
3. ✅ Cross-reference with multiple sources if uncertain
4. ✅ Apply only the specific delta (not full replacement)
5. ✅ Verify after change (compare before/after)
6. ✅ Keep backup until change is confirmed working

**Post-Change Validation**:
```bash
# Verify critical services still work
curl http://localhost:3000/health
docker logs <container> --tail 50
```

### Incident Response: Configuration Restoration

If configuration regression occurs:
1. **STOP**: Do not make further changes
2. **RESTORE**: Apply backup from `/tmp/env_backup_*`
3. **VERIFY**: Confirm service health
4. **ANALYZE**: Identify root cause before retry
5. **DOCUMENT**: Update this file with lessons learned

### Reference: Regression Incident (2026-03-17)

**Issue**: OAuth configuration replaced with placeholders during troubleshooting
**Root Cause**: Read from wrong config file (`/opt/opclaw/.env.production` instead of `/opt/opclaw/platform/.env.production`)
**Resolution**: Restored from correct source file
**Lesson Learned**: Always validate config source against running container's actual values

---

## Task Automation Configuration

The project uses `AUTO_TASK_CONFIG.md` for defining automated task execution patterns. This config:
- Specifies context isolation strategies between tasks
- Defines task state machines and status transitions
- Provides templates for task execution prompts
- Integrates with Git for version-controlled task completion

When working on multi-step implementation tasks, refer to this document for standardized patterns.
