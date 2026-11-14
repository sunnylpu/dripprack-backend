import { Router } from 'express';
import { healthController } from './health.controller.js';

const router = Router();

router.get(['/', '/ready'], healthController.ready);
router.get('/live', healthController.live);

export default router;
