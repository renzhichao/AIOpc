/**
 * File Storage Service
 *
 * Handles temporary file storage for chat attachments.
 * Files are stored on disk with automatic cleanup after expiration.
 *
 * Features:
 * - Temporary file storage (24h default expiry)
 * - File validation (type, size)
 * - Automatic cleanup of expired files
 * - File metadata tracking
 *
 * @service
 */

import { Service } from 'typedi';
import { promises as fs } from 'fs';
import { join } from 'path';
import { logger } from '../config/logger';

/**
 * File metadata
 */
export interface FileMetadata {
  fileId: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  expiresAt: Date;
  path: string;
  url: string;
}

/**
 * Storage configuration
 */
interface StorageConfig {
  uploadDir: string;
  maxFileSize: number; // bytes
  maxFilesPerUser: number;
  defaultExpiryHours: number;
  allowedMimeTypes: string[];
}

@Service()
export class FileStorageService {
  private readonly config: StorageConfig = {
    uploadDir: process.env.UPLOAD_DIR || '/tmp/opclaw-uploads',
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFilesPerUser: 50,
    defaultExpiryHours: 24,
    allowedMimeTypes: [
      // Images
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/webp',
      // Documents
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/json',
      'text/markdown',
      // Data files
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/xml',
    ],
  };

  private files: Map<string, FileMetadata> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeStorage();
    this.startCleanupInterval();
  }

  /**
   * Initialize storage directory
   */
  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.config.uploadDir, { recursive: true });
      logger.info('File storage initialized', { uploadDir: this.config.uploadDir });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to initialize storage directory', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Store uploaded file
   */
  async storeFile(
    userId: number,
    originalName: string,
    mimeType: string,
    buffer: Buffer
  ): Promise<FileMetadata> {
    // Validate file size
    if (buffer.length > this.config.maxFileSize) {
      throw new Error(`File size exceeds maximum of ${this.config.maxFileSize / 1024 / 1024}MB`);
    }

    // Validate mime type
    if (!this.config.allowedMimeTypes.includes(mimeType)) {
      throw new Error(`File type ${mimeType} is not allowed`);
    }

    // Check user file count
    const userFileCount = Array.from(this.files.values()).filter(
      (f) => f.fileId.startsWith(`${userId}-`)
    ).length;

    if (userFileCount >= this.config.maxFilesPerUser) {
      throw new Error(`Maximum ${this.config.maxFilesPerUser} files per user exceeded`);
    }

    // Generate unique file ID
    const fileId = `${userId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const extension = this.getExtension(mimeType);
    const filename = `${fileId}${extension}`;
    const filepath = join(this.config.uploadDir, filename);

    // Write file to disk
    await fs.writeFile(filepath, buffer);

    // Create metadata
    const uploadedAt = new Date();
    const expiresAt = new Date(
      uploadedAt.getTime() + this.config.defaultExpiryHours * 60 * 60 * 1000
    );

    const metadata: FileMetadata = {
      fileId,
      originalName,
      mimeType,
      size: buffer.length,
      uploadedAt,
      expiresAt,
      path: filepath,
      url: `/api/chat/files/${fileId}`,
    };

    this.files.set(fileId, metadata);

    logger.info('File stored', {
      fileId,
      userId,
      originalName,
      size: buffer.length,
      mimeType,
    });

    return metadata;
  }

  /**
   * Get file metadata
   */
  getFile(fileId: string): FileMetadata | null {
    return this.files.get(fileId) || null;
  }

  /**
   * Get file content
   */
  async getFileContent(fileId: string): Promise<Buffer> {
    const metadata = this.files.get(fileId);
    if (!metadata) {
      throw new Error(`File ${fileId} not found`);
    }

    try {
      return await fs.readFile(metadata.path);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to read file', { fileId, error: errorMessage });
      throw new Error(`Failed to read file: ${errorMessage}`);
    }
  }

  /**
   * Delete file
   */
  async deleteFile(fileId: string): Promise<void> {
    const metadata = this.files.get(fileId);
    if (!metadata) {
      return;
    }

    try {
      await fs.unlink(metadata.path);
      this.files.delete(fileId);
      logger.debug('File deleted', { fileId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to delete file', { fileId, error: errorMessage });
    }
  }

  /**
   * Cleanup expired files
   */
  private async cleanupExpiredFiles(): Promise<void> {
    const now = new Date();
    const expiredFiles: string[] = [];

    this.files.forEach((metadata, fileId) => {
      if (metadata.expiresAt < now) {
        expiredFiles.push(fileId);
      }
    });

    for (const fileId of expiredFiles) {
      await this.deleteFile(fileId);
    }

    if (expiredFiles.length > 0) {
      logger.info('Cleaned up expired files', { count: expiredFiles.length });
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredFiles(),
      60 * 60 * 1000
    );

    logger.info('File storage cleanup interval started', {
      intervalMs: 60 * 60 * 1000,
    });
  }

  /**
   * Get file extension from mime type
   */
  private getExtension(mimeType: string): string {
    const extensions: Record<string, string> = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
      'text/plain': '.txt',
      'text/csv': '.csv',
      'application/json': '.json',
      'text/markdown': '.md',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'text/xml': '.xml',
    };

    return extensions[mimeType] || '.bin';
  }

  /**
   * Get storage statistics
   */
  getStats(): {
    totalFiles: number;
    totalSize: number;
    filesByUser: Map<number, number>;
  } {
    let totalSize = 0;
    const filesByUser = new Map<number, number>();

    this.files.forEach((metadata) => {
      totalSize += metadata.size;
      const userId = parseInt(metadata.fileId.split('-')[0]);
      filesByUser.set(userId, (filesByUser.get(userId) || 0) + 1);
    });

    return {
      totalFiles: this.files.size,
      totalSize,
      filesByUser,
    };
  }

  /**
   * Destroy service
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.files.clear();
    logger.info('File storage service destroyed');
  }
}
