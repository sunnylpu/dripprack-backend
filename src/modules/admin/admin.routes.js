import { Router } from 'express';
import { categoryController } from '../categories/category.controller.js';
import { productController } from '../products/product.controller.js';
import { adminCategoryQuerySchema } from '../categories/category.validation.js';
import {
  adminProductQuerySchema,
  productParamsSchema
} from '../products/product.validation.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();

// Protect all admin catalog endpoints
router.use(authenticate, authorize('admin'));

// Admin Category listing (supports inactive categories and pagination)
router.get('/categories', validateRequest(adminCategoryQuerySchema), categoryController.getAdminCategories);

// Admin Product listing (supports draft, published, archived status filters)
router.get('/products', validateRequest(adminProductQuerySchema), productController.getAdminProducts);

// Admin Product detail lookup (including drafts and archived products)
router.get('/products/:id', validateRequest(productParamsSchema), productController.getAdminProductById);

export default router;
