import { Router } from 'express';
import { productController } from './product.controller.js';
import {
  createProductSchema,
  updateProductSchema,
  updateProductStatusSchema,
  productQuerySchema,
  productLookupParamsSchema
} from './product.validation.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();

// Public: Get all published products (with pagination, search, category filter, inStock, allowlisted sorting)
router.get('/', validateRequest(productQuerySchema), productController.getPublicProducts);

// Public: Get published product by ID or Slug
router.get(
  '/:idOrSlug',
  validateRequest(productLookupParamsSchema),
  productController.getPublicProductByIdOrSlug
);

// Admin only: Create product
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validateRequest(createProductSchema),
  productController.createProduct
);

// Admin only: Update product catalog fields
router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  validateRequest(updateProductSchema),
  productController.updateProduct
);

// Admin only: Update product status
router.patch(
  '/:id/status',
  authenticate,
  authorize('admin'),
  validateRequest(updateProductStatusSchema),
  productController.updateProductStatus
);

export default router;
