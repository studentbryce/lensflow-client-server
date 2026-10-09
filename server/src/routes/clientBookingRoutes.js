import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getClientBookings, getClientBookingById } from '../controllers/clientBookingController.js';

const router = Router();
router.use(requireAuth);
router.get('/', getClientBookings);
router.get('/:id', getClientBookingById);
export default router;
