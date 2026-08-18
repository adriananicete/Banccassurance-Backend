import express from 'express'
import {
    register, checkEmail, getUsersForApproval, approveRejectUser,
    replaceAccountOfficerBranches, replaceAreaSalesHeadAreas,
    replaceRegionalSalesHeadAreas
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

// Scope assignment. Each one replaces the whole set -- the caller sends the
// full desired list, and an empty array removes everything.
router.put('/:userId/branches', requireAuth, requireRole(AREA_SALES_HEAD), replaceAccountOfficerBranches)
router.put('/:userId/areas', requireAuth, requireRole(REGIONAL_SALES_HEAD), replaceAreaSalesHeadAreas)
router.put('/:userId/groups', requireAuth, requireRole(DEPARTMENT_HEAD), replaceRegionalSalesHeadAreas)

export default router
