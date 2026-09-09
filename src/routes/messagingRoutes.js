import express from 'express'
import {
  canMessage,
  listConversations,
  openConversation,
} from '../controllers/messagingController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { messagingRoles } from '../utils/constant.js'

const router = express.Router()

// The route refuses the three roles with no messaging, so they get a 403 rather
// than an empty answer. The service checks the same list again -- the route
// cannot see who the target is, and the rule belongs with the rule.
router.get('/can/:userCode', requireAuth, requireRole(...messagingRoles), canMessage)

// /conversations sits above nothing that could swallow it today, but the
// referral and user routers have both been bitten by a static path declared
// below a /:id one. Keep the static paths first as a habit.
router.get('/conversations', requireAuth, requireRole(...messagingRoles), listConversations)
router.post('/conversations', requireAuth, requireRole(...messagingRoles), openConversation)

export default router
