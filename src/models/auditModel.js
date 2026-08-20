import sql from '../config/db.js'
import { asText } from '../utils/sqlValue.js'

// `transaction` is optional. Passed, the row is written on that transaction so a
// scope change and its audit entry commit or roll back together; omitted, it
// behaves as it always has, on its own connection.
export const insert = ({ actorUserCode, action, entityType, entityId, detail }, transaction) => {
  const request = transaction ? new sql.Request(transaction) : new sql.Request()
  request.input('ActorUserCode', sql.NVarChar, asText(actorUserCode))
  request.input('Action', sql.NVarChar, asText(action))
  request.input('EntityType', sql.NVarChar, asText(entityType))
  request.input('EntityId', sql.NVarChar, asText(entityId))
  request.input('Detail', sql.NVarChar(sql.MAX), asText(detail))
  return {
    request,
    // Written in UTC, matching banc.Notifications. Referrals.CreatedAt uses
    // GETDATE(), so the two are eight hours apart and not comparable.
    run: () => request.query(`
      INSERT INTO [banc].[AuditLog]
        ([ActorUserCode], [Action], [EntityType], [EntityId], [Detail], [CreatedAt])
      VALUES
        (@ActorUserCode, @Action, @EntityType, @EntityId, @Detail, SYSUTCDATETIME())
    `)
  }
}
