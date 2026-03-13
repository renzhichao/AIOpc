import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('document_chunks')
export class DocumentChunk {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  document_id: number;

  @Column()
  chunk_index: number;

  @Column({ type: 'text' })
  content: string;

  // Note: Vector column is created via migration and managed separately
  // TypeORM doesn't natively support pgvector column type
  @Column({ type: 'jsonb', nullable: true })
  @Index()
  embedding: number[];

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
