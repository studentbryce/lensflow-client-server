import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { listPhotographerMessages, startPhotographerConversation,
  sendPhotographerMessageHandler, readPhotographerMessages } from '../controllers/photographerMessagesController.js';
const router = Router();
router.use(requireAuth);
router.get('/', listPhotographerMessages);
router.post('/conversation', startPhotographerConversation);
router.post('/', sendPhotographerMessageHandler);
router.patch('/read', readPhotographerMessages);
export default router;
