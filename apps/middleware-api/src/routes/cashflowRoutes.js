import { Router } from 'express';
import { cashflowController } from '../controllers/cashflowController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { validate } from '../validations/validate.js';
import { createTransactionSchema } from '../validations/schemas.js';

const router = Router();

router.use(protect);

router.post('/', validate(createTransactionSchema), cashflowController.create);
router.get('/', cashflowController.list);

export default router;
