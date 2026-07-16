import * as notificationModel from '../models/notificationModel.js'

export const getUserNotifications = async (userCode) => {
  if (!userCode || userCode === 'undefined' || userCode === 'null') {
    return { success: true, notifications: [] }
  }

  const result = await notificationModel.getByUserCode(String(userCode).trim()).run()

  return { success: true, notifications: result.recordset }
}

export const clearUserNotifications = async (userCode) => {
  if (!userCode || userCode === 'undefined') {
    const err = new Error('UserCode is required')
    err.statusCode = 400
    throw err
  }

  await notificationModel.deleteByUserCode(String(userCode).trim()).run()

  return { success: true, message: 'Notifications cleared successfully.' }
}

export const markNotificationAsRead = async (id) => {
  if (!id) {
    const err = new Error('Notification ID is required')
    err.statusCode = 400
    throw err
  }

  await notificationModel.markAsRead(parseInt(id, 10)).run()

  return { success: true, message: 'Notification marked as read.' }
}

export const markAllNotificationsAsRead = async (userCode) => {
  if (!userCode || userCode === 'undefined') {
    const err = new Error('UserCode is required')
    err.statusCode = 400
    throw err
  }

  await notificationModel.markAllAsRead(String(userCode).trim()).run()

  return { success: true, message: 'All notifications marked as read.' }
}
