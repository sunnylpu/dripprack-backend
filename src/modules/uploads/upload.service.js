import mongoose from 'mongoose';
import fs from 'fs';
import { ApiError } from '../../utils/ApiError.js';

function getBucket() {
  if (!mongoose.connection.db) {
    throw ApiError.internal('Database connection is not initialized yet');
  }
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'media_uploads'
  });
}

export const uploadService = {
  /**
   * Save uploaded file to MongoDB GridFS for persistent storage across cloud deployments
   */
  async saveFile({ filePath, originalname, mimetype, size, user, baseUrl }) {
    const bucket = getBucket();
    const cleanFilename = originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uploadStream = bucket.openUploadStream(cleanFilename, {
      contentType: mimetype,
      metadata: {
        originalName: originalname,
        mimeType: mimetype,
        size,
        uploadedBy: user?._id || user?.id || 'admin',
        createdAt: new Date()
      }
    });

    const fileStream = fs.createReadStream(filePath);

    await new Promise((resolve, reject) => {
      fileStream.pipe(uploadStream)
        .on('finish', resolve)
        .on('error', reject);
    });

    // Clean up temporary disk file safely
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // Ignore temp unlink errors
    }

    const fileId = uploadStream.id.toString();
    const url = `${baseUrl}/uploads/file/${fileId}/${cleanFilename}`;

    return {
      id: fileId,
      url,
      filename: cleanFilename,
      originalName: originalname,
      mimeType: mimetype,
      size
    };
  },

  /**
   * Get file metadata from GridFS
   */
  async getFileDoc(id) {
    const bucket = getBucket();
    let objectId;
    try {
      objectId = new mongoose.Types.ObjectId(id);
    } catch {
      throw ApiError.notFound('Invalid file ID format');
    }

    const files = await bucket.find({ _id: objectId }).toArray();
    if (!files || files.length === 0) {
      throw ApiError.notFound('Requested media file was not found');
    }
    return files[0];
  },

  /**
   * Get download stream with optional byte range for video seeking
   */
  getDownloadStream(id, options = {}) {
    const bucket = getBucket();
    const objectId = new mongoose.Types.ObjectId(id);
    return bucket.openDownloadStream(objectId, options);
  },

  /**
   * Delete file from GridFS
   */
  async deleteFile(id) {
    const bucket = getBucket();
    let objectId;
    try {
      objectId = new mongoose.Types.ObjectId(id);
    } catch {
      throw ApiError.notFound('Invalid file ID format');
    }
    await bucket.delete(objectId);
    return { success: true };
  },

  /**
   * List files in the media library
   */
  async listFiles({ limit = 50, skip = 0, type } = {}) {
    const bucket = getBucket();
    const query = {};
    if (type === 'video') {
      query.contentType = { $regex: '^video/' };
    } else if (type === 'image') {
      query.contentType = { $regex: '^image/' };
    }

    const files = await bucket.find(query)
      .sort({ uploadDate: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .toArray();

    return files.map((f) => ({
      id: f._id.toString(),
      filename: f.filename,
      contentType: f.contentType,
      size: f.length,
      uploadDate: f.uploadDate,
      metadata: f.metadata
    }));
  }
};
