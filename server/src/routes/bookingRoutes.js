import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getBookings, getBookingById, postBooking, patchBooking, deleteBooking } from '../controllers/bookingController.js';

const router = Router();

router.get('/', requireAuth, getBookings);
router.post('/', requireAuth, postBooking);
router.get('/:id', requireAuth, getBookingById);
router.patch('/:id', requireAuth, patchBooking);
router.delete('/:id', requireAuth, deleteBooking);

export default router;
