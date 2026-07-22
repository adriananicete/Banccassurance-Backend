import * as notificationService from '../services/notificationService.js'

export const getUserNotifications = async (req, res, next) => {
  try {
    const result = await notificationService.getUserNotifications(req.user.UserCode);
    return res.json(result);
  } catch (error) {
    next(error)
  }
};

export const clearUserNotifications = async (req, res, next) => {
  try {
    const result = await notificationService.clearUserNotifications(req.user.UserCode);
    return res.json(result);
  } catch (error) {
    next(error)
  }
};

export const markNotificationAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await notificationService.markNotificationAsRead(id, req.user.UserCode);
    return res.json(result);
  } catch (error) {
    next(error)
  }
};

export const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    const result =
      await notificationService.markAllNotificationsAsRead(req.user.UserCode);
    return res.json(result);
  } catch (error) {
    next(error)
  }
};