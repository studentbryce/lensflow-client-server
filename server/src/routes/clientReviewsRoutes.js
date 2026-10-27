import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { listReviews, createReview, updateReview } from '../controllers/clientReviewsController.js';

// Router for client reviews-related routes
const router = Router();

// Apply authentication middleware to all client reviews routes
router.use(requireAuth);
router.get('/', listReviews);
router.post('/', createReview);
router.patch('/:id', updateReview);
export default router;
