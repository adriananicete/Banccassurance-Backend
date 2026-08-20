import express from 'express'
import {
    register, checkEmail, getUsersForApproval, approveRejectUser, createTopLevelUser,
    changePassword, uploadProfilePhoto,
    replaceAccountOfficerBranches, replaceAreaSalesHeadAreas,
    replaceRegionalSalesHeadAreas
} from '../controllers/userController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { photoUpload } from '../middleware/upload.js';
import { verifyFileSignature } from '../middleware/verifyFileSignature.js';
import { imageKinds } from '../utils/fileSignature.js';
import { mediumLimiter } from '../middleware/rateLimiter.js';
import { AREA_SALES_HEAD, BRANCH_HEAD, DEPARTMENT_HEAD, GROUP_HEAD, REGIONAL_SALES_HEAD, SECTOR_HEAD, SUPERADMIN } from '../utils/constant.js';

const router = express.Router()

const approverRoles = [BRANCH_HEAD, GROUP_HEAD, SECTOR_HEAD, DEPARTMENT_HEAD, REGIONAL_SALES_HEAD, AREA_SALES_HEAD, SUPERADMIN];

// Public / pre-auth (registration flow)
router.get('/check-email', mediumLimiter, checkEmail)
router.post('/register', mediumLimiter, register)

// Own profile
router.post('/change-password', requireAuth, changePassword)
router.post('/upload-photo', requireAuth, photoUpload.single('photo'), verifyFileSignature(imageKinds), uploadProfilePhoto)

// Approver-only
router.get('/approvals', requireAuth, requireRole(...approverRoles), getUsersForApproval)
router.post('/approvals/action', requireAuth, requireRole(...approverRoles), approveRejectUser)

// Superadmin-only. Creates a Sector Head or Department Head already approved,
// so the two top roles no longer need a hand-written database row.
router.post('/', requireAuth, requireRole(SUPERADMIN), createTopLevelUser)

// Keep every static path above this line. Once a /:userId route is added
// below it, anything declared after it is swallowed by the param match.

// Scope assignment. Each one replaces the whole set -- the caller sends the
// full desired list, and an empty array removes everything.
router.put('/:userId/branches', requireAuth, requireRole(AREA_SALES_HEAD, SUPERADMIN), replaceAccountOfficerBranches)
router.put('/:userId/areas', requireAuth, requireRole(REGIONAL_SALES_HEAD, SUPERADMIN), replaceAreaSalesHeadAreas)
router.put('/:userId/groups', requireAuth, requireRole(DEPARTMENT_HEAD, SUPERADMIN), replaceRegionalSalesHeadAreas)

export default router
