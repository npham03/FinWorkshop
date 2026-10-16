import { checkTaxCode } from '../services/taxService.js';
import { catchAsync } from '../utils/catchAsync.js';

export const taxController = {
  checkMst: catchAsync(async (req, res) => {
    const { mst } = req.params;
    const result = await checkTaxCode(mst);
    res.json(result);
  }),
};
