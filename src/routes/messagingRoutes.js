import express from 'express'
import { canMessage } from '../controllers/messagingController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { messagingRoles } from '../utils/constant.js'

const router = express.Router()

// The route refuses the three roles with no messaging, so they get a 403 rather
// than an empty answer. The service checks the same list again -- the route
// cannot see who the target is, and the rule belongs with the rule.
router.get('/can/:userCode', requireAuth, requireRole(...messagingRoles), canMessage)

export default router
