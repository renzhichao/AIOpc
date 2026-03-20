import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, OneToMany } from 'typeorm';
import { Conversation } from './Conversation.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  @Index()
  feishu_user_id: string;

  @Column({ nullable: true })
  feishu_union_id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  avatar_url: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_login_at: Date;

  /**
   * Relationship to user's conversations
   */
  @OneToMany(() => Conversation, (conversation) => conversation.user)
  conversations: Conversation[];
}
