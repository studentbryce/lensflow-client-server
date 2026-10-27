import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getCurrentUser } from '../controllers/authController.js';
import { getProfile, finishSignup } from '../controllers/accountOnboardingController.js';

// Router for authentication and account onboarding routes
const router = Router();

// Route to get the current authenticated user
router.get('/me', requireAuth, getCurrentUser);
router.get('/profile', requireAuth, getProfile);
router.post('/signin-signup', requireAuth, finishSignup);

export default router;
