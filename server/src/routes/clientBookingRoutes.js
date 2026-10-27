import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getClientBookings, getClientBookingById, getClientBookingForm, getClientBookingAvailability, postClientBooking } from '../controllers/clientBookingController.js';

// Router for client booking-related routes
const router = Router();

// Apply authentication middleware to all client booking routes
router.use(requireAuth);
router.get('/', getClientBookings);
router.get('/new/options', getClientBookingForm);
router.get('/availability', getClientBookingAvailability);
router.post('/', postClientBooking);
router.get('/:id', getClientBookingById);
export default router;
