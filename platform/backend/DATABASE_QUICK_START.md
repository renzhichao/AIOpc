# Database Quick Start Guide

**For developers who need to get the database running NOW.**

## 30-Second Setup

```bash
# 1. Copy environment file
cd platform/backend
cp .env.example .env

# 2. Edit .env (set your password)
# DB_PASSWORD=your_password

# 3. Create database
createdb opclaw

# 4. Initialize schema
npm run db:init

# 5. Start development
npm run dev
```

**That's it!** Your database is ready.

---

## Common Commands

### Initialize Database
```bash
npm run db:init
```

### Run Migrations
```bash
npm run db:migrate
```

### Revert Last Migration
```bash
npm run db:revert
```

### Create New Migration
```bash
npm run db:generate -- -n MigrationName
```

### Verify Schema
```bash
npx ts-node scripts/verify-migration.ts
```

---

## Troubleshooting

### "relation does not exist"
```bash
npm run db:init
```

### "database does not exist"
```bash
createdb opclaw
```

### "connection refused"
```bash
# Check PostgreSQL is running
pg_isready

# Start PostgreSQL if needed
brew services start postgresql  # macOS
sudo systemctl start postgresql # Linux
```

---

## Development Mode

Want auto-sync? Edit `.env`:
```bash
DB_SYNC=true
```

⚠️ **WARNING**: Never use `DB_SYNC=true` in production!

---

## Production Deployment

```bash
# Set environment
export NODE_ENV=production
export DB_SYNC=false

# Run migrations
npm run db:migrate

# Start application
npm run build
npm start
```

---

## Check Tables

```bash
# List all tables
psql -U opclaw -d opclaw -c "\dt"

# Check specific table
psql -U opclaw -d opclaw -c "\d instances"
```

---

## Need More?

- **Full Setup Guide**: [DATABASE_SETUP.md](./DATABASE_SETUP.md)
- **Migration Guide**: [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md)
- **Troubleshooting**: See DATABASE_SETUP.md

---

**Quick Reference**:
- ✅ 8 tables created
- ✅ 5 foreign keys
- ✅ 18 indexes
- ✅ Ready to use
