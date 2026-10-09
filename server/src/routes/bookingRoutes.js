import { Router } from 'express';
import { getBookingBusyTimes } from '../controllers/bookingBusyTimesController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getBookings, getBookingById, postBooking, patchBooking, deleteBooking, patchBookingStatus, getBookingRelated } from '../controllers/bookingController.js';

const router = Router();

router.get('/', requireAuth, getBookings);
router.get('/availability/busy', requireAuth, getBookingBusyTimes);
router.post('/', requireAuth, postBooking);
router.get('/:id', requireAuth, getBookingById);
router.get('/:id/related', requireAuth, getBookingRelated);
router.patch('/:id', requireAuth, patchBooking);
router.patch('/:id/status', requireAuth, patchBookingStatus);
router.delete('/:id', requireAuth, deleteBooking);

export default router;
