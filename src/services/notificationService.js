import * as notificationModel from '../models/notificationModel.js'
import { throwHttpError } from '../utils/error.js'

export const getUserNotifications = async (userCode) => {
  if (!userCode || userCode === 'undefined' || userCode === 'null') {
    return { success: true, notifications: [] }
  }

  const result = await notificationModel.getByUserCode(String(userCode).trim()).run()

  return { success: true, notifications: result.recordset }
}

export const clearUserNotifications = async (userCode) => {
  if (!userCode || userCode === 'undefined') {
    throwHttpError(400, 'UserCode is required')
  }

  await notificationModel.deleteByUserCode(String(userCode).trim()).run()

  return { success: true, message: 'Notifications cleared successfully.' }
}

export const markNotificationAsRead = async (id, userCode) => {
  if (!id) {
    throwHttpError(400, 'Notification ID is required')
  }

  await notificationModel.markAsRead(parseInt(id, 10), userCode).run()

  return { success: true, message: 'Notification marked as read.' }
}

export const markAllNotificationsAsRead = async (userCode) => {
  if (!userCode || userCode === 'undefined') {
    throwHttpError(400, 'UserCode is required')
  }

  await notificationModel.markAllAsRead(String(userCode).trim()).run()

  return { success: true, message: 'All notifications marked as read.' }
}
