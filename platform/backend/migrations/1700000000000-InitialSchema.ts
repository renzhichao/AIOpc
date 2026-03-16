import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" SERIAL PRIMARY KEY,
        "feishu_user_id" character varying NOT NULL UNIQUE,
        "feishu_union_id" character varying,
        "name" character varying NOT NULL,
        "email" character varying,
        "avatar_url" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "last_login_at" TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_USERS_FEISHU_USER_ID" ON "users" ("feishu_user_id")
    `);

    // Create api_keys table
    await queryRunner.query(`
      CREATE TABLE "api_keys" (
        "id" SERIAL PRIMARY KEY,
        "provider" character varying NOT NULL,
        "encrypted_key" character varying NOT NULL,
        "status" character varying NOT NULL DEFAULT 'active',
        "usage_count" integer NOT NULL DEFAULT 0,
        "quota" integer NOT NULL DEFAULT 1000,
        "metadata" jsonb,
        "current_instance_id" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "last_used_at" TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_API_KEYS_PROVIDER" ON "api_keys" ("provider")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_API_KEYS_STATUS" ON "api_keys" ("status")
    `);

    // Create qr_codes table
    await queryRunner.query(`
      CREATE TABLE "qr_codes" (
        "id" SERIAL PRIMARY KEY,
        "instance_id" character varying NOT NULL UNIQUE,
        "token" character varying NOT NULL UNIQUE,
        "state" character varying NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "scan_count" integer NOT NULL DEFAULT 0,
        "claimed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_QR_CODES_INSTANCE_ID" ON "qr_codes" ("instance_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_QR_CODES_TOKEN" ON "qr_codes" ("token")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_QR_CODES_EXPIRES_AT" ON "qr_codes" ("expires_at")
    `);

    // Create instances table
    await queryRunner.query(`
      CREATE TABLE "instances" (
        "id" SERIAL PRIMARY KEY,
        "instance_id" character varying NOT NULL UNIQUE,
        "status" character varying NOT NULL DEFAULT 'pending',
        "template" character varying,
        "name" character varying,
        "config" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP,
        "expires_at" TIMESTAMP,
        "owner_id" integer,
        "claimed_at" TIMESTAMP,
        "docker_container_id" character varying,
        "restart_attempts" integer NOT NULL DEFAULT 0,
        "health_status" character varying,
        "health_reason" text,
        "health_last_checked" TIMESTAMP,
        CONSTRAINT "CHK_INSTANCES_STATUS" CHECK ("status" IN ('pending', 'active', 'stopped', 'error', 'recovering', 'running')),
        CONSTRAINT "CHK_INSTANCES_HEALTH_STATUS" CHECK ("health_status" IN ('healthy', 'warning', 'unhealthy'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_INSTANCES_INSTANCE_ID" ON "instances" ("instance_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_INSTANCES_STATUS" ON "instances" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_INSTANCES_OWNER_ID" ON "instances" ("owner_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_INSTANCES_HEALTH_STATUS" ON "instances" ("health_status")
    `);

    await queryRunner.query(`
      ALTER TABLE "instances" ADD CONSTRAINT "FK_INSTANCES_OWNER" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // Create documents table
    await queryRunner.query(`
      CREATE TABLE "documents" (
        "id" SERIAL PRIMARY KEY,
        "instance_id" character varying NOT NULL,
        "title" character varying NOT NULL,
        "content" text NOT NULL,
        "category" character varying NOT NULL DEFAULT 'general',
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_DOCUMENTS_INSTANCE_ID" ON "documents" ("instance_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_DOCUMENTS_CATEGORY" ON "documents" ("category")
    `);

    // Create document_chunks table
    await queryRunner.query(`
      CREATE TABLE "document_chunks" (
        "id" SERIAL PRIMARY KEY,
        "document_id" integer NOT NULL,
        "chunk_index" integer NOT NULL,
        "content" text NOT NULL,
        "embedding" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_DOCUMENT_CHUNKS_DOCUMENT_ID" ON "document_chunks" ("document_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_DOCUMENT_CHUNKS_EMBEDDING" ON "document_chunks" ("embedding")
    `);

    await queryRunner.query(`
      ALTER TABLE "document_chunks" ADD CONSTRAINT "FK_DOCUMENT_CHUNKS_DOCUMENT" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Create instance_metrics table
    await queryRunner.query(`
      CREATE TABLE "instance_metrics" (
        "id" SERIAL PRIMARY KEY,
        "instance_id" character varying NOT NULL,
        "metric_type" character varying(50) NOT NULL,
        "metric_value" numeric NOT NULL,
        "unit" character varying(20),
        "recorded_at" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "CK_INSTANCE_METRICS_TYPE" CHECK ("metric_type" IN ('cpu_usage', 'memory_usage', 'memory_percent', 'memory_limit', 'network_rx_bytes', 'network_tx_bytes', 'disk_read_bytes', 'disk_write_bytes', 'message_count', 'token_usage'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_INSTANCE_METRICS_INSTANCE_ID_RECORDED_AT" ON "instance_metrics" ("instance_id", "recorded_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_INSTANCE_METRICS_TYPE_RECORDED_AT" ON "instance_metrics" ("metric_type", "recorded_at")
    `);

    await queryRunner.query(`
      ALTER TABLE "instance_metrics" ADD CONSTRAINT "FK_INSTANCE_METRICS_INSTANCE" FOREIGN KEY ("instance_id") REFERENCES "instances" ("instance_id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // Create instance_renewals table
    await queryRunner.query(`
      CREATE TABLE "instance_renewals" (
        "id" SERIAL PRIMARY KEY,
        "instance_id" character varying NOT NULL,
        "old_expires_at" TIMESTAMP NOT NULL,
        "new_expires_at" TIMESTAMP NOT NULL,
        "duration_days" integer NOT NULL,
        "renewed_by" integer NOT NULL,
        "renewed_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_INSTANCE_RENEWALS_INSTANCE_ID" ON "instance_renewals" ("instance_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_INSTANCE_RENEWALS_RENEWED_BY" ON "instance_renewals" ("renewed_by")
    `);

    await queryRunner.query(`
      ALTER TABLE "instance_renewals" ADD CONSTRAINT "FK_INSTANCE_RENEWALS_INSTANCE" FOREIGN KEY ("instance_id") REFERENCES "instances" ("instance_id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "instance_renewals" ADD CONSTRAINT "FK_INSTANCE_RENEWALS_USER" FOREIGN KEY ("renewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order due to foreign key constraints
    await queryRunner.query(`ALTER TABLE "instance_renewals" DROP CONSTRAINT "FK_INSTANCE_RENEWALS_USER"`);
    await queryRunner.query(`ALTER TABLE "instance_renewals" DROP CONSTRAINT "FK_INSTANCE_RENEWALS_INSTANCE"`);
    await queryRunner.query(`ALTER TABLE "instance_metrics" DROP CONSTRAINT "FK_INSTANCE_METRICS_INSTANCE"`);
    await queryRunner.query(`ALTER TABLE "document_chunks" DROP CONSTRAINT "FK_DOCUMENT_CHUNKS_DOCUMENT"`);
    await queryRunner.query(`ALTER TABLE "instances" DROP CONSTRAINT "FK_INSTANCES_OWNER"`);

    await queryRunner.query(`DROP TABLE "instance_renewals"`);
    await queryRunner.query(`DROP TABLE "instance_metrics"`);
    await queryRunner.query(`DROP TABLE "document_chunks"`);
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(`DROP TABLE "instances"`);
    await queryRunner.query(`DROP TABLE "qr_codes"`);
    await queryRunner.query(`DROP TABLE "api_keys"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
