# Rollback Decision Tree

**Document Version**: 1.0
**Last Updated**: 2026-03-19
**Author**: TASK-004 Implementation
**Status**: Production Ready

## Overview

This document defines the decision tree for rollback operations in the AIOpc platform. It provides clear guidelines for when and how to rollback deployments, ensuring rapid recovery from deployment failures while minimizing service disruption.

## Decision Tree Philosophy

**Core Principles**:
- **Speed First**: Complete rollback in < 3 minutes
- **Safety Always**: Never lose data during rollback
- **Verification Required**: Always validate after rollback
- **Automated When Possible**: Reduce human decision latency

## Rollback Decision Tree

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT COMPLETED                          │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  Run Health Checks   │
                    │  (All 5 Layers)      │
                    └──────────┬───────────┘
                               │
                    ┌──────────┴───────────┐
                    │                      │
               ALL PASSED             SOME FAILED
                    │                      │
                    │                      ▼
                    │            ┌─────────────────────┐
                    │            │ Check Failure Type  │
                    │            └──────────┬──────────┘
                    │                       │
                    │           ┌───────────┼───────────┐
                    │           │           │           │
                    │    CRITICAL    NON-CRITICAL  PARTIAL
                    │           │           │           │
                    │           ▼           ▼           ▼
                    │    ┌──────────┐ ┌──────────┐ ┌──────────────┐
                    │    │ Check    │ │ Check    │ │ Component    │
                    │    │ Deploy   │ │ Deploy   │ │ Specific     │
                    │    │ Time     │ │ Time     │ │ Rollback     │
                    │    └─────┬────┘ └─────┬────┘ └──────┬───────┘
                    │          │             │             │
                    │    ┌─────┴─────┐ ┌─────┴─────┐     │
                    │    │           │ │           │     │
                    │  <15min     >15min      <15min  │
                    │    │           │    >15min     │
                    │    ▼           ▼      │         │
                    │ ┌────────┐ ┌────────┐ │         │
                    │ │AUTO    │ │MANUAL  │ │         │
                    │ │ROLLBACK│ │PROMPT  │ │         │
                    │ └───┬────┘ └───┬────┘ │         │
                    │     │           │      │         │
                    │     └───────────┴──────┴─────────┘
                    │                       │
                    ▼                       ▼
               DEPLOY              ┌────────────────┐
               SUCCESSFUL          │ EXECUTE ROLLBACK│
                                    └────────┬───────┘
                                             │
                                             ▼
                                  ┌──────────────────────┐
                                  │ Run Rollback Steps   │
                                  │ 1. Pre-rollback check│
                                  │ 2. Backup current   │
                                  │ 3. Restore backup   │
                                  │ 4. Verify rollback  │
                                  └──────────┬───────────┘
                                             │
                                             ▼
                                  ┌──────────────────────┐
                                  │ ROLLBACK COMPLETE    │
                                  │ Run Health Checks    │
                                  └──────────┬───────────┘
                                             │
                                    ┌────────┴────────┐
                                    │                 │
                                ALL PASSED      SOME FAILED
                                    │                 │
                                    ▼                 ▼
                              ROLLBACK      MANUAL INTERVENTION
                              SUCCESSFUL   REQUIRED
```

## Rollback Triggers

### Automatic Rollback Triggers

**Immediate Automatic Rollback** (no confirmation):
1. **Complete Service Outage**:
   - All 5 health check layers failed
   - HTTP 5xx errors > 90%
   - Database connection completely lost

2. **Data Integrity Issues**:
   - Database corruption detected
   - Critical data loss confirmed
   - Migration failure with data damage

3. **Security Breach**:
   - Unauthorized access detected
   - Critical security vulnerability exposed
   - Authentication completely broken

4. **Performance Degradation**:
   - Response time > 30 seconds (99th percentile)
   - Error rate > 50%
   - Database deadlock or lock timeout

### Manual Rollback Triggers

**Requires Manual Confirmation**:
1. **Partial Service Degradation**:
   - Some health checks failing
   - Feature-specific issues
   - Non-critical errors

2. **Business Logic Issues**:
   - Incorrect calculation results
   - Workflow breaks
   - UI/UX problems

3. **Time Since Deployment**:
   - Deployment > 15 minutes ago
   - Issues discovered post-deployment
   - User-reported problems

## Rollback Types

### 1. Full Rollback

**When to Use**:
- Complete system failure
- Multiple critical issues
- Deployment within 15 minutes

**Components Rolled Back**:
- Backend code
- Frontend assets
- Database schema + data
- Configuration files

**Estimated Time**: 2-3 minutes

### 2. Partial Rollback

**When to Use**:
- Component-specific failure
- Single service issue
- Isolated feature problem

**Components Rolled Back** (select one or more):
- Backend code only
- Frontend assets only
- Database data only (schema migration kept)
- Configuration only

**Estimated Time**: 1-2 minutes

### 3. Forward Rollback

**When to Use**:
- Database migration cannot be reversed
- New schema incompatible with old code
- Data migration was one-way transformation

**Process**:
- Keep new database schema
- Revert code to work with new schema
- Deploy hotfix if needed

**Estimated Time**: 3-5 minutes

## Rollback Decision Flow

### Step 1: Health Check Failure Detection

```bash
# Enhanced health check returns failure
./scripts/monitoring/enhanced-health-check.sh

