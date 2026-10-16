import { Router } from 'express';
import { invoiceController } from '../controllers/invoiceController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { validate } from '../validations/validate.js';
import { createInvoiceSchema } from '../validations/schemas.js';

const router = Router();

router.use(protect);

router.post('/', validate(createInvoiceSchema), invoiceController.create);
router.get('/', invoiceController.list);

export default router;
