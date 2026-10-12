import { Router } from 'express';
import { getPublicPhotographers, getPublicWebsite } from '../controllers/publicWebsiteController.js';
const router = Router();
router.get('/photographers', getPublicPhotographers);
router.get('/websites/:slug', getPublicWebsite);
export default router;
