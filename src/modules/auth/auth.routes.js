import { Router } from 'express';
import { authController } from './auth.controller.js';
import { registerSchema, loginSchema } from './auth.validation.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authLimiter } from '../../middleware/rateLimiters.js';
import { verifyCsrfOrigin } from '../../middleware/csrfProtection.js';

const router = Router();

// Middleware helper to bind explicit application client context
const setClientContext = (clientType) => (req, res, next) => {
  req.headers['x-app-client'] = clientType;
  next();
};

// Public registration (always assigns 'customer')
router.post('/register', authLimiter, validateRequest(registerSchema), authController.register);

// Standard authentication endpoints (support X-App-Client header or cookie auto-detection)
router.post('/login', authLimiter, validateRequest(loginSchema), authController.login);
router.post('/refresh', authLimiter, verifyCsrfOrigin, authController.refresh);
router.post('/logout', verifyCsrfOrigin, authController.logout);

// Dedicated Admin Portal authentication endpoints
router.post('/admin/login', authLimiter, setClientContext('admin'), validateRequest(loginSchema), authController.login);
router.post('/admin/refresh', authLimiter, setClientContext('admin'), verifyCsrfOrigin, authController.refresh);
router.post('/admin/logout', setClientContext('admin'), verifyCsrfOrigin, authController.logout);

// Dedicated Customer Storefront authentication endpoints
router.post('/customer/login', authLimiter, setClientContext('customer'), validateRequest(loginSchema), authController.login);
router.post('/customer/refresh', authLimiter, setClientContext('customer'), verifyCsrfOrigin, authController.refresh);
router.post('/customer/logout', setClientContext('customer'), verifyCsrfOrigin, authController.logout);

// Current authenticated user profile
router.get('/me', authenticate, authController.getMe);

export default router;
