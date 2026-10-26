import { Router } from 'express';
import { categoryController } from '../categories/category.controller.js';
import { productController } from '../products/product.controller.js';
import { adminController } from './admin.controller.js';
import { adminCategoryQuerySchema } from '../categories/category.validation.js';
import {
  adminProductQuerySchema,
  productParamsSchema
} from '../products/product.validation.js';
import {
  adminOrderListQuerySchema,
  adminOrderParamsSchema,
  adminOrderStatusUpdateSchema,
  adminOrderCancelSchema,
  adminAuditLogQuerySchema
} from './admin.validation.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();

// Protect all admin endpoints: require admin authentication and authorization
router.use(authenticate, authorize('admin'));

// Admin Category listing (supports inactive categories and pagination)
router.get('/categories', validateRequest(adminCategoryQuerySchema), categoryController.getAdminCategories);

// Admin Product listing (supports draft, published, archived status filters)
router.get('/products', validateRequest(adminProductQuerySchema), productController.getAdminProducts);

// Admin Product detail lookup (including drafts and archived products)
router.get('/products/:id', validateRequest(productParamsSchema), productController.getAdminProductById);

// Phase 7: Admin Dashboard Summary Analytics
router.get('/dashboard/summary', adminController.getDashboardSummary);

// Phase 7: Admin Order Fulfillment and Management
router.get('/orders', validateRequest(adminOrderListQuerySchema), adminController.getOrders);
router.get('/orders/:reference', validateRequest(adminOrderParamsSchema), adminController.getOrderByReference);
router.patch('/orders/:reference/status', validateRequest(adminOrderStatusUpdateSchema), adminController.updateOrderStatus);
router.post('/orders/:reference/cancel', validateRequest(adminOrderCancelSchema), adminController.cancelOrder);

// Phase 7: Administrative Append-Only Audit Trail
router.get('/audit-logs', validateRequest(adminAuditLogQuerySchema), adminController.getAuditLogs);

export default router;
