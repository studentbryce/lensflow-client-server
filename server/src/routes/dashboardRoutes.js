import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getDashboard } from '../controllers/dashboardController.js';

// Router for dashboard-related routes
const router = Router();

// Apply authentication middleware to all dashboard routes
router.use(requireAuth);
router.get('/', getDashboard);
export default router;
