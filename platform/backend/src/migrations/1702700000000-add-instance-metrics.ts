import { MigrationInterface, QueryRunner } from 'typeorm';

export class addInstanceMetrics1702700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create instance_metrics table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS instance_metrics (
        id SERIAL PRIMARY KEY,
        instance_id VARCHAR(255) NOT NULL,
        metric_type VARCHAR(50) NOT NULL,
        metric_value NUMERIC NOT NULL,
        unit VARCHAR(20),
        recorded_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (instance_id)
          REFERENCES instances(instance_id)
          ON DELETE CASCADE
      );
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_instance_metrics_time
      ON instance_metrics(instance_id, recorded_at);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_metrics_type_time
      ON instance_metrics(metric_type, recorded_at);
    `);

    // Create aggregation view for daily metrics
    await queryRunner.query(`
      CREATE OR REPLACE VIEW v_instance_daily_metrics AS
      SELECT
        instance_id,
        metric_type,
        date(recorded_at) as metric_date,
        AVG(metric_value)::numeric(10,2) as avg_value,
        MAX(metric_value)::numeric(10,2) as max_value,
        MIN(metric_value)::numeric(10,2) as min_value,
        SUM(metric_value)::numeric(10,2) as total_value,
        COUNT(*) as sample_count
      FROM instance_metrics
      GROUP BY instance_id, metric_type, date(recorded_at);
    `);

    console.log('✅ Instance metrics table and views created successfully');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS v_instance_daily_metrics;`);
    await queryRunner.query(`DROP TABLE IF EXISTS instance_metrics;`);
    console.log('✅ Instance metrics table and views dropped successfully');
  }
}
