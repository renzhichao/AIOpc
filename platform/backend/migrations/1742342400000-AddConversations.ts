import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConversations1742342400000 implements MigrationInterface {
  name = 'AddConversations1742342400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create conversations table
    await queryRunner.query(`
      CREATE TABLE "conversations" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" integer NOT NULL,
        "instance_id" integer NOT NULL,
        "title" character varying NOT NULL DEFAULT '未命名会话',
        "last_message_at" TIMESTAMP,
        "message_count" integer NOT NULL DEFAULT 0,
        "is_archived" boolean NOT NULL DEFAULT false,
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_CONVERSATIONS_USER" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_CONVERSATIONS_INSTANCE" FOREIGN KEY ("instance_id") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_CONVERSATIONS_USER_ID" ON "conversations" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_CONVERSATIONS_INSTANCE_ID" ON "conversations" ("instance_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_CONVERSATIONS_LAST_MESSAGE_AT" ON "conversations" ("last_message_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_CONVERSATIONS_IS_ARCHIVED" ON "conversations" ("is_archived")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_CONVERSATIONS_CREATED_AT" ON "conversations" ("created_at")
    `);

    // Create conversation_messages table
    await queryRunner.query(`
      CREATE TABLE "conversation_messages" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "conversation_id" UUID NOT NULL,
        "role" character varying NOT NULL CHECK ("role" IN ('user', 'assistant', 'system')),
        "content" text NOT NULL,
        "tool_calls" jsonb,
        "tool_results" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "metadata" jsonb,
        CONSTRAINT "FK_CONVERSATION_MESSAGES_CONVERSATION" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_CONVERSATION_MESSAGES_CONVERSATION_ID" ON "conversation_messages" ("conversation_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_CONVERSATION_MESSAGES_ROLE" ON "conversation_messages" ("role")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_CONVERSATION_MESSAGES_CREATED_AT" ON "conversation_messages" ("created_at")
    `);

    // Create trigger to automatically update conversation message_count
    // Note: This is a simple implementation for Phase 1
    // Phase 2 will replace this with an async queue-based approach for better performance
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_conversation_message_count()
      RETURNS TRIGGER AS $$
      BEGIN
        UPDATE conversations
        SET message_count = message_count + 1,
            last_message_at = NOW()
        WHERE id = NEW.conversation_id;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_update_message_count
      AFTER INSERT ON conversation_messages
      FOR EACH ROW
      EXECUTE FUNCTION update_conversation_message_count()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop trigger and function
    await queryRunner.query(`DROP TRIGGER IF EXISTS trigger_update_message_count ON conversation_messages`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_conversation_message_count`);

    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CONVERSATION_MESSAGES_CREATED_AT"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CONVERSATION_MESSAGES_ROLE"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CONVERSATION_MESSAGES_CONVERSATION_ID"`);

    // Drop foreign key constraint
    await queryRunner.query(`ALTER TABLE "conversation_messages" DROP CONSTRAINT "FK_CONVERSATION_MESSAGES_CONVERSATION"`);

    // Drop conversation_messages table
    await queryRunner.query(`DROP TABLE "conversation_messages"`);

    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CONVERSATIONS_CREATED_AT"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CONVERSATIONS_IS_ARCHIVED"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CONVERSATIONS_LAST_MESSAGE_AT"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CONVERSATIONS_INSTANCE_ID"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_CONVERSATIONS_USER_ID"`);

    // Drop foreign key constraints
    await queryRunner.query(`ALTER TABLE "conversations" DROP CONSTRAINT "FK_CONVERSATIONS_INSTANCE"`);
    await queryRunner.query(`ALTER TABLE "conversations" DROP CONSTRAINT "FK_CONVERSATIONS_USER"`);

    // Drop conversations table
    await queryRunner.query(`DROP TABLE "conversations"`);
  }
}
