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

## Task Automation Configuration

The project uses `AUTO_TASK_CONFIG.md` for defining automated task execution patterns. This config:
- Specifies context isolation strategies between tasks
- Defines task state machines and status transitions
- Provides templates for task execution prompts
- Integrates with Git for version-controlled task completion

When working on multi-step implementation tasks, refer to this document for standardized patterns.
