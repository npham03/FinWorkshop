import { Router } from 'express';
import { authController } from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { validate } from '../validations/validate.js';
import { registerSchema, loginSchema } from '../validations/schemas.js';

const router = Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.get('/me', protect, authController.me);

export default router;
