import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getBookings, getBookingById } from '../controllers/bookingController.js';

const router = Router();

router.get('/', requireAuth, getBookings);
router.get('/:id', requireAuth, getBookingById);

export default router;
