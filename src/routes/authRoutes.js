import express from 'express'
import {
    sendOtp, verifyOtp, loginStep1, changePassword,
    uploadProfilePhoto, getGroups, getBranches,
    register, checkEmail, getUsersForApproval, approveRejectUser,
    logout
} from '../controllers/authController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { photoUpload } from '../middleware/upload.js'

const router = express.Router()

// Public / pre-auth (registration flow)
router.post('/send-otp', sendOtp)
router.post('/verify-otp', verifyOtp)
router.post('/login-step1', loginStep1)
router.get('/groups', getGroups)
router.get('/branches', getBranches)
router.get('/check-email', checkEmail)
router.post('/register', register)

// Authenticated
router.post('/logout', requireAuth, logout)
router.post('/change-password', requireAuth, changePassword)
router.post('/upload-photo', requireAuth, photoUpload.single('photo'), uploadProfilePhoto)

// Authenticated + Branch Head only
router.get('/approvals', requireAuth, requireRole('BRANCH_HEAD', 'GROUP_HEAD', 'SECTOR_HEAD'), getUsersForApproval)
router.post('/approvals/action', requireAuth, requireRole('BRANCH_HEAD', 'GROUP_HEAD', 'SECTOR_HEAD'), approveRejectUser)

export default router