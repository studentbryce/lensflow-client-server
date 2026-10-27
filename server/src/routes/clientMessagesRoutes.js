import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { listMessages, createConversation, sendMessage, markRead } from '../controllers/clientMessagesController.js';

// Router for client messages-related routes
const router = Router();

// Apply authentication middleware to all client messages routes
router.use(requireAuth);
router.get('/', listMessages);
router.post('/conversation', createConversation);
router.post('/', sendMessage);
router.patch('/read', markRead);
export default router;
