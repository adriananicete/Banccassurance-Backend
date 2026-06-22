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
  getUserNotifications,
  clearUserNotifications,
  markNotificationAsRead,     
  markAllNotificationsAsRead
} from '../controllers/referralController.js'
import multer from 'multer'

const router = express.Router()
const upload = multer({ dest: 'uploads/' })

// ==========================================
// ⭐ 1. LITERAL NOTIFICATION ROUTES (ABSOLUTE TOP)
// ==========================================
// Putting these at the absolute peak guarantees Express never mistakes them for a generic dynamic parameter.
router.get('/notifications', getUserNotifications)
router.post('/notifications/clear', clearUserNotifications)
router.put('/notifications/mark-all-read', markAllNotificationsAsRead)
router.put('/notifications/:id/read', markNotificationAsRead)

// ==========================================
// 2. Static / Fixed text routes 
// ==========================================
router.post('/', createReferral)
router.post('/send-consent', sendConsent)
router.post('/resend-consent', sendConsent)
router.get('/confirm-consent', confirmConsent)
router.get('/check-consent', checkConsent)
router.get('/plans', getPlans)
router.get('/', getReferrals)

// ==========================================
// 3. Specific routes with sub-parameters
// ==========================================
router.get('/referrer/:code', getReferrerByCode)
router.put('/:id/profiling', updateReferralProfiling)
router.put('/:id/status', updateReferralStatus)
router.post('/upload-consent', upload.single('consentFile'), uploadConsent)
router.post('/list', getReferrals) 

// ==========================================
// 4. Generic ID route (MUST BE AT THE VERY BOTTOM)
// ==========================================
router.get('/:id', getReferralById)

export default router