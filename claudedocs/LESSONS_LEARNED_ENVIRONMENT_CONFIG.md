# Lessons Learned: Environment Configuration Management

**Date**: 2026-03-17
**Issue**: Repeated environment variable configuration errors when recreating backend containers
**Severity**: High (causes service downtime)
**Status**: Resolved with standardized recovery script

---

## Problem Description

### Issue Summary
When recreating the backend container during troubleshooting, environment variables were repeatedly missed, causing service failures:

1. **First Occurrence** (2026-03-17): Missing database credentials (DB_PASSWORD, DB_USERNAME, DB_NAME)
   - Error: `Database connection failed - password authentication failed`
   - Impact: TypeORM entity metadata not loaded, "No metadata for Instance" errors

2. **Second Occurrence** (2026-03-17): Missing Feishu OAuth configuration (9 variables)
   - Error: `Missing required environment variables: FEISHU_APP_ID, FEISHU_REDIRECT_URI...`
   - Impact: OAuth login API returns 500, users cannot authenticate

### Root Causes

#### 1. **Manual Command Construction**
```bash
# ❌ PROBLEMATIC APPROACH - Manual construction
docker run -d \
  --name opclaw-backend \
  --network opclaw_opclaw-network \
  -e DB_HOST=postgres \
  -e DB_PASSWORD=xxx \
  -e REDIS_PASSWORD=xxx \
  # FORGOT: 9 Feishu OAuth variables!
  # FORGOT: JWT_SECRET, SESSION_SECRET, etc.
  platform-backend
```

**Why this fails**:
- Human memory is unreliable for 21+ variables
- Easy to miss variables when copy-pasting
- No validation until service fails
- Different each time (not reproducible)

#### 2. **Incomplete Environment File**
Original `.env` file only contained:
```
POSTGRES_PASSWORD=0plm9okn
REDIS_PASSWORD=2wsx3edc
FEISHU_APP_ID=cli_a93ce5614ce11bd6
FEISHU_APP_SECRET=L0cHQDBbEiIys6AHW63miecONb1xA4qy
DEEPSEEK_API_KEY=sk-xxx
```

**Missing variables**:
- DB_HOST, DB_PORT, DB_NAME, DB_USERNAME
- REDIS_HOST, REDIS_PORT
- NODE_ENV, PORT, LOG_LEVEL
- JWT_SECRET, SESSION_SECRET, ENCRYPTION_KEY
- OAuth URLs (4 variables)

#### 3. **Not Following Documented Procedures**
- `DEPLOYMENT.md` already had a recovery script template (lines 82-138)
- The script uses `--env-file` to load all variables at once
- Instead of using the documented approach, manual commands were constructed

---

## Solution Implemented

### 1. Standardized Recovery Script
**Location**: `/opt/opclaw/scripts/restart-backend.sh`

**Features**:
- ✅ Verifies all 21 required environment variables before starting
- ✅ Uses `--env-file` to load variables atomically
- ✅ Validates database connection
- ✅ Validates OAuth API functionality
- ✅ Validates health endpoint
- ✅ Provides clear error messages with troubleshooting hints

**Usage**:
```bash
# Local execution
bash /opt/opclaw/scripts/restart-backend.sh

# Remote execution
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "bash /opt/opclaw/scripts/restart-backend.sh"
```

### 2. Complete Environment File
**Location**: `/opt/opclaw/.env.production`

**Contains all 21 required variables**:
- Database: DB_HOST, DB_PORT, DB_NAME, DB_USERNAME, DB_PASSWORD
- Redis: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD
- Application: NODE_ENV, PORT, LOG_LEVEL
- Security: JWT_SECRET, SESSION_SECRET, ENCRYPTION_KEY
- Feishu OAuth: 9 variables (APP_ID, APP_SECRET, REDIRECT_URI, URLs, etc.)
- LLM API: DEEPSEEK_API_KEY, OPENROUTER_API_KEY, OPENROUTER_MODEL

