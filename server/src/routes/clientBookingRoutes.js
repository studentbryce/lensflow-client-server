import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getClientBookings, getClientBookingById, getClientBookingForm, getClientBookingAvailability, postClientBooking } from '../controllers/clientBookingController.js';

const router = Router();
router.use(requireAuth);
router.get('/', getClientBookings);
router.get('/new/options', getClientBookingForm);
router.get('/availability', getClientBookingAvailability);
router.post('/', postClientBooking);
router.get('/:id', getClientBookingById);
export default router;
