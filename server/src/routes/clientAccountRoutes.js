import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getDashboard, getProfile, patchProfile } from '../controllers/clientAccountController.js';

const router = Router();
router.use(requireAuth);
router.get('/dashboard', getDashboard);
router.get('/profile', getProfile);
router.patch('/profile', patchProfile);
export default router;
