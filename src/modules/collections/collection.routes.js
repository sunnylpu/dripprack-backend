import { Router } from 'express';
import { collectionController } from './collection.controller.js';
import {
  collectionParamsSchema,
  collectionSlugParamsSchema,
  createCollectionSchema,
  updateCollectionSchema
} from './collection.validation.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { cacheControl } from '../../middleware/cacheControl.js';

const router = Router();

// Public storefront endpoints
router.get('/', cacheControl(120, 300), collectionController.getPublicCollections);
router.get('/detail/:slug', cacheControl(120, 300), validateRequest(collectionSlugParamsSchema), collectionController.getPublicCollectionBySlug);

// Admin backoffice endpoints
router.get('/admin/all', authenticate, authorize('admin'), collectionController.getAdminCollections);
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validateRequest(createCollectionSchema),
  collectionController.createCollection
);
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  validateRequest(updateCollectionSchema),
  collectionController.updateCollection
);
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validateRequest(collectionParamsSchema),
  collectionController.deleteCollection
);

export default router;
