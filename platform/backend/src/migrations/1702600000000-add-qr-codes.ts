import { MigrationInterface, QueryRunner } from 'typeorm';

export class addQrCodes1702600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create qr_codes table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS qr_codes (
        id SERIAL PRIMARY KEY,
        instance_id VARCHAR(64) UNIQUE NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        state VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        scan_count INTEGER DEFAULT 0,
        claimed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes for qr_codes
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_qr_codes_token ON qr_codes(token);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_qr_codes_expires_at ON qr_codes(expires_at);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_qr_codes_instance_id ON qr_codes(instance_id);`);

    // Add foreign key constraint to instances table
    await queryRunner.query(`
      ALTER TABLE qr_codes
      ADD CONSTRAINT fk_qr_codes_instance
      FOREIGN KEY (instance_id)
      REFERENCES instances(instance_id)
      ON DELETE CASCADE;
    `);

    console.log('✅ QR codes table created successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS qr_codes;`);
    console.log('✅ QR codes table dropped successfully');
  }
}
