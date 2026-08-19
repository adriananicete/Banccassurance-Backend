import * as notificationModel from '../models/notificationModel.js'
import { throwHttpError } from '../utils/error.js'

export const getUserNotifications = async (userCode) => {
  if (!userCode || userCode === 'undefined' || userCode === 'null') {
    return { success: true, notifications: [] }
  }

  const result = await notificationModel.getByUserCode(String(userCode).trim()).run()

  return { success: true, notifications: result.recordset }
};

export const clearUserNotifications = async (userCode) => {
  if (!userCode || userCode === 'undefined') {
    throwHttpError(400, 'UserCode is required')
  }

  await notificationModel.deleteByUserCode(String(userCode).trim()).run()

  return { success: true, message: 'Notifications cleared successfully.' }
};

export const markNotificationAsRead = async (id, userCode) => {
  const notificationId = Number(id)

  if (!Number.isInteger(notificationId) || notificationId <= 0) {
    throwHttpError(400, 'Notification ID must be a positive whole number.')
  }

  await notificationModel.markAsRead(notificationId, userCode).run()

  return { success: true, message: 'Notification marked as read.' }
};

export const markAllNotificationsAsRead = async (userCode) => {
  if (!userCode || userCode === 'undefined') {
    throwHttpError(400, 'UserCode is required')
  }

  await notificationModel.markAllAsRead(String(userCode).trim()).run()

  return { success: true, message: 'All notifications marked as read.' }
};

export const safeNotify = async (userCode, message) => {
  try {
    await notificationModel.insert(userCode, message).run()
  } catch (error) {
    console.error(`safeNotify failed for ${userCode}:`, error)
  }  
};