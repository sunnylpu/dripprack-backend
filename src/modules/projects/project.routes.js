import { Router } from 'express';
import { projectController } from './project.controller.js';
import {
  projectParamsSchema,
  projectSlugParamsSchema,
  createProjectSchema,
  updateProjectSchema
} from './project.validation.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();

// Public storefront endpoints
router.get('/', projectController.getPublicProjects);
router.get('/detail/:slug', validateRequest(projectSlugParamsSchema), projectController.getPublicProjectBySlug);

// Admin backoffice endpoints
router.get('/admin/all', authenticate, authorize('admin'), projectController.getAdminProjects);
router.post(
  '/',
  authenticate,
  authorize('admin'),
  validateRequest(createProjectSchema),
  projectController.createProject
);
router.put(
  '/:id',
  authenticate,
  authorize('admin'),
  validateRequest(updateProjectSchema),
  projectController.updateProject
);
router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validateRequest(projectParamsSchema),
  projectController.deleteProject
);

export default router;
