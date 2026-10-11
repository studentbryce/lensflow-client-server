import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { unreadMessageCount } from '../controllers/photographerMessagesController.js';
const router = Router();
router.use(requireAuth);
router.get('/unread-count', unreadMessageCount);
export default router;
