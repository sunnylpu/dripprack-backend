import { Router } from 'express';
import { categoryController } from './category.controller.js';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryParamsSchema
} from './category.validation.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();

// Public: Get all active categories
router.get('/', categoryController.getActiveCategories);

// Public: Get single category by ID
router.get('/:id', validateRequest(categoryParamsSchema), categoryController.getCategoryById);

// Admin only: Create category
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validateRequest(createCategorySchema),
  categoryController.createCategory
);

// Admin only: Update category
router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  validateRequest(updateCategorySchema),
  categoryController.updateCategory
);

// Admin only: Deactivate category (soft delete)
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validateRequest(categoryParamsSchema),
  categoryController.deactivateCategory
);

export default router;
