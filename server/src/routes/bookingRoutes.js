import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getBookings } from '../controllers/bookingController.js';

const router = Router();

router.get('/', requireAuth, getBookings);

export default router;
