import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getBookings, getBookingById, postBooking } from '../controllers/bookingController.js';

const router = Router();

router.get('/', requireAuth, getBookings);
router.post('/', requireAuth, postBooking);
router.get('/:id', requireAuth, getBookingById);

export default router;
