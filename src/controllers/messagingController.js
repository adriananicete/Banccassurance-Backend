import * as messagingService from "../services/messagingService.js";
import { paging } from "../utils/paging.js";

export const canMessage = async (req, res, next) => {
  try {
    const target = await messagingService.assertCanMessage(
      req.user,
      req.params.userCode,
    );

    res.json({
      success: true,
      data: { userCode: target.UserCode, fullName: target.FullName, role: target.Role },
    });
  } catch (error) {
    next(error);
  }
};

export const openConversation = async (req, res, next) => {
  try {
    const { conversation, created } = await messagingService.openDirectConversation(
      req.user,
      req.body?.userCode,
    );

    res.status(created ? 201 : 200).json({ success: true, data: conversation });
  } catch (error) {
    next(error);
  }
};

export const listConversations = async (req, res, next) => {
  try {
    const result = await messagingService.listConversations(req.user, paging(req.query));

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

export const readConversation = async (req, res, next) => {
  try {
    const result = await messagingService.readConversation(
      req.user,
      req.params.id,
      paging(req.query),
    );

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const message = await messagingService.sendMessage(
      req.user,
      req.params.id,
      req.body?.body,
    );

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
};

export const markRead = async (req, res, next) => {
  try {
    const result = await messagingService.markConversationRead(req.user, req.params.id);

    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const unreadCount = async (req, res, next) => {
  try {
    const result = await messagingService.getUnreadCount(req.user);

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};
