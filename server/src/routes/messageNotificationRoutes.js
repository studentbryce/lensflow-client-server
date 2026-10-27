import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { unreadMessageCount } from '../controllers/photographerMessagesController.js';

// Router for message notification-related routes
const router = Router();

// Apply authentication middleware to all message notification routes
router.use(requireAuth);
router.get('/unread-count', unreadMessageCount);
export default router;
