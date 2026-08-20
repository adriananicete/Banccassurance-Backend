import * as notificationService from '../services/notificationService.js'

export const getUserNotifications = async (req, res, next) => {
  try {
    let { page, pageSize, unreadOnly } = req.query;

    page = parseInt(page, 10);
    if (isNaN(page) || page < 1) page = 1;

    pageSize = parseInt(pageSize, 10);
    if (isNaN(pageSize) || pageSize < 1) pageSize = 20;
    if (pageSize > 100) pageSize = 100;

    const options = {
      PageNumber: page,
      PageSize: pageSize,
      UnreadOnly: unreadOnly === 'true' ? 1 : 0
    };

    const result = await notificationService.getUserNotifications(req.user.UserCode, options);
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