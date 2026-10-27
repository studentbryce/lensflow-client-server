import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getBookingBusyTimes } from '../controllers/bookingBusyTimesController.js';
import { getPhotographerBookingOptions, getPhotographerBookingAvailability } from '../controllers/photographerBookingFormController.js';
import { getBookings, getBookingById, postBooking, patchBooking, deleteBooking, patchBookingStatus, getBookingRelated } from '../controllers/bookingController.js';

// Router for booking-related routes
const router = Router();

// Booking routes with authentication middleware
router.get('/', requireAuth, getBookings);
router.get('/new/options', requireAuth, getPhotographerBookingOptions);
router.get('/availability', requireAuth, getPhotographerBookingAvailability);
// Preserve the existing busy-times API used by prior availability tests.
router.get('/availability/busy', requireAuth, getBookingBusyTimes);
router.post('/', requireAuth, postBooking);
router.get('/:id', requireAuth, getBookingById);
router.get('/:id/related', requireAuth, getBookingRelated);
router.patch('/:id', requireAuth, patchBooking);
router.patch('/:id/status', requireAuth, patchBookingStatus);
router.delete('/:id', requireAuth, deleteBooking);

export default router;
