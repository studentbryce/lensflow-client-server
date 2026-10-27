import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getSettings, patchAccount, patchBusiness, putTax, putBank } from '../controllers/photographerSettingsController.js';

// Router for photographer settings-related routes
const router = Router();

// Apply authentication middleware to all photographer settings routes
router.use(requireAuth);
router.get('/', getSettings);
router.patch('/account', patchAccount);
router.patch('/business', patchBusiness);
router.put('/tax', putTax);
router.put('/bank', putBank);
export default router;
