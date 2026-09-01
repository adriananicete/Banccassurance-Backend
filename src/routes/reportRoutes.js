import express from 'express'
import { getSummary, exportReferrals } from '../controllers/reportController.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

router.get('/summary', requireAuth, getSummary)
router.get('/export', requireAuth, exportReferrals)

export default router
