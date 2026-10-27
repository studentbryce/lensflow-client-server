import { Router } from 'express';
import { getHealth } from '../controllers/healthController.js';

// Router for health check route
const router = Router();
router.get('/', getHealth);

export default router;
