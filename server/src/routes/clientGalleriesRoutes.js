import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { listGalleries, getGallery, downloadMedia, exportSocialMedia } from '../controllers/clientGalleriesController.js';

// Router for client galleries-related routes
const router = Router();

// Apply authentication middleware to all client galleries routes
router.use(requireAuth);
router.get('/', listGalleries);
router.get('/:id/media/:mediaId/download', downloadMedia);
router.get('/:id/media/:mediaId/export', exportSocialMedia);
router.get('/:id', getGallery);
export default router;
