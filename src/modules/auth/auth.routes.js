import { Router } from 'express';
import { authController } from './auth.controller.js';
import { registerSchema, loginSchema } from './auth.validation.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authLimiter } from '../../middleware/rateLimiters.js';
import { verifyCsrfOrigin } from '../../middleware/csrfProtection.js';

const router = Router();

// Public registration (always assigns 'customer')
router.post('/register', authLimiter, validateRequest(registerSchema), authController.register);

// Public login
router.post('/login', authLimiter, validateRequest(loginSchema), authController.login);

// Refresh session (HttpOnly cookie rotation + CSRF check)
router.post('/refresh', authLimiter, verifyCsrfOrigin, authController.refresh);

// Logout (session revocation + cookie clear + CSRF check)
router.post('/logout', verifyCsrfOrigin, authController.logout);

// Current authenticated user profile
router.get('/me', authenticate, authController.getMe);

export default router;
