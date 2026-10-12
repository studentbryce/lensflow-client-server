import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getPhotographerReviews, moderateReview } from '../controllers/photographerReviewsController.js';

const router = Router();
router.use(requireAuth);
router.get('/', getPhotographerReviews);
router.patch('/:id/moderate', moderateReview);
export default router;
