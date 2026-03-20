import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Conversation } from './Conversation.entity';

/**
 * ConversationMessage Entity
 *
 * Represents a single message within a conversation.
 * Stores both user messages and AI assistant responses.
 */
@Entity('conversation_messages')
export class ConversationMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id' })
  @Index()
  conversation_id: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE' // Delete messages when conversation is deleted
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  /**
   * Message role: who sent this message
   */
  @Column({
    name: 'role',
    type: 'enum',
    enum: ['user', 'assistant', 'system']
  })
  @Index()
  role: 'user' | 'assistant' | 'system';

  /**
   * Message content (text format)
   */
  @Column({ type: 'text' })
  content: string;

  /**
   * Tool calls made by the assistant (for agent messages)
   * Format: [{name: 'web_search', arguments: '{...}', id: 'call_...'}]
   */
  @Column({ type: 'jsonb', nullable: true })
  tool_calls: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;

  /**
   * Tool execution results (for user messages after tool calls)
   * Format: [{tool_call_id: 'call_...', output: '...'}]
   */
  @Column({ type: 'jsonb', nullable: true })
  tool_results: Array<{
    tool_call_id: string;
    output: any;
  }>;

  @CreateDateColumn({ name: 'created_at' })
  @Index()
  created_at: Date;

  /**
   * Additional metadata for extensibility
   * Examples: token count, model version, error info
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;
}
