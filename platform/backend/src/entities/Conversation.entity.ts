import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from './User.entity';
import { Instance } from './Instance.entity';
import { ConversationMessage } from './ConversationMessage.entity';

/**
 * Conversation Entity
 *
 * Represents a chat conversation session between a user and an AI agent.
 * Each conversation belongs to one user and one instance.
 */
@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  @Index()
  user_id: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'instance_id' })
  @Index()
  instance_id: number;

  @ManyToOne(() => Instance)
  @JoinColumn({ name: 'instance_id' })
  instance: Instance;

  /**
   * Conversation title (auto-generated from first message or user-defined)
   */
  @Column({ name: 'title', default: '未命名会话' })
  title: string;

  /**
   * Timestamp of the last message in this conversation
   * Used for sorting conversations by recency
   */
  @Column({ name: 'last_message_at', type: 'timestamp', nullable: true })
  @Index()
  last_message_at: Date;

  /**
   * Total number of messages in this conversation
   * Updated by database trigger for performance
   */
  @Column({ name: 'message_count', default: 0 })
  message_count: number;

  /**
   * Whether this conversation is archived
   * Archived conversations are hidden from main list
   */
  @Column({ name: 'is_archived', default: false })
  @Index()
  is_archived: boolean;

  /**
   * Additional metadata for extensibility
   * Examples: agent settings, UI preferences, tags
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  @Index()
  created_at: Date;

  /**
   * Relationship to messages in this conversation
   */
  @OneToMany(() => ConversationMessage, (message) => message.conversation)
  messages: ConversationMessage[];
}
