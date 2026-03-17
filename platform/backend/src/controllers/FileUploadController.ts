/**
 * File Upload Controller
 *
 * Handles file upload operations for chat attachments.
 * Files are temporarily stored and accessible to OpenClaw agents.
 *
 * Endpoints:
 * - POST /chat/upload - Upload a file
 * - GET /chat/files/:fileId - Get file content
 * - DELETE /chat/files/:fileId - Delete a file
 *
 * @controller
 */

import { Service } from 'typedi';
import { JsonController, Post, Get, Delete, Body, Req, Param, UseBefore } from 'routing-controllers';
import { AuthMiddleware, AuthRequest } from '../middleware/AuthMiddleware';
import { FileStorageService, FileMetadata } from '../services/FileStorageService';
import { logger } from '../config/logger';

/**
 * Upload response
 */
interface UploadResponse {
  success: boolean;
  file?: FileMetadata;
  error?: string;
}

/**
 * File list response
 */
interface FilesResponse {
  success: boolean;
  files?: FileMetadata[];
  error?: string;
}

@Service()
@JsonController('/chat')
@UseBefore(AuthMiddleware)
export class FileUploadController {
  constructor(private readonly fileStorage: FileStorageService) {}

  /**
   * POST /chat/upload
   *
   * Upload a file for use in chat.
   *
   * Supports:
   * - Images: PNG, JPG, GIF, WebP
   * - Documents: PDF, TXT, CSV, JSON, MD
   * - Data files: XLS, XLSX, XML
   *
   * Max file size: 10MB
   * Files expire after 24 hours
   *
   * @param req - Authenticated request with file data
   * @returns Upload response with file metadata or error
   *
   * @example
   * // Request
   * POST /api/chat/upload
   * Content-Type: multipart/form-data
   *
   * // Response (Success)
   * {
   *   "success": true,
   *   "file": {
   *     "fileId": "1-1234567890-abc123",
   *     "originalName": "document.pdf",
   *     "mimeType": "application/pdf",
   *     "size": 1234567,
   *     "uploadedAt": "2026-03-17T15:00:00.000Z",
   *     "expiresAt": "2026-03-18T15:00:00.000Z",
   *     "url": "/api/chat/files/1-1234567890-abc123"
   *   }
   * }
   *
   * // Response (Error - File too large)
   * {
   *   "success": false,
   *   "error": "File size exceeds maximum of 10MB"
   * }
   */
  @Post('/upload')
  async uploadFile(@Req() req: AuthRequest): Promise<UploadResponse> {
    try {
      const userId = req.user!.userId;

      // Check if file data exists
      if (!req.file || !req.file.buffer) {
        return {
          success: false,
          error: 'No file data received',
        };
      }

      const { originalname, mimetype, buffer } = req.file;

      logger.info('File upload requested', {
        userId,
        originalname,
        mimetype,
        size: buffer.length,
      });

      // Store file
      const metadata = await this.fileStorage.storeFile(
        userId,
        originalname,
        mimetype,
        buffer
      );

      logger.info('File uploaded successfully', {
        fileId: metadata.fileId,
        userId,
        originalName: metadata.originalName,
        size: metadata.size,
      });

      return {
        success: true,
        file: metadata,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to upload file', {
        userId: req.user?.userId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * GET /chat/files/:fileId
   *
   * Get file content by ID.
   *
   * @param fileId - File ID
   * @param req - Authenticated request
   * @returns File content or error
   *
   * @example
   * // Request
   * GET /api/chat/files/1-1234567890-abc123
   *
   * // Response (Success)
   * // Returns file content with appropriate Content-Type header
   */
  @Get('/files/:fileId')
  async getFile(
    @Param('fileId') fileId: string,
    @Req() req: AuthRequest
  ): Promise<void> {
    try {
      const metadata = this.fileStorage.getFile(fileId);

      if (!metadata) {
        req.res?.status(404).json({
          success: false,
          error: 'File not found',
        });
        return;
      }

      const content = await this.fileStorage.getFileContent(fileId);

      // Set appropriate headers
      req.res?.setHeader('Content-Type', metadata.mimeType);
      req.res?.setHeader('Content-Disposition', `inline; filename="${metadata.originalName}"`);
      req.res?.setHeader('Cache-Control', 'public, max-age=3600');

      req.res?.send(content);

      logger.debug('File retrieved', { fileId, userId: req.user?.userId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to retrieve file', {
        fileId,
        userId: req.user?.userId,
        error: errorMessage,
      });

      req.res?.status(500).json({
        success: false,
        error: 'Failed to retrieve file',
      });
    }
  }

  /**
   * DELETE /chat/files/:fileId
   *
   * Delete a file by ID.
   *
   * @param fileId - File ID
   * @param req - Authenticated request
   * @returns Deletion response
   *
   * @example
   * // Request
   * DELETE /api/chat/files/1-1234567890-abc123
   *
   * // Response (Success)
   * {
   *   "success": true
   * }
   */
  @Delete('/files/:fileId')
  async deleteFile(
    @Param('fileId') fileId: string,
    @Req() req: AuthRequest
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const metadata = this.fileStorage.getFile(fileId);

      if (!metadata) {
        return {
          success: false,
          error: 'File not found',
        };
      }

      // Verify ownership
      const fileUserId = parseInt(fileId.split('-')[0]);
      if (fileUserId !== req.user!.userId) {
        return {
          success: false,
          error: 'You do not have permission to delete this file',
        };
      }

      await this.fileStorage.deleteFile(fileId);

      logger.info('File deleted', { fileId, userId: req.user!.userId });

      return {
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to delete file', {
        fileId,
        userId: req.user?.userId,
        error: errorMessage,
      });

      return {
        success: false,
        error: 'Failed to delete file',
      };
    }
  }

  /**
   * GET /chat/files
   *
   * Get list of user's uploaded files.
   *
   * @param req - Authenticated request
   * @returns List of files or error
   *
   * @example
   * // Request
   * GET /api/chat/files
   *
   * // Response (Success)
   * {
   *   "success": true,
   *   "files": [
   *     {
   *       "fileId": "1-1234567890-abc123",
   *       "originalName": "document.pdf",
   *       "mimeType": "application/pdf",
   *       "size": 1234567,
   *       "uploadedAt": "2026-03-17T15:00:00.000Z",
   *       "expiresAt": "2026-03-18T15:00:00.000Z",
   *       "url": "/api/chat/files/1-1234567890-abc123"
   *     }
   *   ]
   * }
   */
  @Get('/files')
  async listFiles(@Req() req: AuthRequest): Promise<FilesResponse> {
    try {
      const userId = req.user!.userId;
      const stats = this.fileStorage.getStats();
      const userFiles = Array.from(stats.filesByUser.entries())
        .filter(([uid]) => uid === userId)
        .map(([, count]) => count);

      // Note: This would require tracking files by user in FileStorageService
      // For now, return empty array
      // TODO: Implement proper user file listing

      return {
        success: true,
        files: [],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Failed to list files', {
        userId: req.user?.userId,
        error: errorMessage,
      });

      return {
        success: false,
        error: 'Failed to list files',
      };
    }
  }
}
