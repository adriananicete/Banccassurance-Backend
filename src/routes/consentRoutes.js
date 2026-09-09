import express from 'express'
import {
  sendConsent,
  confirmConsent,
  confirmConsentPost,
  checkConsent,
  uploadConsent,
} from '../controllers/consentController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { referralCreatorRoles } from '../utils/constant.js'
import { consentUpload } from '../middleware/upload.js'
import { verifyFileSignature } from '../middleware/verifyFileSignature.js'
import { documentKinds } from '../utils/fileSignature.js'
import { consentLimiter, consentUploadLimiter } from '../middleware/rateLimiter.js'

const router = express.Router();

router.get('/confirm', confirmConsent)
router.post('/confirm', confirmConsentPost)

// requireAuth must stay ahead of every limiter below it. The key generator
// reads req.user, and without a session it silently falls back to the IP -
// which is the behaviour this change exists to remove.
// requireRole sits above every limiter too. A role that may not gather consent
// should not spend a limiter budget to be told so, and the upload chain would
// otherwise write the file to disk before anything checked who sent it.
router.get('/check', requireAuth, checkConsent)
router.post('/send', requireAuth, requireRole(...referralCreatorRoles), consentLimiter, sendConsent)
router.post('/resend', requireAuth, requireRole(...referralCreatorRoles), consentLimiter, sendConsent)
router.post('/upload', requireAuth, requireRole(...referralCreatorRoles), consentUploadLimiter, consentUpload.single('consentFile'), verifyFileSignature(documentKinds), uploadConsent)

export default router
