import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getInvoices,getInvoiceOptions,getInvoice,postInvoice,patchInvoice,patchInvoiceStatus,deleteInvoice } from '../controllers/photographerInvoicesController.js';

// Router for photographer invoices-related routes
const router=Router();

// Apply authentication middleware to all photographer invoices routes
router.use(requireAuth);
router.get('/',getInvoices);
router.get('/options',getInvoiceOptions);
router.get('/:id',getInvoice);
router.post('/',postInvoice);
router.patch('/:id',patchInvoice);
router.patch('/:id/status',patchInvoiceStatus);
router.delete('/:id',deleteInvoice);
export default router;
