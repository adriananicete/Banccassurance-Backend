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
} from '../controllers/referralController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { consentUpload } from '../middleware/upload.js'
import { mediumLimiter, strictLimiter } from '../middleware/rateLimiter.js';
import { ACCOUNT_OFFICER, BRANCH_HEAD, BRANCH_STAFF } from '../utils/constant.js';

const router = express.Router();

router.post('/', requireAuth, requireRole(BRANCH_HEAD, BRANCH_STAFF, ACCOUNT_OFFICER), createReferral)
router.get('/', requireAuth, getReferrals)

router.post('/send-consent', mediumLimiter, requireAuth, sendConsent)
router.post('/resend-consent', mediumLimiter, requireAuth, sendConsent)
router.post('/confirm-consent', confirmConsentPost)
router.get('/confirm-consent', confirmConsent)
router.get('/check-consent', requireAuth, checkConsent)
router.get('/plans', requireAuth, getPlans)

router.get('/referrer/:code', requireAuth, getReferrerByCode)

router.post('/upload-consent', strictLimiter, requireAuth, consentUpload.single('consentFile'), uploadConsent)
router.put('/:id/profiling', requireAuth, requireRole(BRANCH_HEAD, BRANCH_STAFF), updateReferralProfiling)
router.put('/:id/status', requireAuth, requireRole('ACCOUNT_OFFICER'), updateReferralStatus)

router.get('/:id', requireAuth, getReferralById)

export default router
