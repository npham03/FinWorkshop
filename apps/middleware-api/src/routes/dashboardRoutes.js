import { Router } from 'express';
import { dashboardController } from '../controllers/dashboardController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(protect);
router.get('/summary', dashboardController.getSummary);

export default router;
