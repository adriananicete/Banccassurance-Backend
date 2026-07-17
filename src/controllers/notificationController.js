import * as notificationService from '../services/notificationService.js'

export const getUserNotifications = async (req, res, next) => {
  try {
    const { userCode } = req.query;
    const result = await notificationService.getUserNotifications(userCode);
    return res.json(result);
  } catch (error) {
    next(error)
  }
};

export const clearUserNotifications = async (req, res, next) => {
  try {
    const { userCode } = req.body;
    const result = await notificationService.clearUserNotifications(userCode);
    return res.json(result);
  } catch (error) {
    next(error)
  }
};

export const markNotificationAsRead = async (req, res, next) => {
  try {
    const { id } = req.params; // Expects Notification ID
    const result = await notificationService.markNotificationAsRead(id);
    return res.json(result);
  } catch (error) {
    next(error)
  }
};

export const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const { userCode } = req.body;
    const result =
      await notificationService.markAllNotificationsAsRead(userCode);
    return res.json(result);
  } catch (error) {
    next(error)
  }
};