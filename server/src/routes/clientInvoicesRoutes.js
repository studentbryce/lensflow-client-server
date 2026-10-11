import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { listInvoices, getInvoice } from '../controllers/clientInvoicesController.js';
const router = Router();
router.use(requireAuth);
router.get('/', listInvoices);
router.get('/:id', getInvoice);
export default router;