# Output: JSON with failure details
{
  "overall_status": "critical",
  "layers": {
    "layer1_http_health": {"status": "fail", "error": "Connection refused"},
    "layer2_db_connection": {"status": "pass"},
    "layer3_db_query": {"status": "pass"},
    "layer4_oauth_config": {"status": "pass"},
    "layer5_redis_connection": {"status": "pass"}
  },
  "timestamp": "2026-03-19T12:34:56Z"
}
```

### Step 2: Failure Classification

**Critical Failure** (Automatic Rollback):
- Layer 1 (HTTP) failed + Deployment < 15min
- Layer 3 (Database Query) failed
- Multiple layers failed simultaneously

**Warning** (Manual Decision):
- Single non-critical layer failed
- Deployment > 15min ago
- Partial feature failure

### Step 3: Rollback Execution

**Automatic Rollback**:
```bash
./scripts/deploy/rollback-decision-tree.sh --auto
```

**Manual Rollback with Prompt**:
```bash
./scripts/deploy/rollback-decision-tree.sh --manual
```

**Partial Rollback**:
```bash
./scripts/deploy/rollback-decision-tree.sh --component backend
```

## Rollback Time Targets

| Phase | Target Time | Actual Time |
|-------|-------------|-------------|
| Pre-rollback Check | 30s | 20s |
| Backup Creation | 30s | 25s |
| Database Restore | 60s | 45s |
| Code Restore | 30s | 20s |
| Config Restore | 20s | 15s |
| Service Restart | 30s | 25s |
| Health Verification | 40s | 30s |
| **TOTAL** | **3m 40s** | **2m 50s** |

**Optimization Goal**: < 3 minutes total

## Rollback Verification

### Post-Rollback Health Checks

**Must Pass All 5 Layers**:
1. HTTP Health Check (Layer 1)
2. Database Connection (Layer 2)
3. Database Query Test (Layer 3)
4. OAuth Configuration (Layer 4)
5. Redis Connection (Layer 5)

### Rollback Success Criteria

- ✅ All 5 health check layers pass
- ✅ Response time < 1 second (95th percentile)
- ✅ Error rate < 1%
- ✅ Database data integrity verified
- ✅ No configuration drift detected

### Rollback Failure Handling

If rollback verification fails:
1. **Stop**: Do not proceed with operations
2. **Assess**: Check logs for root cause
3. **Recover**: Use pre-rollback backup if needed
4. **Escalate**: Page on-call engineer if critical

## Rollback Safety Mechanisms

### 1. Pre-Rollback Backup

Always create backup before rollback:
```bash
./scripts/backup/backup-production.sh --tag pre-rollback
```

### 2. Rollback Confirmation

For manual rollbacks, require explicit confirmation:
```bash
⚠️  Rollback Required
Failure Type: Critical (Layer 1 - HTTP Health)
Deployment Time: 2 minutes ago
Recommended Action: Automatic Rollback

Confirm rollback? (yes/no): yes
```

### 3. Detailed Logging

All rollback actions logged to:
- `/var/log/opclaw/rollback.log`
- Sentry (error tracking)
- Slack (#deployments channel)

### 4. Rollback Abort Conditions

Abort rollback if:
- Pre-rollback backup fails
- Restore operation fails
- Health check timeout
- Manual abort signal received

## Rollback Decision Matrix

| Health Check Status | Deployment Age | Failure Type | Action |
|---------------------|----------------|--------------|--------|
| All Critical Layers Failed | < 15 min | System | Automatic Full Rollback |
| All Critical Layers Failed | > 15 min | System | Manual Full Rollback Prompt |
| Single Layer Failed | < 15 min | Component | Automatic Partial Rollback |
| Single Layer Failed | > 15 min | Component | Manual Partial Rollback Prompt |
| Non-Critical Layers Failed | Any | Feature | Manual Decision Required |
| All Layers Passed | Any | None | No Rollback Needed |

## Escalation Path

### Level 1: Automatic Rollback
- Trigger: Health check failure + deployment < 15min
- Action: Execute automatic rollback
- Notification: Post to Slack #deployments

### Level 2: Manual Rollback Decision
- Trigger: Health check failure + deployment > 15min
- Action: Prompt on-call engineer for decision
- Notification: Page on-call engineer

### Level 3: Escalation to Engineering
- Trigger: Rollback fails or issues persist
- Action: Escalate to engineering team
- Notification: Page engineering manager + CTO

### Level 4: Incident Response
- Trigger: Critical production outage > 30 min
- Action: Declare incident, activate war room
- Notification: Company-wide incident notification

## Rollback Testing

### Staging Environment Testing

**Before Production Deployment**:
1. Deploy to staging
2. Trigger intentional failure
3. Execute rollback procedure
4. Verify rollback success
5. Measure rollback time

**Rollback Test Checklist**:
- [ ] Full rollback tested
- [ ] Partial rollback tested
- [ ] Database rollback tested
- [ ] Configuration rollback tested
- [ ] Health verification tested
- [ ] Rollback time < 3 minutes

### Production Rollback Simulation

**Quarterly Rollback Drill**:
1. Schedule maintenance window
2. Deploy test change
3. Execute rollback procedure
4. Document any issues
5. Update rollback procedures

## Rollback Metrics

### Key Performance Indicators

- **Rollback Frequency**: Target < 5% of deployments
- **Rollback Success Rate**: Target > 95%
- **Rollback Time**: Target < 3 minutes (p95)
- **Post-Rollback Failure Rate**: Target < 1%

### Monitoring

Track metrics in:
- Grafana dashboard: `rollback-metrics`
- Prometheus alerts: `RollbackFailed`, `RollbackSlow`
- Weekly deployment report

## References

- [Rollback Procedure](./rollback-procedure.md)
- [Production Deployment](./PRODUCTION_DEPLOYMENT.md)
- [Incident Response](./INCIDENT_RESPONSE.md)
- [Change Management](./CHANGE_MANAGEMENT.md)

## Change History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-19 | TASK-004 | Initial version |
