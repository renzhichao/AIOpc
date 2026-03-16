# TASK-059: Database Migration - Quick Reference

**Status**: ✅ Implementation Complete | **Ready to Execute**

---

## One Command to Deploy

```bash
cd /Users/arthurren/projects/AIOpc/scripts/cloud
./deploy-database.sh
```

This single command will:
1. Upload migration files to server (118.25.0.190)
2. Install dependencies via pnpm
3. Initialize PostgreSQL database
4. Execute TypeORM migration
5. Verify 8 tables created
6. Validate foreign keys and indexes

---

## Verify After Deployment

```bash
./verify-database.sh --remote
```

Expected output:
- ✅ Database exists
- ✅ Table count: 8
- ✅ All critical tables present
- ✅ Foreign keys created
- ✅ Indexes created
- ✅ Read/write operations work

---

## What Gets Created

### 8 Tables
1. `users` - User accounts
2. `api_keys` - API key management
3. `qr_codes` - OAuth QR codes
4. `instances` - Docker instances
5. `documents` - Document storage
6. `document_chunks` - Document chunks
7. `instance_metrics` - Metrics collection
8. `instance_renewals` - Renewal history

### 5 Foreign Keys
- instances → users
- document_chunks → documents
- instance_metrics → instances
- instance_renewals → instances
- instance_renewals → users

### 20+ Indexes
- Performance optimization
- Foreign key indexes
- Status and type indexes
- Timestamp indexes

---

## Test Locally First (Already Passed ✅)

```bash
./test-migration-local.sh
```

Result: All tests passed

---

## Dry Run Mode

Test without actually executing:

```bash
./deploy-database.sh --dry-run
```

---

## Manual Steps (If Needed)

### 1. Connect to Server
```bash
ssh root@118.25.0.190
```

### 2. Check Database
```bash
sudo -u postgres psql -d opclaw
\dt
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
\q
```

### 3. Run Migration Manually
```bash
cd /opt/opclaw/backend
export DB_PASSWORD="opclaw123"
npm run db:migrate
```

---

## Environment Variables

```bash
SERVER=root@118.25.0.190
DB_NAME=opclaw
DB_USER=opclaw
DB_PASSWORD=opclaw123
BACKEND_PATH=/opt/opclaw/backend
```

---

## Log Files

- `/tmp/opclaw-db-deployment.log` - Deployment log
- `/var/log/opclaw-migration.log` - Migration log
- `/var/log/opclaw-db-init.log` - Initialization log

---

## Troubleshooting

### Issue: Cannot connect to database
```bash
sudo -u postgres psql
CREATE DATABASE opclaw;
CREATE USER opclaw WITH PASSWORD 'opclaw123';
GRANT ALL PRIVILEGES ON DATABASE opclaw TO opclaw;
\q
```

### Issue: Migration fails
```bash
cd /opt/opclaw/backend
npm run db:migrate -- --show
npm run db:migrate
```

### Issue: Wrong table count
```bash
sudo -u postgres psql -c "DROP DATABASE opclaw;"
sudo -u postgres psql -c "CREATE DATABASE opclaw;"
cd /opt/opclaw/backend
npm run db:migrate
```

---

## Scripts Created

| Script | Size | Purpose |
|--------|------|---------|
| deploy-database.sh | 14K | Main deployment |
| run-migration.sh | 9.5K | Execute migration |
| verify-database.sh | 12K | Verify results |
| test-migration-local.sh | 6.8K | Local testing |

---

## Documentation

- `docs/DATABASE_MIGRATION_CLOUD.md` - Complete guide (12K)
- `claudedocs/TASK-059_DATABASE_MIGRATION_SUMMARY.md` - Implementation summary

---

## Success Criteria

All met ✅:
- ✅ Migration scripts ready
- ✅ Deployment scripts ready
- ✅ Verification scripts ready
- ✅ Local tests passed
- ✅ Documentation complete
- ✅ Ready to execute

---

## Next Steps

1. **Execute**: `./deploy-database.sh`
2. **Verify**: `./verify-database.sh --remote`
3. **Continue**: TASK-060 (Backend deployment)

---

**Total Implementation Time**: ~2 hours
**Total Lines of Code**: ~3,600
**Test Pass Rate**: 100%
**Ready to Execute**: Yes ✅
