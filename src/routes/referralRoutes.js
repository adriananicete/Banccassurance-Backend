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
} from '../controllers/referralController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { consentUpload } from '../middleware/upload.js'
import { mediumLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

router.post('/', requireAuth, requireRole('BRANCH_HEAD', 'BRANCH_STAFF'), createReferral)
router.get('/', requireAuth, getReferrals)

router.post('/send-consent', mediumLimiter, sendConsent)
router.post('/resend-consent', mediumLimiter, sendConsent)
router.get('/confirm-consent', confirmConsent)
router.get('/check-consent', checkConsent)
router.get('/plans', requireAuth, getPlans)

router.get('/referrer/:code', requireAuth, getReferrerByCode)

router.post('/upload-consent', consentUpload.single('consentFile'), uploadConsent)
router.put('/:id/profiling', updateReferralProfiling)
router.put('/:id/status', requireAuth, updateReferralStatus)

router.get('/:id', requireAuth, getReferralById)

export default router