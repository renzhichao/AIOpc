import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Instance } from './Instance.entity';

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  instance_id: string;

  @ManyToOne(() => Instance)
  @JoinColumn({ name: 'instance_id' })
  instance: Instance;

  @Column()
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ default: 'general' })
  @Index()
  category: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
