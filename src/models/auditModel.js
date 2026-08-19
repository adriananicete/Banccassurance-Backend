import sql from '../config/db.js'
import { asText } from '../utils/sqlValue.js'

export const insert = ({ actorUserCode, action, entityType, entityId, detail }) => {
  const request = new sql.Request()
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
