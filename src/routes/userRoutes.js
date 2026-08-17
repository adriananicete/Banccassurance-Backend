import express from 'express'
import {
    register, checkEmail, getUsersForApproval, approveRejectUser
} from '../controllers/userController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { mediumLimiter } from '../middleware/rateLimiter.js';
import { AREA_SALES_HEAD, BRANCH_HEAD, DEPARTMENT_HEAD, GROUP_HEAD, REGIONAL_SALES_HEAD, SECTOR_HEAD } from '../utils/constant.js';

const router = express.Router()

const approverRoles = [BRANCH_HEAD, GROUP_HEAD, SECTOR_HEAD, DEPARTMENT_HEAD, REGIONAL_SALES_HEAD, AREA_SALES_HEAD];

// Public / pre-auth (registration flow)
router.get('/check-email', mediumLimiter, checkEmail)
router.post('/register', mediumLimiter, register)

// Approver-only
router.get('/approvals', requireAuth, requireRole(...approverRoles), getUsersForApproval)
router.post('/approvals/action', requireAuth, requireRole(...approverRoles), approveRejectUser)

// Keep every static path above this line. Once a /:userId route is added
// below it, anything declared after it is swallowed by the param match.

export default router
