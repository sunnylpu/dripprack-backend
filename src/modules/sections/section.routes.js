import { Router } from 'express';
import { sectionController } from './section.controller.js';
import {
  sectionIdParamsSchema,
  sectionKeyParamsSchema,
  sectionQuerySchema,
  createSectionSchema,
  updateSectionSchema,
  toggleSectionStatusSchema
} from './section.validation.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { cacheControl } from '../../middleware/cacheControl.js';

const router = Router();

// Public: Get all sections (filterable by page, isActive) - low cache TTL for fast admin synchronization
router.get('/', cacheControl(10, 30), validateRequest(sectionQuerySchema), sectionController.getSections);

// Public: Get section by key (e.g., /api/v1/sections/key/home_hero_video)
router.get('/key/:key', cacheControl(10, 30), validateRequest(sectionKeyParamsSchema), sectionController.getSectionByKey);

// Public: Get section by ID
router.get('/:id', cacheControl(10, 30), validateRequest(sectionIdParamsSchema), sectionController.getSectionById);

// Admin only: Create new storefront section
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validateRequest(createSectionSchema),
  sectionController.createSection
);

// Admin only: Update section
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  validateRequest(updateSectionSchema),
  sectionController.updateSection
);

router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  validateRequest(updateSectionSchema),
  sectionController.updateSection
);

// Admin only: Toggle section active state
router.patch(
  '/:id/toggle',
  authenticate,
  authorize('admin'),
  validateRequest(toggleSectionStatusSchema),
  sectionController.toggleSectionStatus
);

// Admin only: Delete section
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validateRequest(sectionIdParamsSchema),
  sectionController.deleteSection
);

export default router;

