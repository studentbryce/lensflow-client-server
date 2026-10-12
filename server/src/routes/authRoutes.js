import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getCurrentUser } from '../controllers/authController.js';
import { getProfile, finishSignup } from '../controllers/accountOnboardingController.js';

const router = Router();

router.get('/me', requireAuth, getCurrentUser);
router.get('/profile', requireAuth, getProfile);
router.post('/complete-signup', requireAuth, finishSignup);

export default router;
