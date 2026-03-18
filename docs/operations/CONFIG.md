# Configuration Management

## Single Source of Truth

**Principle**: `platform/.env.production` is the ONLY source of truth for production configuration.

### Why Keep Production Config in Repository?

We made a deliberate trade-off decision:
- **Problem**: No configuration center, deployment process overwrites config → regression
- **Solution**: Commit production config to repository as single source of truth
- **Trade-off**: Configuration reliability > Security risk

### Configuration Files

| File | Purpose | In Repository |
|------|---------|---------------|
| `platform/.env.production` | **Production config (real values)** | ✅ Yes - Single source of truth |
| `platform/.env.production.example` | Template with placeholders | ✅ Yes |
| `.env.development` | Local development | ❌ No (gitignored) |
| `.env.staging` | Staging environment | ❌ No (gitignored) |
| `*.local` | Local overrides | ❌ No (gitignored) |

## Required Environment Variables

### Database (5 vars)
- `DB_HOST` - Database host
- `DB_PORT` - Database port
- `DB_NAME` - Database name
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password

### Redis (3 vars)
- `REDIS_HOST` - Redis host
- `REDIS_PORT` - Redis port
- `REDIS_PASSWORD` - Redis password

### Application (3 vars)
- `NODE_ENV` - Environment (development/staging/production)
- `BACKEND_PORT` - Backend application port
- `JWT_SECRET` - JWT signing secret

### Feishu OAuth (9 vars)
- `FEISHU_APP_ID` - Feishu app ID
- `FEISHU_APP_SECRET` - Feishu app secret
- `FEISHU_VERIFICATION_TOKEN` - Verification token
- `FEISHU_ENCRYPT_KEY` - Encryption key
- `FEISHU_OAUTH_REDIRECT_URI` - OAuth callback URL
- `FEISHU_OAUTH_AUTHORIZE_URL` - OAuth authorize URL
- `FEISHU_OAUTH_TOKEN_URL` - OAuth token URL
- `FEISHU_OAUTH_USERINFO_URL` - User info URL
- `FEISHU_OAUTH_SCOPE` - OAuth scope

### LLM API (1 var)
- `DEEPSEEK_API_KEY` - DeepSeek API key

## Configuration Change Process

1. **Understand**: Read the variable description and understand impact
2. **Test**: Make changes in development environment first
3. **Document**: Create PR with clear description of what and why
4. **Review**: Get review from team lead
5. **Verify**: Deploy to staging and verify
6. **Deploy**: Deploy to production

## Security Considerations

⚠️ **WARNING**: Production config contains real credentials. Mitigations:
- Limit repository access to authorized team members only
- Use private repository (not public)
- Consider Git commit encryption for sensitive files
- Plan for configuration center (Vault, K8s Secrets) in future

## Verification

Run configuration verification:
```bash
./scripts/verify-config.sh
```

This checks:
- Single .env.production source
- No placeholder values
- All required variables present
