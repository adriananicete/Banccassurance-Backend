import express from 'express'
import {
    verifyOtp, loginStep1, changePassword,
    uploadProfilePhoto, getGroups, getBranches,
    logout
} from '../controllers/authController.js'
import { requireAuth } from '../middleware/auth.js'
import { photoUpload } from '../middleware/upload.js';
import { strictLimiter } from '../middleware/rateLimiter.js';

const router = express.Router()

router.post('/verify-otp', strictLimiter, verifyOtp)
router.post('/login-step1', strictLimiter, loginStep1)
router.get('/groups', getGroups)
router.get('/branches', getBranches)

// Authenticated
router.post('/logout', requireAuth, logout)
router.post('/change-password', requireAuth, changePassword)
router.post('/upload-photo', requireAuth, photoUpload.single('photo'), uploadProfilePhoto)

export default router
