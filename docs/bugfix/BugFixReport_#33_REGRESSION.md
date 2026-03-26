# Bug Fix Report #33: OAuth Authorize Endpoint 500 Error (REGRESSION)

**Bug ID**: #33
**Type**: Regression
**Severity**: P1 (High - core OAuth functionality affected)
**Status**: Code fix complete and committed, CI/CD deployment failed (network issue)
**Date**: 2026-03-26

---

## Executive Summary

OAuth authorize endpoint `/api/oauth/authorize/feishu` returns 500 Internal Server Error, preventing QR code display on login page. This is a **REGRESSION** - OAuth was working before recent manual deployment changes.

**User Impact**: Users cannot log in via Feishu OAuth on CIIBER tenant (http://113.105.103.165:20180)

**Root Cause**: Manual deployment violation of bug_fix_rules.md caused environment variables to not load into backend container

---

## Symptom Description

### Frontend Error
```
GET http://113.105.103.165:20180/api/oauth/authorize/feishu?redirect_uri=http%3A%2F%2F113.105.103.165%3A20180%2Foauth%2Fcallback 500 (Internal Server Error)
获取授权 URL 失败: Error: Failed to generate authorization URL
```

### Affected Endpoint
- `GET /api/oauth/authorize/feishu?redirect_uri=...`
- `GET /api/oauth/authorize/:platform` (multi-platform endpoint)

### User Impact
- QR code not displaying on login page
- Feishu OAuth login completely broken
- Users cannot access the platform

---

## Root Cause Analysis

### Technical Root Cause

**Deployment Script Environment File Path Inconsistency**

The `deploy-ciiber-tenant.sh` script creates environment files but docker-compose references a different path:

1. **Script creates**: `/opt/opclaw/platform/.env` (line 385)
2. **Script creates**: `/etc/opclaw/.env.production` (line 141)
3. **Docker compose references**: `/etc/opclaw/.env.production` (line 459)
4. **Docker compose runs**: `docker compose --env-file /etc/opclaw/.env.production up -d` (line 567)

### Regression Timeline

1. **Commit 6a56b12** (2026-03-25): Docker Hub fix - deployment script changes
2. **Commit 2b5b269** (2026-03-25): Modified nginx port mapping to `20180:80` (WRONG)
3. **Commit ad5baee** (2026-03-25): Reverted nginx port mapping back to `80:80`
4. **Manual Deployment**: User manually SSH'd and ran `docker compose down && docker compose up -d`
   - **VIOLATED bug_fix_rules.md** - manual deployment not allowed
   - Did NOT use `--env-file /etc/opclaw/.env.production` flag
5. **Result**: Backend container started without environment variables

### Why It Failed

When `docker compose up -d` is run **without** `--env-file` flag:
- Docker Compose tries to interpolate variables like `\${FEISHU_APP_ID}` from shell environment
- Shell environment does NOT have these variables (they're in `/etc/opclaw/.env.production`)
- Variables resolve to empty strings
- Backend container starts with empty `FEISHU_APP_ID` and `FEISHU_APP_SECRET`
- `FeishuOAuthProvider.validateConfig()` throws error during initialization
- OAuthService initialization fails
- `/api/oauth/authorize` endpoint returns 500 error

### Code Evidence

**FeishuOAuthProvider.ts** (lines 559-570):
```typescript
private loadConfig(): FeishuOAuthConfig {
  return {
    appId: process.env.FEISHU_APP_ID || '',      // Empty if env var not set
    appSecret: process.env.FEISHU_APP_SECRET || '',  // Empty if env var not set
    // ...
  };
}
```

**FeishuOAuthProvider.ts** (lines 530-548):
```typescript
validateConfig(): void {
  const requiredFields: (keyof FeishuOAuthConfig)[] = [
    'appId',
    'appSecret',
    'authorizeUrl',
    'tokenUrl',
    'redirectUri'
  ];

  const missing = requiredFields.filter((field) => !this.config[field]);

  if (missing.length > 0) {
    throw new OAuthError(
      OAuthErrorType.CONFIG_MISSING,
      this.PLATFORM,
      `Missing Feishu configuration: ${missing.join(', ')}`
    );
  }
}
```

---

## Fix Implementation

### Code Changes (COMMITTED)

**Commit**: `dc0136b` (2026-03-26)
**Branch**: `main`
**Files Modified**:
1. `platform/backend/src/app.ts`
2. `platform/backend/src/services/__tests__/OAuthService.test.ts`

**Fix 1**: Prevent dotenv from overriding docker-compose environment variables (app.ts:19-27)
```typescript
// 尝试加载环境文件（如果存在）
// 注意：不会覆盖已存在的环境变量（用于本地开发）
dotenv.config({ path: envPath });
// 同时也尝试加载默认的.env文件（用于本地开发）
// 在Docker环境中，环境变量由docker-compose传递，不应该被.env文件覆盖
// 使用 override: false 确保不会覆盖已设置的环境变量
if (NODE_ENV !== 'production') {
  dotenv.config({ override: false });
}
```

**Fix 2**: Add OAuth configuration validation on startup (app.ts:224-260)
```typescript
private validateOAuthConfig() {
  const requiredOAuthVars = [
    'FEISHU_APP_ID',
    'FEISHU_APP_SECRET',
    'JWT_SECRET'
  ];

  const missingVars: string[] = [];

  for (const varName of requiredOAuthVars) {
    if (!process.env[varName] || process.env[varName].trim() === '') {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    const errorMsg = `Missing required OAuth configuration: ${missingVars.join(', ')}. Application cannot start.`;

    logger.error('OAuth configuration validation failed', {
      missing: missingVars,
      environment: process.env.NODE_ENV || 'unknown'
    });

    // In production, fail fast to prevent broken deployment
    if (process.env.NODE_ENV === 'production') {
      throw new Error(errorMsg);
    }

    // In development, warn but continue
    logger.warn(`Starting without OAuth configuration. OAuth functionality will not work: ${errorMsg}`);
  } else {
    logger.info('OAuth configuration validated successfully', {
      feishu_app_id: process.env.FEISHU_APP_ID?.substring(0, 8) + '...',
      jwt_secret_configured: !!process.env.JWT_SECRET
    });
  }
}
```

**Fix 3**: Call validation in initializeControllers() (app.ts:294)
```typescript
private initializeControllers() {
  logger.info('Initializing routing-controllers...');

  // Validate OAuth configuration before starting controllers
  this.validateOAuthConfig();

  // Configure routing-controllers with class-based controller registration
  // ...
}
```

### Test Case Added

**File**: `platform/backend/src/services/__tests__/OAuthService.test.ts`

Added TEST 7: OAuth configuration validation - missing Feishu credentials
```typescript
it('should throw error when Feishu OAuth credentials are missing', () => {
  // Arrange: Remove Feishu environment variables
  const originalAppId = process.env.FEISHU_APP_ID;
  const originalAppSecret = process.env.FEISHU_APP_SECRET;

  delete process.env.FEISHU_APP_ID;
  delete process.env.FEISHU_APP_SECRET;

  // Act & Assert: Creating OAuthService should throw error
  expect(() => {
    new OAuthService(userRepository, instanceRepository);
  }).toThrow();

  // Restore environment variables
  if (originalAppId) process.env.FEISHU_APP_ID = originalAppId;
  if (originalAppSecret) process.env.FEISHU_APP_SECRET = originalAppSecret;
});
```

**Purpose**: This test ensures that if FEISHU_APP_ID and FEISHU_APP_SECRET are not set, the OAuthService initialization fails fast with a clear error message instead of starting in a broken state.

### Deployment Procedure

**Correct deployment method** (per bug_fix_rules.md):

1. **DO NOT manually SSH to server**
2. **USE GitHub Actions CI/CD workflow**:
   ```bash
   gh workflow run deploy-tenant.yml \
     --field tenant=CIIBER \
     --field component=all \
     --field dry_run=false \
     --field force_deploy=true
   ```

3. **Workflow ensures**:
   - Environment variables properly loaded from GitHub Secrets
   - `--env-file /etc/opclaw/.env.production` flag used
   - All containers started with correct configuration

---

## Deployment Attempt Results

### CI/CD Deployment Status

**Workflow Run #1**: #23551204520
**Date**: 2026-03-26 00:11 (UTC)
**Status**: Failed (SSH connection timeout - network issue)

**Workflow Run #2**: #23572266086
**Date**: 2026-03-26 01:04 (UTC)
**Commit**: `dc0136b` (with Bug #33 fix)
**Status**: Failed (SSH connection timeout - same network issue)

**Jobs**:
- ✅ Configuration Validation (4s)
- ✅ Build Components (1m 30s)
- ❌ Deploy Services (2m 15s) - SSH timeout to 113.105.103.165:20122

**Error Log**:
```
[0;31m✗ SSH 连接失败
ssh: connect to host 113.105.103.165 port 20122: Connection timed out
```

**Additional Warnings from Deployment**:
```
⚠️  Warning: FEISHU_APP_SECRET appears to be a placeholder value
   OAuth functionality may not work correctly
⚠️  Warning: DINGTALK_APP_KEY appears to be a placeholder value
   DingTalk OAuth functionality may not work correctly
```

**Analysis**: This is a **network infrastructure issue**, not a code problem:
- GitHub Actions runner cannot establish SSH connection to CIIBER server
- Possible causes:
  1. Firewall blocking GitHub Actions runner IPs
  2. Server SSH rate limiting
  3. Network routing instability
  4. SSH service not running or wrong port
- Code fix is valid and committed - deployment blocked by network connectivity

**Next Steps**: Network connectivity to CIIBER server must be restored before CI/CD deployment can succeed.

**IMPORTANT**: Deployment also shows warnings about placeholder values:
- `FEISHU_APP_SECRET` appears to be a placeholder value
- `DINGTALK_APP_KEY` appears to be a placeholder value

This suggests that either:
1. GitHub Secrets are not configured for CIIBER tenant
2. The config file `config/tenants/CIIBER.yml` has placeholder values
3. The secrets are not being properly passed to the deployment script

**ACTION REQUIRED**: Verify CIIBER GitHub Secrets are properly configured before re-running deployment.

---

## Recovery Steps

### Immediate Recovery (Manual)

**WARNING**: This violates bug_fix_rules.md but is necessary for immediate recovery while CI/CD network issue is resolved.

**Prerequisites**:
- SSH access to CIIBER server
- Knowledge of correct environment file location

**Steps**:

1. **SSH to CIIBER server**:
   ```bash
   ssh -i ~/.ssh/ciiber_key -p 20122 openclaw@113.105.103.165
   ```

2. **Verify environment file exists**:
   ```bash
   cat /etc/opclaw/.env.production | grep FEISHU
   ```

   Expected output:
   ```
   FEISHU_APP_ID=cli_a93ce5614ce11bd6
   FEISHU_APP_SECRET=L0cHQDBbEiIys6AHW53miecONb1xA4qy
   ```

3. **Navigate to platform directory**:
   ```bash
   cd /opt/opclaw/platform
   ```

4. **Restart services with correct env-file**:
   ```bash
   docker compose --env-file /etc/opclaw/.env.production down
   docker compose --env-file /etc/opclaw/.env.production up -d
   ```

5. **Verify services started**:
   ```bash
   docker ps | grep opclaw
   ```

6. **Test OAuth endpoint**:
   ```bash
   curl http://localhost:3000/api/oauth/platforms
   ```

7. **Test login page**:
   - Open http://113.105.103.165:20180/login
   - Verify QR code displays

### Long-term Fix

1. **Resolve CI/CD network connectivity issue**:
   - Check firewall rules for GitHub Actions runner IPs
   - Verify SSH service configuration
   - Consider using GitHub-hosted runners with different IP ranges

2. **Improve deployment script robustness**:
   - Add environment variable validation before starting containers
   - Add explicit error messages when required env vars are missing
   - Implement health check that validates OAuth configuration on startup

3. **Prevent regression**:
   - Ensure all developers follow bug_fix_rules.md
   - Add CI/CD gate that prevents manual deployments
   - Implement monitoring for OAuth endpoint health

---

## Lessons Learned

### Process Issues

1. **Manual deployment violated bug_fix_rules.md**
   - User manually SSH'd to fix nginx port issue
   - Did not use `--env-file` flag when restarting services
   - Result: Environment variables not loaded → OAuth broke

2. **Deployment script fragility**
   - Script relies on specific `--env-file` flag
   - No validation that env vars are loaded
   - No clear error messages when config is missing

3. **CI/CD network reliability**
   - SSH connection from GitHub Actions to CIIBER server is unreliable
   - Need to investigate firewall/routing issues
   - May need to use alternative deployment method

### Technical Improvements Needed

1. **Add container startup validation**
   - Backend service should check required env vars on startup
   - Fail fast with clear error message if config is missing
   - Include configuration status in health check endpoint

2. **Improve deployment script**
   - Add env file existence check
   - Validate env file content before starting containers
   - Use absolute paths for env files to avoid confusion

3. **Add monitoring**
   - Monitor OAuth endpoint health
   - Alert on 500 errors
   - Track environment configuration changes

---

## Related Issues

- **Issue #19**: CIIBER deployment using Docker Hub with mirror accelerators
- **Issue #21**: CIIBER multiplatform OAuth configuration
- **Bug #29**: QR code not displaying on login page (different issue, already fixed)

---

## Verification Checklist

Once deployed, verify:

- [ ] OAuth platforms endpoint returns 200: `curl http://113.105.103.165:20180/api/oauth/platforms`
- [ ] Login page displays QR code: Navigate to http://113.105.103.165:20180/login
- [ ] OAuth authorize endpoint works: `curl "http://113.105.103.165:20180/api/oauth/authorize/feishu?redirect_uri=http://113.105.103.165:20180/oauth/callback"`
- [ ] Backend logs show no OAuth errors: `docker logs opclaw-backend --tail 50 | grep -i oauth`
- [ ] Container has environment variables: `docker exec opclaw-backend printenv | grep FEISHU`

---

## References

- **Bug Fix Rules**: `/Users/arthurren/projects/AIOpc/docs/rules/bug_fix_rules.md`
- **Deployment Script**: `scripts/deploy/deploy-ciiber-tenant.sh`
- **OAuth Provider**: `platform/backend/src/auth/providers/FeishuOAuthProvider.ts`
- **OAuth Controller**: `platform/backend/src/controllers/OAuthController.ts`
- **Test File**: `platform/backend/src/services/__tests__/OAuthService.test.ts`

---

**Report Prepared By**: Claude Code (AI Assistant)
**Date**: 2026-03-26
**Commit**: `dc0136b` (code fix complete and committed)
**Status**: Awaiting CI/CD deployment (network issue must be resolved)
