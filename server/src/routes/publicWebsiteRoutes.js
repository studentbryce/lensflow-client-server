import { Router } from 'express';
import { getPublicPhotographers, getPublicWebsite } from '../controllers/publicWebsiteController.js';

// Router for public website-related routes
const router = Router();
router.get('/photographers', getPublicPhotographers);
router.get('/websites/:slug', getPublicWebsite);
export default router;
