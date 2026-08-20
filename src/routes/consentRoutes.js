import express from 'express'
import {
  sendConsent,
  confirmConsent,
  confirmConsentPost,
  checkConsent,
  uploadConsent,
} from '../controllers/consentController.js'
import { requireAuth } from '../middleware/auth.js'
import { consentUpload } from '../middleware/upload.js'
import { verifyFileSignature } from '../middleware/verifyFileSignature.js'
import { documentKinds } from '../utils/fileSignature.js'
import { mediumLimiter, strictLimiter } from '../middleware/rateLimiter.js'

const router = express.Router();

// Rendered for the client's own browser from the consent email. Public, the
// token is the credential, and both answer HTML rather than reaching errorHandler.
router.get('/confirm', confirmConsent)
router.post('/confirm', confirmConsentPost)

router.get('/check', requireAuth, checkConsent)
router.post('/send', requireAuth, mediumLimiter, sendConsent)
router.post('/resend', requireAuth, mediumLimiter, sendConsent)
router.post('/upload', requireAuth, strictLimiter, consentUpload.single('consentFile'), verifyFileSignature(documentKinds), uploadConsent)

export default router
