import { uploadService } from './upload.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { env } from '../../config/env.js';

export const uploadController = {
  /**
   * Handle single file upload (videos or images)
   */
  uploadSingle: asyncHandler(async (req, res) => {
    if (!req.file) {
      throw ApiError.badRequest('No file was provided for upload');
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${protocol}://${host}${env.API_PREFIX}`;

    const uploaded = await uploadService.saveFile({
      filePath: req.file.path,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      user: req.user,
      baseUrl
    });

    return ApiResponse.created(res, {
      message: 'Media asset uploaded successfully',
      data: uploaded
    });
  }),

  /**
   * Stream media file with HTTP 206 Partial Content (essential for mobile & Safari video playback)
   */
  streamFile: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const fileDoc = await uploadService.getFileDoc(id);
    const contentType = fileDoc.contentType || fileDoc.metadata?.mimeType || 'application/octet-stream';
    const fileSize = fileDoc.length;
    const range = req.headers.range;

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        return res.status(416).send('Requested range not satisfiable');
      }

      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Content-Length': chunkSize,
        'Content-Type': contentType
      });

      const downloadStream = uploadService.getDownloadStream(id, { start, end: end + 1 });
      downloadStream.on('error', () => {
        if (!res.headersSent) {
          res.status(500).send('Streaming error');
        }
      });
      downloadStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType
      });

      const downloadStream = uploadService.getDownloadStream(id);
      downloadStream.on('error', () => {
        if (!res.headersSent) {
          res.status(500).send('Streaming error');
        }
      });
      downloadStream.pipe(res);
    }
  }),

  /**
   * List uploaded media assets (Admin only)
   */
  listUploads: asyncHandler(async (req, res) => {
    const { limit, skip, type } = req.query;
    const files = await uploadService.listFiles({ limit, skip, type });
    return ApiResponse.success(res, {
      message: 'Media assets retrieved successfully',
      data: { files }
    });
  }),

  /**
   * Delete uploaded asset (Admin only)
   */
  deleteUpload: asyncHandler(async (req, res) => {
    const { id } = req.params;
    await uploadService.deleteFile(id);
    return ApiResponse.success(res, {
      message: 'Media asset deleted successfully'
    });
  })
};
