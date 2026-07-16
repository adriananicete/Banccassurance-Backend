import express from 'express'
import {
    sendOtp, verifyOtp, loginStep1, changePassword,
    uploadProfilePhoto, upload, getGroups, getBranches,
    register, checkEmail, getUsersForApproval, approveRejectUser
} from '../controllers/authController.js'

const router = express.Router()

router.post('/send-otp', sendOtp)
router.post('/verify-otp', verifyOtp)
router.post('/login-step1', loginStep1)
router.post('/change-password', changePassword)
router.post('/upload-photo', upload.single('photo'), uploadProfilePhoto)
router.get('/groups', getGroups)
router.get('/branches', getBranches)
router.get('/check-email', checkEmail)
router.post('/register', register)
router.get('/approvals', getUsersForApproval)
router.post('/approvals/action', approveRejectUser)

export default router