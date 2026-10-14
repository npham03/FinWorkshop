import { Router } from 'express';
import { taxController } from '../controllers/taxController.js';

const router = Router();

// Tra cứu MST
router.get('/check-mst/:mst', taxController.checkTaxCode);
router.get('/check-mst', taxController.checkTaxCode);

// Hóa đơn điện tử: Xin cấp mã & kiểm tra
router.post('/invoice/issue-code', taxController.issueTaxAuthorityCode);
router.get('/invoice/verify/:code', taxController.verifyTaxAuthorityCode);

// Lịch sử test
router.get('/history', taxController.getHistory);

export default router;
