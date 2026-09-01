import express from 'express'
import { getRegions, getGroups, getBranches, getPlans } from '../controllers/lookupController.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

router.get('/regions', getRegions)
router.get('/groups', getGroups)
router.get('/branches', getBranches)
router.get('/plans', requireAuth, getPlans)

export default router
