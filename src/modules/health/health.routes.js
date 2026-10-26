import { Router } from 'express';
import { healthController } from './health.controller.js';

const router = Router();

router.get('/live', healthController.live);
router.get('/ready', healthController.ready);

export default router;
