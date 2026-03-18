# Backend Deployment Checklist

**🔴 CRITICAL**: This checklist MUST be followed for EVERY backend deployment to prevent configuration regression.

## Pre-Deployment Checks

### 1. Backup Running Configuration
```bash
# MANDATORY: Always backup before deployment
docker exec opclaw-backend printenv > /tmp/backend_env_backup_$(date +%s).txt
```

### 2. Verify Current Container Status
```bash
# Check running container
docker ps | grep opclaw-backend

# Check health status
curl http://localhost:3000/health
```

### 3. Build New Image
```bash
# From local machine
cd /Users/arthurren/projects/AIOpc/platform/backend
pnpm run build

# Create deployment tar with CORRECT structure
tar -czf /tmp/platform-dist.tar.gz -C dist .

# Copy to server
scp -i ~/.ssh/rap001_opclaw /tmp/platform-dist.tar.gz root@118.25.0.190:/tmp/
```

## Deployment Steps

### 1. Stop and Remove Old Container
```bash
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker stop opclaw-backend && docker rm opclaw-backend"
```

### 2. Create New Container WITH ALL Environment Variables
```bash
# ✅ CORRECT - All 15+ required variables
docker run -d --name opclaw-backend \
  --network opclaw_opclaw-network \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=opclaw \
  -e DB_USER=opclaw \
  -e DB_PASSWORD=gjb5eSN1tE5XQkBV1uLoAeV4FcIZuuaPSiMZDSCDsKE= \
  -e REDIS_HOST=redis \
  -e REDIS_PORT=6379 \
  -e REDIS_PASSWORD=s+lyiw+OtGhigMF3cjD1WN8AJoi913XCbKTLyx8phgc= \
  -e JWT_SECRET=suNsfjHj2nwpvIUT/gB4UZSETSaAnOVCnoylIp4Oo6HiVz/b0Yh/hRA1fQGa/a0U \
  -e JWT_EXPIRES_IN=7d \
  -e FEISHU_APP_ID=cli_a93ce5614ce11bd6 \
  -e FEISHU_APP_SECRET=L0cHQDBbEiIys6AHW53miecONb1xA4qy \
  -e FEISHU_REDIRECT_URI=http://localhost:3000/oauth/callback \
  -e FEISHU_ENCRYPT_KEY=SYwbCzUAJQEgSwX/QM0BNHr+Dbcvsmyw+luH5m4qQRI= \
  -e FEISHU_VERIFICATION_TOKEN=33b5d601e31c382b663bb6aacfa60be4 \
  -e LOG_LEVEL=info \
  -e REMOTE_WS_PORT=3002 \
  platform-backend:latest
```

## Post-Deployment Verification

### 1. Verify Environment Variables (MANDATORY)
```bash
# Check all critical variables are present
docker exec opclaw-backend printenv | grep -E 'FEISHU|JWT|DB_|REDIS'

# Expected output MUST include:
# - JWT_SECRET=...
# - FEISHU_APP_ID=cli_a93ce5614ce11bd6
# - FEISHU_APP_SECRET=...
# - DB_HOST=postgres
# - REDIS_HOST=redis
```

### 2. Health Check
```bash
# Check API health
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","database":"connected","redis":"connected"}
```

### 3. OAuth Verification
```bash
# Check OAuth service is configured
docker logs opclaw-backend --tail 50 | grep -i "missing.*environment"

# Expected: NO ERRORS about missing JWT_SECRET, FEISHU_APP_ID, etc.
```

### 4. Test Critical Endpoints
```bash
# Health endpoint
curl http://localhost:3000/health

# OAuth initiate (should work without errors)
curl -X POST http://localhost:3000/api/oauth/initiate
```

## Rollback Procedure (If Verification Fails)

```bash
# 1. Stop failed container
docker stop opclaw-backend
docker rm opclaw-backend

# 2. Restore from backup env file
source /tmp/backend_env_backup_<timestamp>.txt

# 3. Recreate with all variables (same as deployment step 2)
# [Use deployment command with all env variables]

# 4. Verify restoration
docker exec opclaw-backend printenv | grep -E 'FEISHU|JWT'
curl http://localhost:3000/health
```

## Required Environment Variables Reference

**Database (5 variables):**
- DB_HOST=postgres
- DB_PORT=5432
- DB_NAME=opclaw
- DB_USER=opclaw
- DB_PASSWORD=...

**Redis (3 variables):**
- REDIS_HOST=redis
- REDIS_PORT=6379
- REDIS_PASSWORD=...

**JWT (2 variables):**
- JWT_SECRET=...
- JWT_EXPIRES_IN=7d

**Feishu OAuth (5 variables):**
- FEISHU_APP_ID=cli_a93ce5614ce11bd6
- FEISHU_APP_SECRET=...
- FEISHU_REDIRECT_URI=...
- FEISHU_ENCRYPT_KEY=...
- FEISHU_VERIFICATION_TOKEN=...

**Other:**
- NODE_ENV=production
- LOG_LEVEL=info
- REMOTE_WS_PORT=3002

## Regression History

| Date | Issue | Root Cause | Resolution |
|------|-------|------------|------------|
| 2026-03-18 | OAuth login fails | Missing environment variables (JWT_SECRET, FEISHU_APP_ID, FEISHU_APP_SECRET) | Recreated container with all 15+ env variables |
| ... | ... | ... | ... |

## Common Mistakes to Avoid

❌ **WRONG**: Only passing NODE_ENV
```bash
docker run -d -e NODE_ENV=production ...
```

✅ **CORRECT**: Passing ALL required variables
```bash
docker run -d \
  -e NODE_ENV=production \
  -e JWT_SECRET=... \
  -e FEISHU_APP_ID=... \
  -e FEISHU_APP_SECRET=... \
  ... # All 15+ variables
```

❌ **WRONG**: Not verifying env variables after deployment

✅ **CORRECT**: Always verify critical variables are present
```bash
docker exec opclaw-backend printenv | grep -E 'FEISHU|JWT'
```

❌ **WRONG**: No backup before deployment

✅ **CORRECT**: Always backup running container env first
```bash
docker exec opclaw-backend printenv > /tmp/backup_$(date +%s).txt
```
