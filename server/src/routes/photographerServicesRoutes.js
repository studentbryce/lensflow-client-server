import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getServices, getServicesContext, getService, postService, patchService } from '../controllers/photographerServicesController.js';

// Router for photographer services-related routes
const router = Router();

// Apply authentication middleware to all photographer services routes
router.use(requireAuth);
router.get('/', getServices);
router.get('/context', getServicesContext);
router.get('/:id', getService);
router.post('/', postService);
router.patch('/:id', patchService);
export default router;
