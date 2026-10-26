import { Router } from 'express';
import { inventoryController } from './inventory.controller.js';
import {
  adjustStockSchema,
  stockListingQuerySchema,
  lowStockQuerySchema,
  movementsQuerySchema
} from './inventory.validation.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();

// All inventory endpoints are strictly Admin-only
router.use(authenticate, authorize('admin'));

// POST /api/v1/inventory/adjust - Atomic stock adjustment
router.post('/adjust', validateRequest(adjustStockSchema), inventoryController.adjustStock);

// GET /api/v1/inventory/stock - Admin stock overview with filtering & pagination
router.get('/stock', validateRequest(stockListingQuerySchema), inventoryController.getStockList);

// GET /api/v1/inventory/low-stock - Products with available <= lowStockThreshold
router.get('/low-stock', validateRequest(lowStockQuerySchema), inventoryController.getLowStockProducts);

// GET /api/v1/inventory/movements - Immutable audit log of stock movements
router.get('/movements', validateRequest(movementsQuerySchema), inventoryController.getMovements);

export default router;
