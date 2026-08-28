import * as notificationModel from '../models/notificationModel.js'
import { throwHttpError } from '../utils/error.js'

const emptyPage = (options) => ({
  success: true,
  notifications: [],
  unreadCount: 0,
  pagination: {
    page: options.PageNumber,
    pageSize: options.PageSize,
    totalCount: 0,
    totalPages: 0
  }
})

export const getUserNotifications = async (userCode, options) => {
  if (!userCode || userCode === 'undefined' || userCode === 'null') {
    return emptyPage(options)
  }

  const result = await notificationModel
    .getByUserCode(String(userCode).trim(), options)
    .run()

  const totalCount = result.recordset[0]?.TotalCount ?? 0
  const unreadCount = result.recordset[0]?.UnreadCount ?? 0
  const notifications = result.recordset.map(
    ({ TotalCount, UnreadCount, ...rest }) => rest
  )

  return {
    success: true,
    notifications,
    unreadCount,
    pagination: {
      page: options.PageNumber,
      pageSize: options.PageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / options.PageSize)
    }
  }
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