import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Instance } from './Instance.entity';

@Entity('qr_codes')
export class QRCode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'instance_id', unique: true, type: 'integer' })
  @Index()
  instance_id: number;

  @Column({ unique: true })
  @Index()
  token: string;

  @Column()
  state: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  @Index()
  expires_at: Date;

  @Column({ name: 'scan_count', default: 0 })
  scan_count: number;

  @Column({ name: 'claimed_at', type: 'timestamp', nullable: true })
  claimed_at: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => Instance)
  @JoinColumn({ name: 'instance_id' })
  instance: Instance;
}
