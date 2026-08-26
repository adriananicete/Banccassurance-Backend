import * as auditService from '../services/auditService.js'
import { paging } from '../utils/paging.js'

export const getAuditLog = async (req, res, next) => {
  try {
    const { action, actorUserCode, entityId, dateFrom, dateTo } = req.query

    const result = await auditService.list(req.user, {
      ...paging(req.query),
      Action: action || null,
      ActorUserCode: actorUserCode || null,
      EntityId: entityId || null,
      DateFrom: !isNaN(Date.parse(dateFrom)) ? dateFrom : null,
      DateTo: !isNaN(Date.parse(dateTo)) ? dateTo : null
    })

    return res.json({ success: true, ...result })
  } catch (error) {
    next(error)
  }
}
