import sql from '../config/db.js'
import { asInt, asText } from '../utils/sqlValue.js'

export const insert = ({ actorUserCode, action, entityType, entityId, detail }, transaction) => {
  const request = transaction ? new sql.Request(transaction) : new sql.Request()
  request.input('ActorUserCode', sql.NVarChar, asText(actorUserCode))
  request.input('Action', sql.NVarChar, asText(action))
  request.input('EntityType', sql.NVarChar, asText(entityType))
  request.input('EntityId', sql.NVarChar, asText(entityId))
  request.input('Detail', sql.NVarChar(sql.MAX), asText(detail))
  return {
    request,
    run: () => request.query(`
      INSERT INTO [banc].[AuditLog]
        ([ActorUserCode], [Action], [EntityType], [EntityId], [Detail], [CreatedAt])
      VALUES
        (@ActorUserCode, @Action, @EntityType, @EntityId, @Detail, SYSUTCDATETIME())
    `)
  }
}

export const list = (options = {}) => {
  const request = new sql.Request()
  request.input('Action', sql.NVarChar, asText(options.Action))
  request.input('ActorUserCode', sql.NVarChar, asText(options.ActorUserCode))
  request.input('EntityId', sql.NVarChar, asText(options.EntityId))
  request.input('DateFrom', sql.Date, options.DateFrom ?? null)
  request.input('DateTo', sql.Date, options.DateTo ?? null)
  request.input('PageNumber', sql.Int, asInt(options.PageNumber) ?? 1)
  request.input('PageSize', sql.Int, asInt(options.PageSize) ?? 20)
  return {
    request,
    run: () => request.query(`
      SELECT
        [Id], [ActorUserCode], [Action], [EntityType], [EntityId], [Detail], [CreatedAt],
        COUNT(*) OVER() AS TotalCount
      FROM [banc].[AuditLog]
      WHERE (@Action        IS NULL OR [Action] = @Action)
        AND (@ActorUserCode IS NULL OR [ActorUserCode] = @ActorUserCode)
        AND (@EntityId      IS NULL OR [EntityId] = @EntityId)
        AND (@DateFrom      IS NULL OR [CreatedAt] >= @DateFrom)
        AND (@DateTo        IS NULL OR [CreatedAt] < DATEADD(day, 1, @DateTo))
      ORDER BY [CreatedAt] DESC, [Id] DESC
      OFFSET (@PageNumber - 1) * @PageSize ROWS
      FETCH NEXT @PageSize ROWS ONLY
    `)
  }
}
