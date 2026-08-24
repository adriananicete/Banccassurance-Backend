import * as auditModel from '../models/auditModel.js'
import { SUPERADMIN } from '../utils/constant.js'
import { throwHttpError } from '../utils/error.js'

export const record = async ({ actorUserCode, action, entityType, entityId, detail }) => {
  await auditModel
    .insert({ actorUserCode, action, entityType, entityId, detail })
    .run()
}

export const list = async (user, options) => {
  if (user.Role !== SUPERADMIN) throwHttpError(403, 'Forbidden')

  const result = await auditModel.list(options).run()

  const totalCount = result.recordset[0]?.TotalCount ?? 0
  const rows = result.recordset.map(({ TotalCount, ...rest }) => rest)

  return {
    data: rows,
    pagination: {
      page: options.PageNumber,
      pageSize: options.PageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / options.PageSize)
    }
  }
}
