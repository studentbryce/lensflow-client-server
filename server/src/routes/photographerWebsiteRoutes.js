import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { getWebsiteHandler,saveWebsiteHandler,listPortfolioHandler,portfolioOptionsHandler,createPortfolioHandler,updatePortfolioHandler,deletePortfolioHandler,reorderPortfolioHandler } from '../controllers/photographerWebsiteController.js';
const router=Router();router.use(requireAuth);
router.get('/',getWebsiteHandler);router.put('/',saveWebsiteHandler);
router.get('/portfolio',listPortfolioHandler);router.get('/portfolio/options',portfolioOptionsHandler);
router.post('/portfolio',createPortfolioHandler);router.put('/portfolio/order',reorderPortfolioHandler);
router.patch('/portfolio/:id',updatePortfolioHandler);router.delete('/portfolio/:id',deletePortfolioHandler);
export default router;
