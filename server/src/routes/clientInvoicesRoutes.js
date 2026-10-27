import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { listInvoices, getInvoice } from '../controllers/clientInvoicesController.js';

// Router for client invoices-related routes
const router = Router();

// Apply authentication middleware to all client invoices routes
router.use(requireAuth);
router.get('/', listInvoices);
router.get('/:id', getInvoice);
export default router;
