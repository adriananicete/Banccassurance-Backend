import * as auditModel from '../models/auditModel.js'

// Deliberately does not swallow failures, unlike safeNotify next door. A missing
// notification is an inconvenience; an unlogged administrative action is the thing
// this table exists to prevent, so the write is allowed to fail the request.
export const record = async ({ actorUserCode, action, entityType, entityId, detail }) => {
  await auditModel
    .insert({ actorUserCode, action, entityType, entityId, detail })
    .run()
}
