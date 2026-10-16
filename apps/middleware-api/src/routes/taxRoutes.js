import { Router } from 'express';
import { taxController } from '../controllers/taxController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(protect);
router.get('/check-mst/:mst', taxController.checkMst);

export default router;
