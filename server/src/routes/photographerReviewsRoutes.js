import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getPhotographerReviews, moderateReview } from '../controllers/photographerReviewsController.js';

// Router for photographer reviews-related routes
const router = Router();

// Apply authentication middleware to all photographer reviews routes
router.use(requireAuth);
router.get('/', getPhotographerReviews);
router.patch('/:id/moderate', moderateReview);
export default router;
