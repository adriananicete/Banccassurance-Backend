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
  uploadConsent
} from '../controllers/referralController.js'
import multer from 'multer'

const router = express.Router()
const upload = multer({ dest: 'uploads/' })

// 1. Static routes (Must come first)
router.post('/', createReferral)
router.post('/send-consent', sendConsent)
router.post('/resend-consent', sendConsent)
router.get('/confirm-consent', confirmConsent)
router.get('/check-consent', checkConsent)
router.get('/plans', getPlans)
router.get('/', getReferrals)

// 2. Specific routes with parameters (Put these before generic :id routes)
router.get('/referrer/:code', getReferrerByCode)
router.put('/:id/profiling', updateReferralProfiling)
router.put('/:id/status', updateReferralStatus)

// 3. Generic ID route (Must be last to avoid catching the others)
router.get('/:id', getReferralById)
router.post('/upload-consent', upload.single('consentFile'), uploadConsent)
router.post('/list', getReferrals) 

export default router