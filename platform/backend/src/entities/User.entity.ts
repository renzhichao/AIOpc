import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, OneToMany } from 'typeorm';
import { Conversation } from './Conversation.entity';

/**
 * Supported OAuth platforms
 */
export type OAuthPlatform = 'feishu' | 'dingtalk';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * OAuth platform identifier (TASK-008)
   * Default: 'feishu' for backward compatibility
   */
  @Column({ type: 'varchar', length: 20, default: 'feishu' })
  @Index()
  oauth_platform: OAuthPlatform;

  /**
   * Feishu OAuth fields (nullable for multi-platform support)
   */
  @Column({ nullable: true })
  @Index()
  feishu_user_id: string;

  @Column({ nullable: true })
  feishu_union_id: string;

  /**
   * DingTalk OAuth fields (TASK-008)
   * UNIQUE constraint added in TASK-003 migration
   */
  @Column({ nullable: true })
  @Index()
  dingtalk_user_id: string;

  @Column({ nullable: true })
  dingtalk_union_id: string;

  /**
   * Common user fields
   */
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
