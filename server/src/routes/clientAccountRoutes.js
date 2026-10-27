import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getDashboard, getProfile, patchProfile } from '../controllers/clientAccountController.js';

// Router for client account-related routes
const router = Router();

// Apply authentication middleware to all client account routes
router.use(requireAuth);
router.get('/dashboard', getDashboard);
router.get('/profile', getProfile);
router.patch('/profile', patchProfile);
export default router;
