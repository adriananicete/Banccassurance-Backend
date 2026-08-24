import * as auditService from '../services/auditService.js'

export const getAuditLog = async (req, res, next) => {
  try {
    let { page, pageSize, action, actorUserCode, entityId, dateFrom, dateTo } = req.query

    page = parseInt(page, 10)
    if (isNaN(page) || page < 1) page = 1

    pageSize = parseInt(pageSize, 10)
    if (isNaN(pageSize) || pageSize < 1) pageSize = 20
    if (pageSize > 100) pageSize = 100

    const result = await auditService.list(req.user, {
      PageNumber: page,
      PageSize: pageSize,
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
