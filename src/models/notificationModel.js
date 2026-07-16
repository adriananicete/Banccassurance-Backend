import sql from '../config/db.js'

export const insert = (userCode, message) => {
  const request = new sql.Request()
  request.input('UserCode', sql.NVarChar, userCode)
  request.input('Message', sql.NVarChar, message)
  return {
    request,
    run: () => request.query(`
      INSERT INTO [banc].[Notifications] ([UserCode], [Message], [IsRead], [CreatedAt])
      VALUES (@UserCode, @Message, 0, GETDATE())
    `)
  }
}

export const getByUserCode = (userCode) => {
  const request = new sql.Request()
  request.input('CleanUserCode', sql.NVarChar, userCode)
  return {
    request,
    run: () => request.query(`
      SELECT [Id], [UserCode], [Message], [IsRead], [CreatedAt]
      FROM [banc].[Notifications]
      WHERE [UserCode] = @CleanUserCode
      ORDER BY [CreatedAt] DESC
    `)
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

export const markAsRead = (id) => {
  const request = new sql.Request()
  request.input('Id', sql.Int, id)
  return {
    request,
    run: () => request.query(`
      UPDATE [banc].[Notifications]
      SET [IsRead] = 1
      WHERE [Id] = @Id
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
