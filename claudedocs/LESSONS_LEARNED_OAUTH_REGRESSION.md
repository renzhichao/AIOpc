# OAuth Regression - Lessons Learned (2026-03-17)

## Problem Summary

The OAuth "scan to login" feature has experienced **multiple regressions** (at least 4 occurrences) with the error:
- **Error Message**: "The string did not match the expected pattern"
- **Root Cause**: `FEISHU_APP_SECRET` configuration mismatch

## Regression #4 Analysis (2026-03-17)

### Timeline
1. **11:35 AM** - Backend container created with incorrect config
2. **11:57 AM** - User reports OAuth callback failure
3. **6:15 PM** - Configuration file (`/opt/opclaw/.env.production`) corrected
4. **7:00 PM** - Issue investigated and container recreated with correct config

### Root Cause

The `FEISHU_APP_SECRET` had a **single character difference**:
- **Incorrect**: `L0cHQDBbEiIys6AHW6**3**miecONb1xA4qy` (char 10 = `6`)
- **Correct**: `L0cHQDBbEiIys6AHW5**3**miecONb1xA4qy` (char 10 = `5`)

### Why This Keeps Happening

1. **Multiple Configuration Sources**:
   - `/opt/opclaw/.env.production` (used by restart script)
   - `/opt/opclaw/platform/.env.production` (reference)
   - `/opt/opclaw/backend/.env.production.example` (template)

2. **Container Config Immutability**:
   - Container environment variables are set at creation time
   - Modifying `.env.production` file does **not** affect running containers
   - Container must be recreated to pick up new config

3. **No Validation Layer**:
   - No automated check for placeholder values
   - No validation of critical configuration before deployment
   - No runtime verification of config correctness

## Prevention Measures Implemented

### 1. Configuration Validation Script

Created `/opt/opclaw/scripts/verify-env.sh`:
- Validates critical config values (Feishu, JWT)
- Detects placeholder patterns (`cli_xxx`, `your_`, `CHANGE_THIS`)
- Returns error code for automation

**Usage**:
```bash
/opt/opclaw/scripts/verify-env.sh
```

### 2. Protected Restart Script

Created `/opt/opclaw/scripts/restart-backend-protected.sh`:
- **Step 0**: Validate configuration before any changes
- **Step 7**: Verify runtime configuration matches expected
- Prevents container start if validation fails

**Usage**:
```bash
/opt/opclaw/scripts/restart-backend-protected.sh
```

### 3. Configuration Documentation

Updated `CLAUDE.md` with:
- **Production Deployment & Configuration Safety Rules**
- Mandatory pre-change checklist
- Configuration file priority hierarchy
- Incident response procedures

## Critical Configuration Values (2026-03-17)

```bash
# Feishu OAuth (Production)
FEISHU_APP_ID=cli_a93ce5614ce11bd6
FEISHU_APP_SECRET=L0cHQDBbEiIys6AHW53miecONb1xA4qy

# JWT (Production)
JWT_SECRET=*u2a6n^OSMz7rOLCmZ18l3ip0IKKQaR*b6d&HGs1Tths00FK
```

**Note**: These values are in `/opt/opclaw/.env.production` (primary config source)

## Deployment Safety Rules

### Before ANY Config Change

1. **Backup Running Configuration**:
   ```bash
   docker inspect opclaw-backend --format='{{json .Config.Env}}' > /tmp/env_backup.json
   ```

2. **Validate Configuration Source**:
   - Use `/opt/opclaw/.env.production` (NOT `/opt/opclaw/platform/.env.production`)
   - Check for placeholder values before applying

3. **Run Validation Script**:
   ```bash
   /opt/opclaw/scripts/verify-env.sh
   ```

### After Config Change

1. **Verify Applied Config**:
   ```bash
   docker exec opclaw-backend printenv | grep -E 'FEISHU|JWT'
   ```

2. **Test OAuth Endpoints**:
   ```bash
   curl "http://localhost:3000/api/oauth/authorize?redirect_uri=http://test.com/callback" | jq
   ```

3. **Keep Backup Until Verified**:
   - Store `/tmp/env_backup_*.json` until change is confirmed working

## Quick Recovery Commands

If OAuth regression occurs:

```bash
# 1. Validate current config
/opt/opclaw/scripts/verify-env.sh

# 2. If validation passes, restart with protected script
/opt/opclaw/scripts/restart-backend-protected.sh

# 3. Test OAuth
curl "http://localhost:3000/api/oauth/authorize?redirect_uri=http://test.com/callback" | jq
```

## References

- **Primary Config**: `/opt/opclaw/.env.production`
- **Validation Script**: `/opt/opclaw/scripts/verify-env.sh`
- **Protected Restart**: `/opt/opclaw/scripts/restart-backend-protected.sh`
- **Safety Rules**: `CLAUDE.md` → "Production Deployment & Configuration Safety Rules"

## Status

✅ **RESOLVED** (2026-03-17 20:00)
- Configuration corrected
- Container recreated with correct values
- Validation scripts deployed
- Documentation updated

---

**Next Regression Prevention**: Always run `verify-env.sh` before any backend restart!
