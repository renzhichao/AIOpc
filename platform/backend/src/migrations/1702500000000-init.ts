import { MigrationInterface, QueryRunner } from 'typeorm';

export class init1702500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        feishu_user_id VARCHAR(64) UNIQUE NOT NULL,
        feishu_union_id VARCHAR(64),
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255),
        avatar_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login_at TIMESTAMP
      );
    `);

    // Create indexes for users
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_users_feishu_id ON users(feishu_user_id);`);

    // Create instances table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS instances (
        id SERIAL PRIMARY KEY,
        instance_id VARCHAR(64) UNIQUE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'stopped', 'error', 'recovering')),
        template VARCHAR(50),
        config JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        claimed_at TIMESTAMP,
        docker_container_id VARCHAR(64),
        restart_attempts INTEGER DEFAULT 0,
        health_status JSONB
      );
    `);

    // Create indexes for instances
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_instances_instance_id ON instances(instance_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_instances_status ON instances(status);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_instances_owner ON instances(owner_id);`);

    // Create api_keys table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(50) NOT NULL,
        encrypted_key TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        usage_count INTEGER DEFAULT 0,
        quota INTEGER DEFAULT 1000,
        metadata JSONB,
        current_instance_id VARCHAR(64),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_used_at TIMESTAMP
      );
    `);

    // Create indexes for api_keys
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_api_keys_instance ON api_keys(current_instance_id);`);

    // Create documents table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        instance_id VARCHAR(64) NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'general',
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for documents
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_documents_instance_id ON documents(instance_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);`);

    // Create document_chunks table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id SERIAL PRIMARY KEY,
        document_id INTEGER NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for document_chunks
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);`);

    // Note: pgvector extension and vector indexes can be added later when needed
    console.log('✅ Database tables created successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order due to foreign key constraints
    await queryRunner.query(`DROP TABLE IF EXISTS document_chunks;`);
    await queryRunner.query(`DROP TABLE IF EXISTS documents;`);
    await queryRunner.query(`DROP TABLE IF EXISTS api_keys;`);
    await queryRunner.query(`DROP TABLE IF EXISTS instances;`);
    await queryRunner.query(`DROP TABLE IF EXISTS users;`);
  }
}
