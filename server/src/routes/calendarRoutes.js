import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getCalendar, postRule, postException, deleteRule, deleteException } from '../controllers/calendarController.js';

// Router for calendar-related routes
const router = Router();

// Apply authentication middleware to all calendar routes
router.use(requireAuth);
router.get('/', getCalendar);
router.post('/rules', postRule);
router.delete('/rules/:id', deleteRule);
router.post('/exceptions', postException);
router.delete('/exceptions/:id', deleteException);
export default router;
