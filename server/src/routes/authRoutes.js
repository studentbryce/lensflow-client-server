import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getCurrentUser } from '../controllers/authController.js';

const router = Router();

router.get('/me', requireAuth, getCurrentUser);

export default router;
