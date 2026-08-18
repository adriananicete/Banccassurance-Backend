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
import { verifyFileSignature } from '../middleware/verifyFileSignature.js'
import { documentKinds } from '../utils/fileSignature.js'
import { mediumLimiter, strictLimiter } from '../middleware/rateLimiter.js';
import { ACCOUNT_OFFICER, BRANCH_HEAD, BRANCH_STAFF, referralCreatorRoles } from '../utils/constant.js';

const router = express.Router();

router.get('/', requireAuth, getReferrals)
router.get('/counts', requireAuth, getReferralCounts)
router.get('/confirm-consent', confirmConsent)
router.get('/check-consent', requireAuth, checkConsent)
router.get('/plans', requireAuth, getPlans)
router.get('/referrer', requireAuth, getReferrerByCode)

router.post('/', requireAuth, requireRole(...referralCreatorRoles), createReferral)
router.post('/send-consent', requireAuth, mediumLimiter, sendConsent)
router.post('/resend-consent', requireAuth, mediumLimiter, sendConsent)
router.post('/confirm-consent', confirmConsentPost)
router.post('/upload-consent', requireAuth, strictLimiter, consentUpload.single('consentFile'), verifyFileSignature(documentKinds), uploadConsent)

// Keep every static path above this line. Anything declared after /:id is
// swallowed by the param match and surfaces as a 400 "invalid GUID".

router.get('/:id', requireAuth, getReferralById)
router.put('/:id/profiling', requireAuth, requireRole(BRANCH_HEAD, BRANCH_STAFF), updateReferralProfiling)
router.put('/:id/status', requireAuth, requireRole(ACCOUNT_OFFICER), updateReferralStatus)

export default router
