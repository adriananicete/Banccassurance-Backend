import express from 'express'
import {
  createReferral,
  sendConsent,
  updateReferralProfiling,
  getReferrerByCode,
  getPlans,
  confirmConsent,
  checkConsent,
  getReferrals,
  updateReferralStatus,
  getReferralById,
  uploadConsent,
  confirmConsentPost,
  getReferralCounts,
} from '../controllers/referralController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { consentUpload } from '../middleware/upload.js'
import { mediumLimiter, strictLimiter } from '../middleware/rateLimiter.js';
import { BRANCH_HEAD, BRANCH_STAFF, referralCreatorRoles } from '../utils/constant.js';

const router = express.Router();


router.get('/', requireAuth, getReferrals)
router.get('/counts', requireAuth, getReferralCounts)
router.get('/confirm-consent', confirmConsent)
router.get('/check-consent', requireAuth, checkConsent)
router.get('/plans', requireAuth, getPlans)

router.post('/', requireAuth, requireRole(...referralCreatorRoles), createReferral)
router.post('/send-consent', mediumLimiter, requireAuth, sendConsent)
router.post('/resend-consent', mediumLimiter, requireAuth, sendConsent)
router.post('/confirm-consent', confirmConsentPost)
router.post('/upload-consent', strictLimiter, requireAuth, consentUpload.single('consentFile'), uploadConsent)

router.get('/:id', requireAuth, getReferralById)
router.get('/referrer/:code', requireAuth, getReferrerByCode)
router.put('/:id/profiling', requireAuth, requireRole(BRANCH_HEAD, BRANCH_STAFF), updateReferralProfiling)
router.put('/:id/status', requireAuth, requireRole('ACCOUNT_OFFICER'), updateReferralStatus)




export default router
