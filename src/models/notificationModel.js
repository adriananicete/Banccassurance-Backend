import sql from '../config/db.js'

export const insert = (userCode, message) => {
  const request = new sql.Request()
  request.input('UserCode', sql.NVarChar, userCode)
  request.input('Message', sql.NVarChar, message)
  return {
    request,
    run: () => request.query(`
      INSERT INTO [banc].[Notifications] ([UserCode], [Message], [IsRead], [CreatedAt])
      VALUES (@UserCode, @Message, 0, SYSUTCDATETIME())
    `)
  }
}

export const getByUserCode = (userCode, options = {}) => {
  const request = new sql.Request()
  request.input('UserCode', sql.NVarChar, userCode)
  request.input('PageNumber', sql.Int, options.PageNumber)
  request.input('PageSize', sql.Int, options.PageSize)
  request.input('UnreadOnly', sql.Bit, options.UnreadOnly)
  return {
    request,
    run: () => request.execute('banc.usp_sel_notifications_by_user')
  }
}

export const deleteByUserCode = (userCode) => {
  const request = new sql.Request()
  request.input('CleanUserCode', sql.NVarChar, userCode)
  return {
    request,
    run: () => request.query(`
      DELETE FROM [banc].[Notifications]
      WHERE [UserCode] = @CleanUserCode
    `)
  }
}

export const markAsRead = (id, userCode) => {
  const request = new sql.Request()
  request.input('Id', sql.Int, id)
  request.input('UserCode', sql.NVarChar, userCode)
  return {
    request,
    run: () => request.query(`
      UPDATE [banc].[Notifications]
SET [IsRead] = 1
WHERE [Id] = @Id AND [UserCode] = @UserCode
    `)
  }
}

export const markAllAsRead = (userCode) => {
  const request = new sql.Request()
  request.input('CleanUserCode', sql.NVarChar, userCode)
  return {
    request,
    run: () => request.query(`
      UPDATE [banc].[Notifications]
      SET [IsRead] = 1
      WHERE [UserCode] = @CleanUserCode AND [IsRead] = 0
    `)
  }
}
