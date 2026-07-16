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
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()
const upload = multer({ dest: 'uploads/' })

// ==========================================
// ⭐ 1. LITERAL NOTIFICATION ROUTES (ABSOLUTE TOP)
// ==========================================
// Putting these at the absolute peak guarantees Express never mistakes them for a generic dynamic parameter.
// All notification routes are staff-only (authenticated).
router.get('/notifications', requireAuth, getUserNotifications)
router.post('/notifications/clear', requireAuth, clearUserNotifications)
router.put('/notifications/mark-all-read', requireAuth, markAllNotificationsAsRead)
router.put('/notifications/:id/read', requireAuth, markNotificationAsRead)

// ==========================================
// 2. Static / Fixed text routes
// ==========================================
// createReferral is staff-initiated (referring staff must be logged in).
router.post('/', requireAuth, createReferral)
// Consent flow — hit by the end client via emailed links, no login exists at that point.
router.post('/send-consent', sendConsent)
router.post('/resend-consent', sendConsent)
router.get('/confirm-consent', confirmConsent)
router.get('/check-consent', checkConsent)
router.get('/plans', requireAuth, getPlans)
router.get('/', requireAuth, getReferrals)

// ==========================================
// 3. Specific routes with sub-parameters
// ==========================================
router.get('/referrer/:code', requireAuth, getReferrerByCode)
// Profiling is filled by the end client via the emailed consent-flow link — stays public.
router.put('/:id/profiling', updateReferralProfiling)
router.put('/:id/status', requireAuth, updateReferralStatus)
router.post('/upload-consent', upload.single('consentFile'), uploadConsent)
router.post('/list', requireAuth, getReferrals)

// ==========================================
// 4. Generic ID route (MUST BE AT THE VERY BOTTOM)
// ==========================================
router.get('/:id', requireAuth, getReferralById)

export default router