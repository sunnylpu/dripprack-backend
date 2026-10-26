import { Router } from 'express';
import healthRoutes from '../modules/health/health.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
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

// Mount module routes
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

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
