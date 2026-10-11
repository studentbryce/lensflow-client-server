import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { listReviews, createReview, updateReview } from '../controllers/clientReviewsController.js';

const router = Router();
router.use(requireAuth);
router.get('/', listReviews);
router.post('/', createReview);
router.patch('/:id', updateReview);
export default router;
