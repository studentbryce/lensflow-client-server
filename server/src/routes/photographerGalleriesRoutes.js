import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { listGalleries,galleryOptions,getGallery,postGallery,patchGallery,postMedia,deleteMedia,deleteGallery } from '../controllers/photographerGalleriesController.js';
import { generateMediaPreview } from '../controllers/photographerMediaPreviewController.js';
import { previewRegenerationCheck, regenerateMediaPreview } from '../controllers/photographerPreviewRegenerationController.js';

// Router for photographer galleries-related routes
const router=Router();

// Apply authentication middleware to all photographer galleries routes
router.use(requireAuth);
router.get('/',listGalleries);
router.get('/options',galleryOptions);
router.get('/:id',getGallery);
router.post('/',postGallery);
router.patch('/:id',patchGallery);
router.post('/:id/media',postMedia);
router.post('/:id/media/:mediaId/preview',generateMediaPreview);
router.get('/:id/media/:mediaId/preview/regeneration-check',previewRegenerationCheck);
router.post('/:id/media/:mediaId/preview/regenerate',regenerateMediaPreview);
router.delete('/:id/media/:mediaId',deleteMedia);
router.delete('/:id',deleteGallery);
export default router;
