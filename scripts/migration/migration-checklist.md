# Migration Checklist

**Migration ID**: ____________________
**Migration Date**: ____________________
**Staging Host**: ____________________
**Migration Lead**: ____________________

## Pre-Migration Checklist (Day -7 to -1)

### Phase 0.1: Planning & Preparation (Day -7)

- [ ] **Migration plan reviewed and approved**
  - [ ] All stakeholders notified
  - [ ] Maintenance window scheduled (02:00-04:00)
  - [ ] Rollback plan documented
  - [ ] Risk assessment completed

- [ ] **Team coordination**
  - [ ] Migration lead assigned
  - [ ] On-call engineer scheduled (24-hour coverage)
  - [ ] Stakeholder contact list prepared
  - [ ] Communication plan finalized

### Phase 0.2: Staging Environment (Day -5 to -3)

- [ ] **Staging environment ready**
  - [ ] Staging server accessible
  - [ ] SSH keys configured
  - [ ] Docker and Docker Compose installed
  - [ ] Database (PostgreSQL) running
  - [ ] Redis cache operational
  - [ ] Nginx reverse proxy configured

- [ ] **Staging validation**
  - [ ] All services start successfully
  - [ ] Health checks pass (5 layers)
  - [ ] OAuth flow working
  - [ ] Database connectivity verified
  - [ ] Performance baseline recorded

### Phase 0.3: Backup Verification (Day -2)

- [ ] **Backup system tested**
  - [ ] Database backup successful
  - [ ] Configuration backup successful
  - [ ] Code backup successful
  - [ ] Backup integrity verified
  - [ ] Restoration procedure tested

- [ ] **Backup artifacts**
  - [ ] Database dump: `____________________`
  - [ ] Config files: `____________________`
  - [ ] Code archive: `____________________`
  - [ ] Backup location: `____________________`

### Phase 0.4: Pre-Migration Testing (Day -1)

- [ ] **Migration scripts tested**
  - [ ] `test-migration-staging.sh` executed successfully
  - [ ] All phases completed without errors
  - [ ] Rollback procedure tested
  - [ ] Rollback time < 3 minutes verified

- [ ] **Final validation**
  - [ ] All health checks passing
  - [ ] No configuration drift detected
  - [ ] Performance metrics within range
  - [ ] OAuth flow fully functional

## Maintenance Window Checklist (Day 0, 02:00-04:00)

### Phase 1.1: Pre-Migration (T-30min to T-0)

**Time: 02:00 - 02:30**

- [ ] **T-30min: Final verification**
  - [ ] Team check-in (Slack/standup)
  - [ ] Backup integrity confirmed
  - [ ] Staging environment ready
  - [ ] Rollback scripts prepared

- [ ] **T-20min: System health baseline**
  - [ ] Health check baseline recorded
  - [ ] Performance metrics captured
  - [ ] Error rates documented
  - [ ] Resource usage noted

- [ ] **T-15min: Pre-migration checks**
  - [ ] Disk space sufficient (>20% free)
  - [ ] Database connectivity confirmed
  - [ ] Configuration validated (no placeholders)
  - [ ] Container status verified

- [ ] **T-5min: Final countdown**
  - [ ] All stakeholders notified
  - [ ] Maintenance mode enabled (if applicable)
  - [ ] Active sessions noted
  - [ ] Go/no-go decision confirmed

### Phase 1.2: Migration Execution (T-0 to T+30min)

**Time: 02:30 - 03:00**

- [ ] **T-0: Migration start**
  - [ ] Migration announced
  - [ ] Downtime timer started
  - [ ] Pre-migration state snapshot
  - [ ] Service graceful shutdown initiated

- [ ] **T+5min: Migration in progress**
  - [ ] Services stopped
  - [ ] Migration changes applied
  - [ ] Database migrations executed
  - [ ] Configuration updates deployed

- [ ] **T+10min: Service restart**
  - [ ] Services started
  - [ ] Container health verified
  - [ ] Database connections established
  - [ ] Cache primed
  - [ ] Downtime timer stopped

- [ ] **T+20min: Health validation**
  - [ ] Layer 1 (HTTP): Backend responding 200
  - [ ] Layer 2 (DB): PostgreSQL accepting connections
  - [ ] Layer 3 (Query): Database executing queries
  - [ ] Layer 4 (OAuth): Feishu OAuth configured
  - [ ] Layer 5 (Redis): Cache service operational

- [ ] **T+30min: OAuth testing**
  - [ ] OAuth endpoint accessible
  - [ ] QR code generation working
  - [ ] Token exchange successful
  - [ ] User authentication functional
  - [ ] Session management working

### Phase 1.3: Post-Migration Validation (T+30min to T+60min)

**Time: 03:00 - 03:30**

- [ ] **T+30min: Functional testing**
  - [ ] OAuth login flow end-to-end
  - [ ] Database CRUD operations
  - [ ] API endpoints responding
  - [ ] File operations working
  - [ ] Background jobs processing

