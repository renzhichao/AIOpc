/**
 * Migration Verification Script
 *
 * This script validates the migration SQL without actually running it.
 * Useful for testing and validation before database deployment.
 */

import * as fs from 'fs';
import * as path from 'path';



const migrationPath = path.join(__dirname, '../migrations/1700000000000-InitialSchema.ts');

console.log('🔍 Verifying migration file...\n');

// Read migration file
const migrationContent = fs.readFileSync(migrationPath, 'utf-8');

// Extract tables from CREATE TABLE statements
const tableRegex = /CREATE TABLE "(\w+)"/g;
const tables: string[] = [];
let match;

while ((match = tableRegex.exec(migrationContent)) !== null) {
  tables.push(match[1]);
}

console.log(`✅ Found ${tables.length} tables to create:\n`);
tables.forEach((table, index) => {
  console.log(`   ${index + 1}. ${table}`);
});

// Expected tables
const expectedTables = [
  'users',
  'api_keys',
  'qr_codes',
  'instances',
  'documents',
  'document_chunks',
  'instance_metrics',
  'instance_renewals',
];

console.log('\n📊 Validation Results:\n');

// Check if all expected tables are present
const missingTables = expectedTables.filter((t) => !tables.includes(t));
const extraTables = tables.filter((t) => !expectedTables.includes(t));

if (missingTables.length > 0) {
  console.log(`❌ Missing tables: ${missingTables.join(', ')}`);
} else {
  console.log('✅ All expected tables are present');
}

if (extraTables.length > 0) {
  console.log(`⚠️  Extra tables found: ${extraTables.join(', ')}`);
}

// Check for foreign keys (note: regex accounts for variable whitespace)
const fkRegex = /ALTER TABLE "(\w+)" ADD CONSTRAINT "FK_\w+" FOREIGN KEY \("(\w+)"\) REFERENCES "(\w+)"\s*\("(\w+)"\)/g;
const foreignKeys: Array<{ table: string; column: string; refTable: string; refColumn: string }> = [];

while ((match = fkRegex.exec(migrationContent)) !== null) {
  foreignKeys.push({
    table: match[1],
    column: match[2],
    refTable: match[3],
    refColumn: match[4],
  });
}

console.log(`\n✅ Found ${foreignKeys.length} foreign key constraints:\n`);
foreignKeys.forEach((fk) => {
  console.log(`   • ${fk.table}.${fk.column} → ${fk.refTable}.${fk.refColumn}`);
});

// Expected foreign keys
const expectedFKs = [
  { table: 'instances', column: 'owner_id', refTable: 'users', refColumn: 'id' },
  { table: 'document_chunks', column: 'document_id', refTable: 'documents', refColumn: 'id' },
  { table: 'instance_metrics', column: 'instance_id', refTable: 'instances', refColumn: 'instance_id' },
  { table: 'instance_renewals', column: 'instance_id', refTable: 'instances', refColumn: 'instance_id' },
  { table: 'instance_renewals', column: 'renewed_by', refTable: 'users', refColumn: 'id' },
];

const missingFKs = expectedFKs.filter(
  (expected) => !foreignKeys.some(
    (fk) => fk.table === expected.table &&
           fk.column === expected.column &&
           fk.refTable === expected.refTable
  )
);

if (missingFKs.length > 0) {
  console.log(`\n❌ Missing foreign keys:`);
  missingFKs.forEach((fk) => {
    console.log(`   • ${fk.table}.${fk.column} → ${fk.refTable}.${fk.refColumn}`);
  });
} else {
  console.log('\n✅ All expected foreign keys are present');
}

// Check for indexes
const indexRegex = /CREATE INDEX "IDX_\w+" ON "(\w+)" \("(\w+)"(?:, "(\w+)")?\)/g;
const indexes: Array<{ table: string; columns: string[] }> = [];

while ((match = indexRegex.exec(migrationContent)) !== null) {
  const columns = [match[2]];
  if (match[3]) columns.push(match[3]);
  indexes.push({ table: match[1], columns });
}

console.log(`\n✅ Found ${indexes.length} indexes:\n`);
const indexesByTable: Record<string, string[]> = {};
indexes.forEach((idx) => {
  if (!indexesByTable[idx.table]) indexesByTable[idx.table] = [];
  indexesByTable[idx.table].push(idx.columns.join(', '));
});

Object.entries(indexesByTable).forEach(([table, cols]) => {
  console.log(`   ${table}: ${cols.length} index(es)`);
});

// Final summary
console.log('\n' + '='.repeat(60));
console.log('📋 Summary:');
console.log('='.repeat(60));
console.log(`✅ Tables: ${tables.length}/${expectedTables.length}`);
console.log(`✅ Foreign Keys: ${foreignKeys.length}/${expectedFKs.length}`);
console.log(`✅ Indexes: ${indexes.length}`);
console.log('='.repeat(60) + '\n');

if (missingTables.length === 0 && missingFKs.length === 0) {
  console.log('✨ Migration validation passed!\n');
  console.log('🚀 Ready to run: npm run db:init\n');
} else {
  console.log('⚠️  Migration validation found issues. Please review.\n');
  process.exit(1);
}