### 3. Updated Documentation
- `DEPLOYMENT.md` updated to emphasize using the standardized script
- Added clear warnings against manual command construction
- Included remote execution example

---

## Required Environment Variables Checklist

When recreating backend container, verify ALL 21 variables are present:

### Database (5 variables)
- [ ] `DB_HOST=postgres`
- [ ] `DB_PORT=5432`
- [ ] `DB_NAME=opclaw`
- [ ] `DB_USERNAME=opclaw`
- [ ] `DB_PASSWORD=<from postgres container>`

### Redis (3 variables)
- [ ] `REDIS_HOST=redis`
- [ ] `REDIS_PORT=6379`
- [ ] `REDIS_PASSWORD=<from redis container>`

### Application (3 variables)
- [ ] `NODE_ENV=production`
- [ ] `PORT=3000`
- [ ] `LOG_LEVEL=debug`

### Security (3 variables)
- [ ] `JWT_SECRET=<32+ chars>`
- [ ] `SESSION_SECRET=<32+ chars>`
- [ ] `ENCRYPTION_KEY=<32+ chars>`

### Feishu OAuth (9 variables)
- [ ] `FEISHU_APP_ID`
- [ ] `FEISHU_APP_SECRET`
- [ ] `FEISHU_REDIRECT_URI`
- [ ] `FEISHU_OAUTH_AUTHORIZE_URL`
- [ ] `FEISHU_OAUTH_TOKEN_URL`
- [ ] `FEISHU_OAUTH_USERINFO_URL`
- [ ] `FEISHU_VERIFY_TOKEN`
- [ ] `FEISHU_ENCRYPT_KEY`

### LLM API (2 variables)
- [ ] `DEEPSEEK_API_KEY`
- [ ] `OPENROUTER_API_KEY`
- [ ] `OPENROUTER_MODEL`

---

## Prevention Measures

### 1. Always Use Standardized Script
```bash
# ✅ ONLY CORRECT WAY
bash /opt/opclaw/scripts/restart-backend.sh

# ❌ NEVER DO THIS
docker run -d --name opclaw-backend --network opclaw_opclaw-network -e DB_HOST=...
```

### 2. Pre-Change Checklist
Before recreating backend container:
- [ ] Review DEPLOYMENT.md recovery section
- [ ] Verify `.env.production` exists and has all 21 variables
- [ ] Use standardized script (never manual commands)
- [ ] Run script and verify all checks pass
- [ ] Test critical endpoints (OAuth, health, database)

### 3. Post-Change Verification
After container recreation:
- [ ] Check logs: `docker logs opclaw-backend --tail 50`
- [ ] Verify database connection logs
- [ ] Test OAuth API: `curl "/api/oauth/authorize?redirect_uri=http://test.com/callback"`
- [ ] Test health endpoint: `curl http://localhost:3000/health`
- [ ] Verify remote instance registration

### 4. Documentation Updates
- [ ] Update this document when new environment variables are added
- [ ] Update recovery script if validation requirements change
- [ ] Review DEPLOYMENT.md quarterly for accuracy

---

## Lessons for Future

### For Claude AI (and other developers):
1. **Never manually construct docker run commands for production services**
2. **Always use standardized scripts that include validation**
3. **Check existing documentation before implementing procedures**
4. **Verify all environment variables are present before deploying**
5. **Test critical functionality after changes (OAuth, database, health)**

### Key Principles:
- **Standardization > Flexibility**: Use scripts, not manual commands
- **Validation > Speed**: Check before deploying
- **Documentation > Memory**: Follow documented procedures
- **Automation > Manual**: Automate verification steps

---

## Related Documents
- [DEPLOYMENT.md](../platform/backend/DEPLOYMENT.md) - Full deployment guide
- [/opt/opclaw/scripts/restart-backend.sh](http://118.25.0.190) - Standardized recovery script
- [/opt/opclaw/.env.production](http://118.25.0.190) - Complete environment configuration

---

**Last Updated**: 2026-03-17
**Next Review**: 2026-06-17 (3 months)
**Owner**: Platform Team
