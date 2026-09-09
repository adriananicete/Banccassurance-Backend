import express from 'express'
import { getSummary, getDashboard, exportReferrals } from '../controllers/reportController.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

router.get('/dashboard', requireAuth, getDashboard)
router.get('/summary', requireAuth, getSummary)
router.get('/export', requireAuth, exportReferrals)

export default router
