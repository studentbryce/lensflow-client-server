import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getClients, getClient, patchClient } from '../controllers/photographerClientsController.js';

const router = Router();
router.use(requireAuth);
router.get('/', getClients);
router.get('/:id', getClient);
router.patch('/:id', patchClient);
export default router;
