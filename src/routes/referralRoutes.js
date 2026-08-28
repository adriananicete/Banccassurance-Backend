import express from 'express'
import {
  createReferral,
  updateReferralProfiling,
  getReferrerByCode,
  getReferrals,
  updateReferralStatus,
  getReferralById,
  getReferralCounts,
  deleteReferral,
} from '../controllers/referralController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { ACCOUNT_OFFICER, BRANCH_HEAD, BRANCH_STAFF, referralCreatorRoles } from '../utils/constant.js';

const router = express.Router();

router.get('/', requireAuth, getReferrals)
router.get('/counts', requireAuth, getReferralCounts)
router.get('/referrer', requireAuth, getReferrerByCode)

router.post('/', requireAuth, requireRole(...referralCreatorRoles), createReferral)

// Keep every static path above this line. Anything declared after /:id is
// swallowed by the param match and surfaces as a 400 "invalid GUID".

router.get('/:id', requireAuth, getReferralById)
router.delete('/:id', requireAuth, requireRole(...referralCreatorRoles), deleteReferral)
router.put('/:id/profiling', requireAuth, requireRole(BRANCH_HEAD, BRANCH_STAFF), updateReferralProfiling)
router.put('/:id/status', requireAuth, requireRole(ACCOUNT_OFFICER), updateReferralStatus)

export default router
