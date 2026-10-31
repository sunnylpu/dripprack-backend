import { Router } from 'express';
import { env } from '../config/env.js';
import healthRoutes from '../modules/health/health.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import categoryRoutes from '../modules/categories/category.routes.js';
import productRoutes from '../modules/products/product.routes.js';
import inventoryRoutes from '../modules/inventory/inventory.routes.js';
import cartRoutes from '../modules/carts/cart.routes.js';
import addressRoutes from '../modules/addresses/address.routes.js';
import adminRoutes from '../modules/admin/admin.routes.js';
import orderRoutes from '../modules/orders/order.routes.js';
import paymentRoutes from '../modules/payments/payment.routes.js';
import { isOnlinePaymentsOperational } from '../modules/payments/payment.gateway.js';
import { ApiResponse } from '../utils/ApiResponse.js';

const router = Router();

// Base API information endpoint
router.get('/', (req, res) => {
  return ApiResponse.success(res, {
    message: 'Welcome to DripRack E-Commerce REST API v1',
    data: {
      version: '1.0.0',
      docs: '/api/v1/docs',
      status: 'operational',
      timestamp: new Date().toISOString()
    }
  });
});

// Public storefront safe configuration (no secrets exposed)
router.get('/config', (req, res) => {
  return ApiResponse.success(res, {
    message: 'Storefront public configuration retrieved successfully',
    data: {
      currency: env.CURRENCY_CODE,
      shipping: {
        flatFeeCents: env.SHIPPING_FLAT_FEE_CENTS,
        freeShippingThresholdCents: env.FREE_SHIPPING_THRESHOLD_CENTS
      },
      taxRatePercent: env.TAX_RATE_PERCENT,
      payments: {
        codEnabled: true,
        onlineEnabled: isOnlinePaymentsOperational(),
        provider: isOnlinePaymentsOperational() ? env.PAYMENT_PROVIDER : 'cod'
      }
    }
  });
});

// Mount module routes
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/cart', cartRoutes);
router.use('/addresses', addressRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/admin', adminRoutes);

// Test-only route for role authorization verification
if (process.env.NODE_ENV === 'test') {
  const { authenticate } = await import('../middleware/authenticate.js');
  const { authorize } = await import('../middleware/authorize.js');

  router.get('/test/admin-only', authenticate, authorize('admin'), (req, res) => {
    return ApiResponse.success(res, {
      message: 'Welcome Admin',
      data: { user: req.user }
    });
  });
}

export default router;
