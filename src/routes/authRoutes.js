import express from 'express'
import {
    verifyOtp, loginStep1, logout
} from '../controllers/authController.js'
import { requireAuth } from '../middleware/auth.js'
import { loginLimiter, loginIpLimiter } from '../middleware/rateLimiter.js';

const router = express.Router()

router.post('/verify-otp', loginIpLimiter, loginLimiter, verifyOtp)
router.post('/login-step1', loginIpLimiter, loginLimiter, loginStep1)

router.post('/logout', requireAuth, logout)

export default router
