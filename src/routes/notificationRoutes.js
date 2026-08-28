import express from 'express';
import { clearUserNotifications, getUserNotifications, markAllNotificationsAsRead, markNotificationAsRead } from '../controllers/notificationController.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, getUserNotifications);
router.post('/clear',requireAuth, clearUserNotifications);
router.put('/mark-all-read',requireAuth, markAllNotificationsAsRead);
router.put('/:id/read',requireAuth, markNotificationAsRead);

export default router;