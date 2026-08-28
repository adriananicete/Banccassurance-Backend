import express from 'express'
import { getAuditLog } from '../controllers/auditController.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { SUPERADMIN } from '../utils/constant.js'

const router = express.Router()

router.get('/', requireAuth, requireRole(SUPERADMIN), getAuditLog)

export default router
