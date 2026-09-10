import express from 'express'
import {
  canMessage,
  listConversations,
  markRead,
  openConversation,
  readConversation,
  sendMessage,
  unreadCount,
} from '../controllers/messagingController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { messageLimiter } from '../middleware/rateLimiter.js'
import { messagingRoles } from '../utils/constant.js'

const router = express.Router()

const mayMessage = [requireAuth, requireRole(...messagingRoles)]

// ⚠️ Every static path sits above the first /:id one. referralRoutes and
// userRoutes have both been bitten by this: a static path declared below a
// param route is swallowed rather than 404, and surfaces as a 400 about a
// malformed id, which sends a frontend developer looking in their own code.
router.get('/can/:userCode', ...mayMessage, canMessage)
router.get('/unread-count', ...mayMessage, unreadCount)
router.get('/conversations', ...mayMessage, listConversations)
router.post('/conversations', ...mayMessage, openConversation)

router.get('/conversations/:id', ...mayMessage, readConversation)
router.put('/conversations/:id/read', ...mayMessage, markRead)

router.post('/conversations/:id', ...mayMessage, messageLimiter, sendMessage)

export default router
