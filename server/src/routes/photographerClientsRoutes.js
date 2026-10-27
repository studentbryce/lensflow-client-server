import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getClients, getClient, patchClient } from '../controllers/photographerClientsController.js';

// Router for photographer clients-related routes
const router = Router();

// Apply authentication middleware to all photographer clients routes
router.use(requireAuth);
router.get('/', getClients);
router.get('/:id', getClient);
router.patch('/:id', patchClient);
export default router;
