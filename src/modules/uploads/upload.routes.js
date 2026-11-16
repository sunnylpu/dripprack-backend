import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { uploadController } from './upload.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { ApiError } from '../../utils/ApiError.js';

const router = Router();

// Configure temporary disk storage for robust multi-part streaming of large videos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, os.tmpdir());
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `upload-${uniqueSuffix}${ext}`);
  }
});

// File filter supporting video streams (.mp4, .webm, .mov) and high-res imagery (.jpg, .png, .webp)
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // Video streams
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-m4v',
    'video/ogg',
    // Imagery & graphics
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml'
  ];

  if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(
      ApiError.badRequest(
        `Unsupported media type "${file.mimetype}". Allowed types: MP4, WebM, MOV, JPG, PNG, WebP, SVG.`
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB max limit for ambient videos
  }
});

// Wrapper to map multer errors into standard ApiError instances
function handleMulterUpload(req, res, next) {
  const uploadSingle = upload.single('file');
  uploadSingle(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(ApiError.badRequest('Uploaded media file exceeds the maximum 100MB limit'));
      }
      return next(ApiError.badRequest(`File upload error: ${err.message}`));
    } else if (err) {
      return next(err);
    }
    next();
  });
}

// Public: Stream or download uploaded video/image asset with HTTP 206 support
router.get('/file/:id/:filename?', uploadController.streamFile);

// Admin-only: Upload new media asset
router.post('/', authenticate, authorize('admin'), handleMulterUpload, uploadController.uploadSingle);

// Admin-only: List library of uploaded media assets
router.get('/', authenticate, authorize('admin'), uploadController.listUploads);

// Admin-only: Delete media asset
router.delete('/:id', authenticate, authorize('admin'), uploadController.deleteUpload);

export default router;
