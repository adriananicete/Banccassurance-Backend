import * as auditModel from '../models/auditModel.js'

export const record = async ({ actorUserCode, action, entityType, entityId, detail }) => {
  await auditModel
    .insert({ actorUserCode, action, entityType, entityId, detail })
    .run()
}