- [ ] **T+45min: Performance validation**
  - [ ] Response times within +/-10% of baseline
  - [ ] Memory usage normal
  - [ ] CPU usage normal
  - [ ] Database query performance OK
  - [ ] Cache hit ratio acceptable

- [ ] **T+60min: Final validation**
  - [ ] All health checks passing
  - [ ] No critical errors in logs
  - [ ] User acceptance testing passed
  - [ ] Migration declared successful
  - [ ] Maintenance mode disabled

### Phase 1.4: Rollback Testing (Optional, T+60min+)

**Time: 03:30 - 04:00**

- [ ] **Rollback decision tree test**
  - [ ] Trigger rollback procedure
  - [ ] Database restored from backup
  - [ ] Configuration reverted
  - [ ] Services restarted
  - [ ] Health checks passing

- [ ] **Rollback validation**
  - [ ] Rollback time < 3 minutes
  - [ ] All services operational
  - [ ] Data integrity confirmed
  - [ ] OAuth flow working

- [ ] **Re-migration (after rollback test)**
  - [ ] Repeat migration steps
  - [ ] Verify successful migration
  - [ ] Confirm all systems operational

## Post-Migration Checklist (Day 0-7)

### Phase 2.1: Immediate Post-Migration (Day 0, T+0 to T+4h)

**Time: 04:00 - 08:00**

- [ ] **First hour (T+0 to T+1h)**
  - [ ] Monitoring dashboard active
  - [ ] Health checks every 5 minutes
  - [ ] Error rates monitored
  - [ ] Performance metrics tracked
  - [ ] User feedback collected

- [ ] **Next 3 hours (T+1h to T+4h)**
  - [ ] Continue monitoring
  - [ ] Check for anomalies
  - [ ] Review application logs
  - [ ] Monitor database performance
  - [ ] Track OAuth success rates

### Phase 2.2: Extended Monitoring (Day 0-7)

- [ ] **Day 0-1: 24-hour on-call**
  - [ ] Engineer on-call standby
  - [ ] Automated health checks every 5 minutes
  - [ ] Alert notifications configured
  - [ ] Incident response plan ready
  - [ ] Rollback decision tree available

- [ ] **Day 1-7: Daily health checks**
  - [ ] Daily health check summary
  - [ ] Performance trend analysis
  - [ ] Error log review
  - [ ] User feedback collection
  - [ ] System optimization tuning

### Phase 2.3: Validation & Documentation

- [ ] **Data integrity**
  - [ ] Database consistency check
  - [ ] Row count verification
  - [ ] Data validation queries
  - [ ] Backup comparison

- [ ] **Performance comparison**
  - [ ] Baseline vs actual comparison
  - [ ] Response time analysis
  - [ ] Resource usage trends
  - [ ] Database performance metrics

- [ ] **Documentation updates**
  - [ ] Migration report completed
  - [ ] Lessons learned documented
  - [ ] Runbook updated
  - [ ] Known issues recorded

## Acceptance Criteria Verification

### Timing Targets

- [ ] **Migration time < 60 minutes**
  - [ ] Actual: ________ minutes
  - [ ] Status: ____ PASSED / FAILED

- [ ] **Downtime < 5 minutes**
  - [ ] Actual: ________ minutes
  - [ ] Status: ____ PASSED / FAILED

- [ ] **Rollback time < 3 minutes** (if tested)
  - [ ] Actual: ________ minutes
  - [ ] Status: ____ PASSED / FAILED

### Functional Validation

- [ ] **OAuth flow working**
  - [ ] QR code generation: ✅ / ❌
  - [ ] Token exchange: ✅ / ❌
  - [ ] User authentication: ✅ / ❌
  - [ ] Session management: ✅ / ❌

- [ ] **Data integrity verified**
  - [ ] Database consistency: ✅ / ❌
  - [ ] Data completeness: ✅ / ❌
  - [ ] Backup restoration tested: ✅ / ❌

- [ ] **Performance within targets**
  - [ ] Response times: ✅ / ❌
  - [ ] Resource usage: ✅ / ❌
  - [ ] Database performance: ✅ / ❌

- [ ] **24-hour monitoring clean**
  - [ ] No critical incidents: ✅ / ❌
  - [ ] Error rates normal: ✅ / ❌
  - [ ] Performance stable: ✅ / ❌

## Sign-Off

**Migration Lead**: ____________________ (Signature: ________)
**Date**: ____________________

**Stakeholder Approval**: ____________________ (Signature: ________)
**Date**: ____________________

**Migration Status**: ____ SUCCESSFUL / ROLLED BACK / INCOMPLETE

**Next Steps**:
- [ ] Production migration scheduled
- [ ] Additional staging tests required
- [ ] Issues to be resolved

**Notes**:
_____________________________________________________________________
_____________________________________________________________________
_____________________________________________________________________

---

**Checklist Version**: 1.0
**Last Updated**: 2026-03-19
**Maintained By**: DevOps Team
