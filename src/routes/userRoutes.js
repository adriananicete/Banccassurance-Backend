import express from 'express'
import {
    register, checkEmail, getUsersForApproval, approveRejectUser, createTopLevelUser,
    deleteUser, changePassword, uploadProfilePhoto,
    replaceAccountOfficerBranches, replaceAreaSalesHeadAreas,
    replaceRegionalSalesHeadAreas,
    getOwnScope, getAssignableBranches, getAccountOfficerBranches,
    getAreaSalesHeadAreas, getRegionalSalesHeadAreas, listUsersByRole
} from '../controllers/userController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { photoUpload } from '../middleware/upload.js';
import { verifyFileSignature } from '../middleware/verifyFileSignature.js';
import { imageKinds } from '../utils/fileSignature.js';
import { registerLimiter, checkEmailLimiter } from '../middleware/rateLimiter.js';
import { approverRoles, AREA_SALES_HEAD, DEPARTMENT_HEAD, REGIONAL_SALES_HEAD, SECTOR_HEAD, SUPERADMIN } from '../utils/constant.js';

const router = express.Router()

router.get('/check-email', checkEmailLimiter, checkEmail)
router.post('/register', registerLimiter, register)

router.post('/change-password', requireAuth, changePassword)
router.post('/upload-photo', requireAuth, photoUpload.single('photo'), verifyFileSignature(imageKinds), uploadProfilePhoto)

router.get('/approvals', requireAuth, requireRole(...approverRoles), getUsersForApproval)
router.post('/approvals/action', requireAuth, requireRole(...approverRoles), approveRejectUser)

router.get('/', requireAuth, requireRole(DEPARTMENT_HEAD, SECTOR_HEAD, REGIONAL_SALES_HEAD, AREA_SALES_HEAD, SUPERADMIN), listUsersByRole)
router.post('/', requireAuth, requireRole(SUPERADMIN), createTopLevelUser)

router.get('/scope', requireAuth, getOwnScope)
router.get('/assignable-branches', requireAuth, requireRole(AREA_SALES_HEAD, SUPERADMIN), getAssignableBranches)

// Keep every static path above this line. Once a /:userId route is added
// below it, anything declared after it is swallowed by the param match.

router.get('/:userId/branches', requireAuth, requireRole(AREA_SALES_HEAD, SUPERADMIN), getAccountOfficerBranches)
router.get('/:userId/groups', requireAuth, requireRole(REGIONAL_SALES_HEAD, SUPERADMIN), getAreaSalesHeadAreas)
router.get('/:userId/region', requireAuth, requireRole(DEPARTMENT_HEAD, SUPERADMIN), getRegionalSalesHeadAreas)

router.delete('/:userId', requireAuth, requireRole(SUPERADMIN), deleteUser)

router.put('/:userId/branches', requireAuth, requireRole(AREA_SALES_HEAD, SUPERADMIN), replaceAccountOfficerBranches)
router.put('/:userId/groups', requireAuth, requireRole(REGIONAL_SALES_HEAD, SUPERADMIN), replaceAreaSalesHeadAreas)
router.put('/:userId/region', requireAuth, requireRole(DEPARTMENT_HEAD, SUPERADMIN), replaceRegionalSalesHeadAreas)

export default router
